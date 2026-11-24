import { conflicto } from "../../domain/errors";
import type { Mesa } from "../../domain/entities";
import type { Queryable } from "../database/pool";

const mapear = (r: any): Mesa => ({ id: r.id, numero: r.numero, estado: r.estado });

export class MesaRepository {
  constructor(private readonly db: Queryable) {}

  async crear(numero: number): Promise<Mesa> {
    try {
      const { rows } = await this.db.query(
        "INSERT INTO mesas (numero) VALUES ($1) RETURNING id, numero, estado",
        [numero],
      );
      return mapear(rows[0]);
    } catch (e: any) {
      if (e.code === "23505") throw conflicto("MESA_DUPLICADA", `Ya existe la mesa ${numero}`);
      throw e;
    }
  }

  async obtener(id: number): Promise<Mesa | null> {
    const { rows } = await this.db.query("SELECT id, numero, estado FROM mesas WHERE id = $1", [id]);
    return rows[0] ? mapear(rows[0]) : null;
  }

  async listar(): Promise<Mesa[]> {
    const { rows } = await this.db.query("SELECT id, numero, estado FROM mesas ORDER BY numero");
    return rows.map(mapear);
  }

  async marcarOcupada(id: number): Promise<void> {
    await this.db.query("UPDATE mesas SET estado = 'OCUPADA' WHERE id = $1", [id]);
  }

  /** Libera la mesa solo si ya no tiene pedidos abiertos. */
  async liberarSiSinPedidosAbiertos(id: number): Promise<void> {
    await this.db.query(
      `UPDATE mesas SET estado = 'LIBRE'
        WHERE id = $1
          AND NOT EXISTS (
            SELECT 1 FROM pedidos
             WHERE mesa_id = $1 AND estado IN ('ENVIADO','EN_PREPARACION','LISTO'))`,
      [id],
    );
  }
}
