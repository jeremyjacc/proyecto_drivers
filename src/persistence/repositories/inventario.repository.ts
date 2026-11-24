import type {
  ConsumoIngrediente,
  ExistenciaInventario,
  RequerimientoFila,
} from "../../domain/entities";
import type { Queryable } from "../database/pool";

/**
 * Stock comprometido = ingredientes que ya reservan pedidos abiertos
 * (aún no cobrados, ni cancelados ni devueltos). El descuento definitivo
 * ocurre al cobrar (CU-03); aquí solo se calcula lo disponible.
 * $1 = id de pedido a excluir (para modificar un pedido) o NULL.
 */
const CTE_DISPONIBLE = `
  comprometido AS (
    SELECT r.ingrediente_id, SUM(r.cantidad * pi.cantidad) AS qty
      FROM pedido_items pi
      JOIN pedidos p ON p.id = pi.pedido_id
       AND p.estado IN ('ENVIADO','EN_PREPARACION','LISTO','CERRADO')
       AND p.pago_estado = 'PENDIENTE_PAGO'
       AND ($1::int IS NULL OR p.id <> $1::int)
      JOIN recetas r ON r.plato_id = pi.plato_id
     GROUP BY r.ingrediente_id
  ),
  disponible AS (
    SELECT i.ingrediente_id, i.cantidad AS existencia,
           COALESCE(c.qty, 0) AS comprometido,
           i.cantidad - COALESCE(c.qty, 0) AS disp
      FROM inventario i
      LEFT JOIN comprometido c ON c.ingrediente_id = i.ingrediente_id
  )`;

export class InventarioRepository {
  constructor(private readonly db: Queryable) {}

  async inicializar(ingredienteId: number, cantidad: number): Promise<void> {
    await this.db.query("INSERT INTO inventario (ingrediente_id, cantidad) VALUES ($1, $2)", [
      ingredienteId,
      cantidad,
    ]);
    if (cantidad > 0) await this.registrarMovimiento(ingredienteId, null, "REPOSICION", cantidad);
  }

  async listar(): Promise<ExistenciaInventario[]> {
    const { rows } = await this.db.query(
      `WITH ${CTE_DISPONIBLE}
       SELECT ing.id, ing.nombre, ing.unidad, d.existencia, d.comprometido, d.disp
         FROM ingredientes ing JOIN disponible d ON d.ingrediente_id = ing.id
        ORDER BY ing.nombre`,
      [null],
    );
    return rows.map(mapearExistencia);
  }

  async obtener(ingredienteId: number): Promise<ExistenciaInventario | null> {
    const { rows } = await this.db.query(
      `WITH ${CTE_DISPONIBLE}
       SELECT ing.id, ing.nombre, ing.unidad, d.existencia, d.comprometido, d.disp
         FROM ingredientes ing JOIN disponible d ON d.ingrediente_id = ing.id
        WHERE ing.id = $2`,
      [null, ingredienteId],
    );
    return rows[0] ? mapearExistencia(rows[0]) : null;
  }

  async reponer(ingredienteId: number, cantidad: number): Promise<void> {
    await this.db.query(
      "UPDATE inventario SET cantidad = cantidad + $2, actualizado_en = now() WHERE ingrediente_id = $1",
      [ingredienteId, cantidad],
    );
    await this.registrarMovimiento(ingredienteId, null, "REPOSICION", cantidad);
  }

  /** Bloquea (FOR UPDATE) las existencias de los ingredientes de los platos dados. */
  async bloquearPorPlatos(platoIds: number[]): Promise<void> {
    await this.db.query(
      `SELECT ingrediente_id FROM inventario
        WHERE ingrediente_id IN (SELECT ingrediente_id FROM recetas WHERE plato_id = ANY($1::int[]))
        ORDER BY ingrediente_id
        FOR UPDATE`,
      [platoIds],
    );
  }

  /** Requerimientos por receta de los platos solicitados vs. stock disponible. */
  async calcularRequerimientos(
    items: { platoId: number; cantidad: number }[],
    excluirPedidoId: number | null,
  ): Promise<RequerimientoFila[]> {
    const { rows } = await this.db.query(
      `WITH ${CTE_DISPONIBLE},
       solicitado AS (
         SELECT plato_id, SUM(cantidad)::int AS cantidad
           FROM unnest($2::int[], $3::int[]) AS t(plato_id, cantidad)
          GROUP BY plato_id
       )
       SELECT s.plato_id, pl.nombre AS plato, r.ingrediente_id, ing.nombre AS ingrediente, ing.unidad,
              (r.cantidad * s.cantidad) AS requerido_plato,
              SUM(r.cantidad * s.cantidad) OVER (PARTITION BY r.ingrediente_id) AS requerido_total,
              d.disp AS disponible
         FROM solicitado s
         JOIN platos pl ON pl.id = s.plato_id
         JOIN recetas r ON r.plato_id = s.plato_id
         JOIN ingredientes ing ON ing.id = r.ingrediente_id
         JOIN disponible d ON d.ingrediente_id = r.ingrediente_id
        ORDER BY s.plato_id, r.ingrediente_id`,
      [excluirPedidoId, items.map((i) => i.platoId), items.map((i) => i.cantidad)],
    );
    return rows.map((r) => ({
      platoId: r.plato_id,
      plato: r.plato,
      ingredienteId: r.ingrediente_id,
      ingrediente: r.ingrediente,
      unidad: r.unidad,
      requeridoPlato: Number(r.requerido_plato),
      requeridoTotal: Number(r.requerido_total),
      disponible: Number(r.disponible),
    }));
  }

  /** Consumo exacto de ingredientes de un pedido según las recetas. */
  async consumoDePedido(pedidoId: number): Promise<ConsumoIngrediente[]> {
    const { rows } = await this.db.query(
      `SELECT r.ingrediente_id, ing.nombre, ing.unidad, SUM(r.cantidad * pi.cantidad) AS cantidad
         FROM pedido_items pi
         JOIN recetas r ON r.plato_id = pi.plato_id
         JOIN ingredientes ing ON ing.id = r.ingrediente_id
        WHERE pi.pedido_id = $1
        GROUP BY r.ingrediente_id, ing.nombre, ing.unidad
        ORDER BY r.ingrediente_id`,
      [pedidoId],
    );
    return rows.map((r) => ({
      ingredienteId: r.ingrediente_id,
      ingrediente: r.nombre,
      unidad: r.unidad,
      cantidad: Number(r.cantidad),
    }));
  }

  /**
   * Descuenta existencias solo si alcanzan. Devuelve false si no hay stock
   * suficiente (el llamador debe abortar la transacción).
   */
  async descontar(ingredienteId: number, cantidad: number, pedidoId: number): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE inventario SET cantidad = cantidad - $2, actualizado_en = now()
        WHERE ingrediente_id = $1 AND cantidad >= $2`,
      [ingredienteId, cantidad],
    );
    if (!res.rowCount) return false;
    await this.registrarMovimiento(ingredienteId, pedidoId, "CONSUMO", cantidad);
    return true;
  }

  async movimientosDePedido(pedidoId: number): Promise<{ ingredienteId: number; cantidad: number }[]> {
    const { rows } = await this.db.query(
      `SELECT ingrediente_id, cantidad FROM movimientos_inventario
        WHERE pedido_id = $1 AND tipo = 'CONSUMO' ORDER BY ingrediente_id`,
      [pedidoId],
    );
    return rows.map((r) => ({ ingredienteId: r.ingrediente_id, cantidad: Number(r.cantidad) }));
  }

  private async registrarMovimiento(
    ingredienteId: number,
    pedidoId: number | null,
    tipo: "CONSUMO" | "REPOSICION",
    cantidad: number,
  ): Promise<void> {
    await this.db.query(
      "INSERT INTO movimientos_inventario (ingrediente_id, pedido_id, tipo, cantidad) VALUES ($1,$2,$3,$4)",
      [ingredienteId, pedidoId, tipo, cantidad],
    );
  }
}

function mapearExistencia(r: any): ExistenciaInventario {
  return {
    ingredienteId: r.id,
    ingrediente: r.nombre,
    unidad: r.unidad,
    cantidad: Number(r.existencia),
    comprometido: Number(r.comprometido),
    disponible: Number(r.disp),
  };
}
