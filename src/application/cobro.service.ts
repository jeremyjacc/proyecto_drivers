import { conflicto, noEncontrado, pagoDenegado } from "../domain/errors";
import { evaluarPago } from "../domain/reglas";
import type { MetodoPago, Pago, Pedido, ConsumoIngrediente } from "../domain/entities";
import type { UnidadDeTrabajo } from "../persistence/unit-of-work";

export interface DatosCobro {
  pedidoId: number;
  metodo: MetodoPago;
  montoRecibido?: number;
  resultadoAutorizacion?: "APROBADO" | "DENEGADO";
  motivoDenegacion?: string;
  referencia?: string;
}

export interface ResultadoCobro {
  pago: Pago;
  pedido: Pedido;
  cambio: number;
  ingredientesDescontados: ConsumoIngrediente[];
}

/** CU-03: cobrar y descontar inventario según recetas (F-01). */
export class CobroService {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  /** El total lo calcula el sistema a partir del pedido (no se acepta del cliente). */
  async totalDelPedido(pedidoId: number): Promise<{ pedidoId: number; total: number; pagoEstado: string }> {
    const p = await this.uow.lectura.pedidos.obtener(pedidoId);
    if (!p) throw noEncontrado("PEDIDO_NO_ENCONTRADO", `No existe el pedido ${pedidoId}`);
    return { pedidoId: p.id, total: p.total, pagoEstado: p.pagoEstado };
  }

  async cobrar(datos: DatosCobro): Promise<ResultadoCobro> {
    const resultado = await this.uow.transaccion(async (r) => {
      const pedido = await r.pedidos.obtenerBloqueando(datos.pedidoId);
      if (!pedido) throw noEncontrado("PEDIDO_NO_ENCONTRADO", `No existe el pedido ${datos.pedidoId}`);
      if (pedido.pagoEstado === "PAGADO") {
        throw conflicto("PEDIDO_YA_PAGADO", "El pedido ya fue cobrado", { pedidoId: pedido.id });
      }
      // Precondición de CU-03: pedido "Listo" o, en domicilio, ya "Entregado" (CERRADO sin pagar).
      const entregadoSinPagar = pedido.tipo === "DOMICILIO" && pedido.estado === "CERRADO";
      if (pedido.estado !== "LISTO" && !entregadoSinPagar) {
        throw conflicto(
          "PEDIDO_NO_COBRABLE",
          `Solo se pueden cobrar pedidos LISTO o entregados a domicilio (actual: ${pedido.estado})`,
          { estadoActual: pedido.estado },
        );
      }

      const evaluacion = evaluarPago({
        metodo: datos.metodo,
        total: pedido.total,
        montoRecibido: datos.montoRecibido,
        resultadoAutorizacion: datos.resultadoAutorizacion,
        motivoDenegacion: datos.motivoDenegacion,
      });

      if (!evaluacion.aprobado) {
        // Se registra el intento denegado; NO se descuenta inventario ni se cierra la orden.
        await r.pagos.registrar({
          pedidoId: pedido.id,
          metodo: datos.metodo,
          total: pedido.total,
          montoRecibido: datos.montoRecibido ?? null,
          resultado: "DENEGADO",
          motivoDenegacion: evaluacion.motivo,
          referencia: datos.referencia ?? null,
        });
        return { denegado: evaluacion.motivo } as const;
      }

      // Descuento exacto por receta, atómico con el cierre de la orden.
      const consumo = await r.inventario.consumoDePedido(pedido.id);
      for (const c of consumo) {
        const ok = await r.inventario.descontar(c.ingredienteId, c.cantidad, pedido.id);
        if (!ok) {
          throw conflicto(
            "INVENTARIO_INCONSISTENTE",
            `Existencias insuficientes de ${c.ingrediente} al descontar; el cobro fue revertido`,
            { ingredienteId: c.ingredienteId, requerido: c.cantidad },
          );
        }
      }
      const pago = await r.pagos.registrar({
        pedidoId: pedido.id,
        metodo: datos.metodo,
        total: pedido.total,
        montoRecibido: datos.montoRecibido ?? null,
        resultado: "APROBADO",
        motivoDenegacion: null,
        referencia: datos.referencia ?? null,
      });
      // Mesa: se cierra al cobrar. Domicilio: queda pagado y se cierra al entregarse (CU-04).
      await r.pedidos.marcarPagado(pedido.id, pedido.tipo === "MESA");
      if (pedido.mesa) await r.mesas.liberarSiSinPedidosAbiertos(pedido.mesa.id);
      return {
        pago,
        pedido: (await r.pedidos.obtener(pedido.id))!,
        cambio: evaluacion.cambio,
        ingredientesDescontados: consumo,
      } as const;
    });

    if ("denegado" in resultado) {
      throw pagoDenegado(
        `Pago denegado: ${resultado.denegado}. La orden permanece pendiente de pago.`,
        { pedidoId: datos.pedidoId, pagoEstado: "PENDIENTE_PAGO" },
      );
    }
    return resultado;
  }

  async pagosDelPedido(pedidoId: number): Promise<Pago[]> {
    const p = await this.uow.lectura.pedidos.obtener(pedidoId);
    if (!p) throw noEncontrado("PEDIDO_NO_ENCONTRADO", `No existe el pedido ${pedidoId}`);
    return this.uow.lectura.pagos.listarPorPedido(pedidoId);
  }
}
