import { conflicto, noEncontrado, validacion } from "../domain/errors";
import { asegurarTransicion, evaluarStock, redondear, TRANSICIONES_PEDIDO } from "../domain/reglas";
import type { EstadoPedido, Pedido, TipoPedido } from "../domain/entities";
import type { Repositorios, UnidadDeTrabajo } from "../persistence/unit-of-work";

export interface ItemSolicitado {
  platoId: number;
  cantidad: number;
  nota?: string | null;
}

export interface DatosPedido {
  tipo: TipoPedido;
  mesaId?: number;
  cliente?: { nombre: string; telefono: string };
  direccionEntrega?: string;
  notas?: string | null;
  items: ItemSolicitado[];
}

interface ItemValorado {
  platoId: number;
  cantidad: number;
  precioUnitario: number;
  nota: string | null;
}

/** CU-01: registrar pedido (+ cancelación/modificación antes de preparar, CU-02 alterno). */
export class PedidosService {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  async registrar(datos: DatosPedido): Promise<Pedido> {
    if (datos.tipo === "MESA" && !datos.mesaId) {
      throw validacion("MESA_REQUERIDA", "Un pedido de mesa requiere mesaId");
    }
    if (datos.tipo === "DOMICILIO" && (!datos.cliente || !datos.direccionEntrega)) {
      throw validacion(
        "DATOS_DOMICILIO_REQUERIDOS",
        "Un pedido a domicilio requiere cliente (nombre y teléfono) y direccionEntrega",
      );
    }

    const resultado = await this.uow.transaccion(async (r) => {
      if (datos.tipo === "MESA") {
        const mesa = await r.mesas.obtener(datos.mesaId!);
        if (!mesa) throw noEncontrado("MESA_NO_ENCONTRADA", `No existe la mesa ${datos.mesaId}`);
      }
      const items = await this.valorarYValidarCatalogo(r, datos.items);
      const bloqueados = await this.validarStock(r, items, null);
      if (bloqueados.length) {
        // La notificación al mesero se guarda aunque el pedido se rechace.
        await r.notificaciones.crear(
          "SALON",
          null,
          `Pedido bloqueado por falta de inventario: ${bloqueados.map((b) => b.plato).join(", ")}`,
        );
        return { bloqueados } as const;
      }

      const total = this.total(items);
      const id = await r.pedidos.crear({
        tipo: datos.tipo,
        mesaId: datos.tipo === "MESA" ? datos.mesaId! : null,
        cliente: datos.tipo === "DOMICILIO" ? datos.cliente! : null,
        direccionEntrega: datos.tipo === "DOMICILIO" ? datos.direccionEntrega! : null,
        notas: datos.notas ?? null,
        total,
        items,
      });
      if (datos.tipo === "MESA") await r.mesas.marcarOcupada(datos.mesaId!);
      await r.notificaciones.crear("COCINA", id, `Nuevo pedido #${id} enviado a cocina`);
      return { pedido: (await r.pedidos.obtener(id))! } as const;
    });

    if ("bloqueados" in resultado) {
      throw conflicto(
        "STOCK_INSUFICIENTE",
        "No hay existencias suficientes para algunos platillos; el pedido fue rechazado",
        { platosBloqueados: resultado.bloqueados },
      );
    }
    return resultado.pedido;
  }

  async obtener(id: number): Promise<Pedido> {
    const pedido = await this.uow.lectura.pedidos.obtener(id);
    if (!pedido) throw noEncontrado("PEDIDO_NO_ENCONTRADO", `No existe el pedido ${id}`);
    return pedido;
  }

  listar(filtro: { estado?: EstadoPedido[]; tipo?: TipoPedido }) {
    return this.uow.lectura.pedidos.listar(filtro);
  }

  /** Modificar los platillos solo es posible antes de iniciar la preparación. */
  async modificarItems(id: number, itemsSolicitados: ItemSolicitado[]): Promise<Pedido> {
    const resultado = await this.uow.transaccion(async (r) => {
      const pedido = await r.pedidos.obtenerBloqueando(id);
      if (!pedido) throw noEncontrado("PEDIDO_NO_ENCONTRADO", `No existe el pedido ${id}`);
      if (pedido.estado !== "ENVIADO") {
        throw conflicto(
          "PEDIDO_NO_MODIFICABLE",
          `El pedido ya está ${pedido.estado}; solo se puede modificar antes de iniciar la preparación`,
          { estadoActual: pedido.estado },
        );
      }
      const items = await this.valorarYValidarCatalogo(r, itemsSolicitados);
      const bloqueados = await this.validarStock(r, items, id);
      if (bloqueados.length) {
        await r.notificaciones.crear(
          "SALON",
          id,
          `Modificación del pedido #${id} bloqueada por falta de inventario`,
        );
        return { bloqueados } as const;
      }
      await r.pedidos.reemplazarItems(id, items, this.total(items));
      await r.notificaciones.crear("COCINA", id, `Pedido #${id} modificado antes de preparar`);
      return { pedido: (await r.pedidos.obtener(id))! } as const;
    });
    if ("bloqueados" in resultado) {
      throw conflicto("STOCK_INSUFICIENTE", "No hay existencias suficientes para la modificación", {
        platosBloqueados: resultado.bloqueados,
      });
    }
    return resultado.pedido;
  }

  /** Cancelación permitida solo antes de iniciar la preparación. */
  async cancelar(id: number): Promise<Pedido> {
    return this.uow.transaccion(async (r) => {
      const pedido = await r.pedidos.obtenerBloqueando(id);
      if (!pedido) throw noEncontrado("PEDIDO_NO_ENCONTRADO", `No existe el pedido ${id}`);
      if (pedido.estado !== "ENVIADO") {
        throw conflicto(
          "PEDIDO_NO_CANCELABLE",
          `El pedido ya está ${pedido.estado}; solo se puede cancelar antes de iniciar la preparación`,
          { estadoActual: pedido.estado },
        );
      }
      asegurarTransicion(TRANSICIONES_PEDIDO, pedido.estado, "CANCELADO", "el pedido");
      await r.pedidos.actualizarEstado(id, "CANCELADO");
      if (pedido.mesa) await r.mesas.liberarSiSinPedidosAbiertos(pedido.mesa.id);
      await r.notificaciones.crear("COCINA", id, `Pedido #${id} cancelado por el mesero`);
      return (await r.pedidos.obtener(id))!;
    });
  }

  /* ---------- helpers ---------- */

  private async valorarYValidarCatalogo(
    r: Repositorios,
    solicitados: ItemSolicitado[],
  ): Promise<ItemValorado[]> {
    const ids = [...new Set(solicitados.map((i) => i.platoId))];
    const platos = await r.platos.obtenerPorIds(ids);
    const porId = new Map(platos.map((p) => [p.id, p]));
    const inexistentes = ids.filter((id) => !porId.has(id));
    if (inexistentes.length) {
      throw noEncontrado("PLATO_NO_ENCONTRADO", "Hay platos inexistentes en el pedido", {
        platosInexistentes: inexistentes,
      });
    }
    const inactivos = platos.filter((p) => !p.activo).map((p) => p.id);
    if (inactivos.length) {
      throw conflicto("PLATO_INACTIVO", "Hay platos no disponibles en la carta", {
        platosInactivos: inactivos,
      });
    }
    const sinReceta = platos.filter((p) => p.receta.length === 0).map((p) => p.id);
    if (sinReceta.length) {
      throw conflicto("PLATO_SIN_RECETA", "Hay platos sin receta definida", { platos: sinReceta });
    }
    return solicitados.map((i) => ({
      platoId: i.platoId,
      cantidad: i.cantidad,
      precioUnitario: porId.get(i.platoId)!.precio,
      nota: i.nota ?? null,
    }));
  }

  /** R-01: bloquea existencias y compara contra lo disponible (ya descontando lo comprometido). */
  private async validarStock(r: Repositorios, items: ItemValorado[], excluirPedidoId: number | null) {
    await r.inventario.bloquearPorPlatos([...new Set(items.map((i) => i.platoId))]);
    const filas = await r.inventario.calcularRequerimientos(items, excluirPedidoId);
    return evaluarStock(filas);
  }

  private total(items: ItemValorado[]): number {
    return redondear(items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0));
  }
}
