import type { DestinoNotificacion, Notificacion } from "../../domain/entities";
import type { Queryable } from "../database/pool";

const mapear = (r: any): Notificacion => ({
  id: r.id,
  destino: r.destino,
  pedidoId: r.pedido_id,
  mensaje: r.mensaje,
  creadaEn: r.creada_en,
});

export class NotificacionRepository {
  constructor(private readonly db: Queryable) {}

  async crear(destino: DestinoNotificacion, pedidoId: number | null, mensaje: string): Promise<void> {
    await this.db.query("INSERT INTO notificaciones (destino, pedido_id, mensaje) VALUES ($1,$2,$3)", [
      destino,
      pedidoId,
      mensaje,
    ]);
  }

  async listar(filtro: { destino?: DestinoNotificacion; pedidoId?: number }): Promise<Notificacion[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filtro.destino) {
      params.push(filtro.destino);
      where.push(`destino = $${params.length}`);
    }
    if (filtro.pedidoId) {
      params.push(filtro.pedidoId);
      where.push(`pedido_id = $${params.length}`);
    }
    const { rows } = await this.db.query(
      `SELECT * FROM notificaciones ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id`,
      params,
    );
    return rows.map(mapear);
  }
}
