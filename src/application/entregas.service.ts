import { conflicto, noEncontrado } from "../domain/errors";
import { asegurarTransicion, TRANSICIONES_ENTREGA } from "../domain/reglas";
import type { Entrega, EstadoEntrega } from "../domain/entities";
import type { UnidadDeTrabajo } from "../persistence/unit-of-work";

/** CU-04: gestionar envío a domicilio (F-03). */
export class EntregasService {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  /** Pedidos a domicilio listos que aún no tienen repartidor. */
  pendientesDeTomar() {
    return this.uow.lectura.pedidos
      .listar({ estado: ["LISTO"], tipo: "DOMICILIO" })
      .then(async (pedidos) => {
        const tomadas = new Set((await this.uow.lectura.entregas.listar({})).map((e) => e.pedidoId));
        return pedidos.filter((p) => !tomadas.has(p.id));
      });
  }

  tomar(pedidoId: number, repartidor: string): Promise<Entrega> {
    return this.uow.transaccion(async (r) => {
      const pedido = await r.pedidos.obtenerBloqueando(pedidoId);
      if (!pedido) throw noEncontrado("PEDIDO_NO_ENCONTRADO", `No existe el pedido ${pedidoId}`);
      if (pedido.tipo !== "DOMICILIO") {
        throw conflicto("PEDIDO_NO_ES_DOMICILIO", "Solo los pedidos a domicilio tienen entrega");
      }
      if (pedido.estado !== "LISTO") {
        throw conflicto(
          "PEDIDO_NO_LISTO",
          `El pedido debe estar LISTO para ser tomado (actual: ${pedido.estado})`,
          { estadoActual: pedido.estado },
        );
      }
      const id = await r.entregas.crear(pedidoId, repartidor);
      return (await r.entregas.obtener(id))!;
    });
  }

  async obtener(id: number): Promise<Entrega> {
    const e = await this.uow.lectura.entregas.obtener(id);
    if (!e) throw noEncontrado("ENTREGA_NO_ENCONTRADA", `No existe la entrega ${id}`);
    return e;
  }

  listar(filtro: { estado?: EstadoEntrega; repartidor?: string }) {
    return this.uow.lectura.entregas.listar(filtro);
  }

  enCamino(id: number): Promise<Entrega> {
    return this.uow.transaccion(async (r) => {
      const e = await this.bloquear(r, id);
      asegurarTransicion(TRANSICIONES_ENTREGA, e.estado, "EN_CAMINO", "la entrega");
      await r.entregas.marcarEnCamino(id);
      return (await r.entregas.obtener(id))!;
    });
  }

  /** Entregado: cierra el pedido (queda pagado o no, según el cobro). */
  entregado(id: number): Promise<Entrega> {
    return this.uow.transaccion(async (r) => {
      const e = await this.bloquear(r, id);
      asegurarTransicion(TRANSICIONES_ENTREGA, e.estado, "ENTREGADO", "la entrega");
      await r.entregas.finalizar(id, "ENTREGADO", null);
      await r.pedidos.actualizarEstado(e.pedidoId, "CERRADO");
      return (await r.entregas.obtener(id))!;
    });
  }

  /** Cliente ilocalizable: la entrega y el pedido pasan a DEVUELTO. */
  devuelto(id: number, motivo: string): Promise<Entrega> {
    return this.uow.transaccion(async (r) => {
      const e = await this.bloquear(r, id);
      asegurarTransicion(TRANSICIONES_ENTREGA, e.estado, "DEVUELTO", "la entrega");
      await r.entregas.finalizar(id, "DEVUELTO", motivo);
      await r.pedidos.actualizarEstado(e.pedidoId, "DEVUELTO");
      await r.notificaciones.crear(
        "SALON",
        e.pedidoId,
        `Pedido #${e.pedidoId} devuelto: ${motivo}`,
      );
      return (await r.entregas.obtener(id))!;
    });
  }

  private async bloquear(r: import("../persistence/unit-of-work").Repositorios, id: number) {
    const e = await r.entregas.obtenerBloqueando(id);
    if (!e) throw noEncontrado("ENTREGA_NO_ENCONTRADA", `No existe la entrega ${id}`);
    return e;
  }
}
