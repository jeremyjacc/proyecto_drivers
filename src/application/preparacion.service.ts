import { noEncontrado } from "../domain/errors";
import { asegurarTransicion, TRANSICIONES_PEDIDO } from "../domain/reglas";
import type { Notificacion, Pedido } from "../domain/entities";
import type { UnidadDeTrabajo } from "../persistence/unit-of-work";

/** CU-02: gestionar preparación (F-02). */
export class PreparacionService {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  /** Pedidos visibles para cocina: enviados y en preparación (más antiguos primero). */
  tablero(): Promise<Pedido[]> {
    return this.uow.lectura.pedidos.listar({ estado: ["ENVIADO", "EN_PREPARACION"] });
  }

  iniciar(pedidoId: number): Promise<Pedido> {
    return this.cambiar(pedidoId, "EN_PREPARACION", null);
  }

  /** Al marcar "Listo" se notifica al salón. */
  marcarListo(pedidoId: number): Promise<Pedido> {
    return this.cambiar(pedidoId, "LISTO", (p) => `Pedido #${p.id} listo para servir`);
  }

  notificaciones(filtro: { destino?: "SALON" | "COCINA"; pedidoId?: number }): Promise<Notificacion[]> {
    return this.uow.lectura.notificaciones.listar(filtro);
  }

  private cambiar(
    pedidoId: number,
    nuevo: "EN_PREPARACION" | "LISTO",
    mensajeSalon: ((p: Pedido) => string) | null,
  ): Promise<Pedido> {
    return this.uow.transaccion(async (r) => {
      const pedido = await r.pedidos.obtenerBloqueando(pedidoId);
      if (!pedido) throw noEncontrado("PEDIDO_NO_ENCONTRADO", `No existe el pedido ${pedidoId}`);
      asegurarTransicion(TRANSICIONES_PEDIDO, pedido.estado, nuevo, "el pedido");
      await r.pedidos.actualizarEstado(pedidoId, nuevo);
      if (mensajeSalon) await r.notificaciones.crear("SALON", pedidoId, mensajeSalon(pedido));
      return (await r.pedidos.obtener(pedidoId))!;
    });
  }
}
