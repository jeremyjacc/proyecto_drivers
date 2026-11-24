import { conflicto } from "../../domain/errors";
import type { Entrega, EstadoEntrega } from "../../domain/entities";
import type { Queryable } from "../database/pool";

const SELECT_ENTREGA = `
  SELECT e.*, p.direccion_entrega, p.cliente_nombre, p.cliente_telefono
    FROM entregas e JOIN pedidos p ON p.id = e.pedido_id`;

const mapear = (r: any): Entrega => ({
  id: r.id,
  pedidoId: r.pedido_id,
  repartidor: r.repartidor,
  estado: r.estado,
  direccion: r.direccion_entrega,
  cliente: { nombre: r.cliente_nombre, telefono: r.cliente_telefono },
  motivoDevolucion: r.motivo_devolucion,
  tomadaEn: r.tomada_en,
  enCaminoEn: r.en_camino_en,
  finalizadaEn: r.finalizada_en,
});

export class EntregaRepository {
  constructor(private readonly db: Queryable) {}

  async crear(pedidoId: number, repartidor: string): Promise<number> {
    try {
      const { rows } = await this.db.query(
        "INSERT INTO entregas (pedido_id, repartidor) VALUES ($1,$2) RETURNING id",
        [pedidoId, repartidor],
      );
      return rows[0].id;
    } catch (e: any) {
      if (e.code === "23505") {
        throw conflicto("ENTREGA_YA_TOMADA", "Este pedido ya fue tomado por un repartidor");
      }
      throw e;
    }
  }

  async obtener(id: number): Promise<Entrega | null> {
    const { rows } = await this.db.query(`${SELECT_ENTREGA} WHERE e.id = $1`, [id]);
    return rows[0] ? mapear(rows[0]) : null;
  }

  async obtenerBloqueando(id: number): Promise<Entrega | null> {
    const lock = await this.db.query("SELECT id FROM entregas WHERE id = $1 FOR UPDATE", [id]);
    if (!lock.rowCount) return null;
    return this.obtener(id);
  }

  async listar(filtro: { estado?: EstadoEntrega; repartidor?: string }): Promise<Entrega[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filtro.estado) {
      params.push(filtro.estado);
      where.push(`e.estado = $${params.length}`);
    }
    if (filtro.repartidor) {
      params.push(filtro.repartidor);
      where.push(`e.repartidor = $${params.length}`);
    }
    const { rows } = await this.db.query(
      `${SELECT_ENTREGA} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY e.id`,
      params,
    );
    return rows.map(mapear);
  }

  async marcarEnCamino(id: number): Promise<void> {
    await this.db.query(
      "UPDATE entregas SET estado = 'EN_CAMINO', en_camino_en = now() WHERE id = $1",
      [id],
    );
  }

  async finalizar(id: number, estado: "ENTREGADO" | "DEVUELTO", motivo: string | null): Promise<void> {
    await this.db.query(
      "UPDATE entregas SET estado = $2, motivo_devolucion = $3, finalizada_en = now() WHERE id = $1",
      [id, estado, motivo],
    );
  }
}
