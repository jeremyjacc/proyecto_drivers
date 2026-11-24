import type { MetodoPago, Pago, ResultadoPago } from "../../domain/entities";
import type { Queryable } from "../database/pool";

const mapear = (r: any): Pago => ({
  id: r.id,
  pedidoId: r.pedido_id,
  metodo: r.metodo,
  total: Number(r.total),
  montoRecibido: r.monto_recibido === null ? null : Number(r.monto_recibido),
  resultado: r.resultado,
  motivoDenegacion: r.motivo_denegacion,
  referencia: r.referencia,
  creadoEn: r.creado_en,
});

export class PagoRepository {
  constructor(private readonly db: Queryable) {}

  async registrar(p: {
    pedidoId: number;
    metodo: MetodoPago;
    total: number;
    montoRecibido: number | null;
    resultado: ResultadoPago;
    motivoDenegacion: string | null;
    referencia: string | null;
  }): Promise<Pago> {
    const { rows } = await this.db.query(
      `INSERT INTO pagos (pedido_id, metodo, total, monto_recibido, resultado, motivo_denegacion, referencia)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [p.pedidoId, p.metodo, p.total, p.montoRecibido, p.resultado, p.motivoDenegacion, p.referencia],
    );
    return mapear(rows[0]);
  }

  async listarPorPedido(pedidoId: number): Promise<Pago[]> {
    const { rows } = await this.db.query("SELECT * FROM pagos WHERE pedido_id = $1 ORDER BY id", [
      pedidoId,
    ]);
    return rows.map(mapear);
  }
}
