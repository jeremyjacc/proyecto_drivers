import { conflicto } from "../../domain/errors";
import type { Plato } from "../../domain/entities";
import type { Queryable } from "../database/pool";

const SELECT_PLATOS = `
  WITH comprometido AS (
    SELECT r.ingrediente_id, SUM(r.cantidad * pi.cantidad) AS qty
      FROM pedido_items pi
      JOIN pedidos p ON p.id = pi.pedido_id
       AND p.estado IN ('ENVIADO','EN_PREPARACION','LISTO','CERRADO') AND p.pago_estado = 'PENDIENTE_PAGO'
      JOIN recetas r ON r.plato_id = pi.plato_id
     GROUP BY r.ingrediente_id
  ),
  porciones AS (
    SELECT r.plato_id,
           GREATEST(MIN(FLOOR((i.cantidad - COALESCE(c.qty, 0)) / r.cantidad)), 0)::int AS porciones
      FROM recetas r
      JOIN inventario i ON i.ingrediente_id = r.ingrediente_id
      LEFT JOIN comprometido c ON c.ingrediente_id = r.ingrediente_id
     GROUP BY r.plato_id
  )
  SELECT p.id, p.nombre, p.precio, p.activo, COALESCE(po.porciones, 0) AS porciones,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'ingredienteId', r.ingrediente_id, 'ingrediente', ing.nombre,
                    'unidad', ing.unidad, 'cantidad', r.cantidad) ORDER BY r.ingrediente_id)
             FROM recetas r JOIN ingredientes ing ON ing.id = r.ingrediente_id
            WHERE r.plato_id = p.id), '[]'::json) AS receta
    FROM platos p
    LEFT JOIN porciones po ON po.plato_id = p.id`;

function mapear(r: any): Plato {
  const porciones = Number(r.porciones);
  return {
    id: r.id,
    nombre: r.nombre,
    precio: Number(r.precio),
    activo: r.activo,
    receta: r.receta.map((l: any) => ({ ...l, cantidad: Number(l.cantidad) })),
    porcionesDisponibles: porciones,
    disponible: r.activo && porciones > 0,
  };
}

export class PlatoRepository {
  constructor(private readonly db: Queryable) {}

  async crear(
    nombre: string,
    precio: number,
    receta: { ingredienteId: number; cantidad: number }[],
  ): Promise<number> {
    let id: number;
    try {
      const { rows } = await this.db.query(
        "INSERT INTO platos (nombre, precio) VALUES ($1, $2) RETURNING id",
        [nombre, precio],
      );
      id = rows[0].id;
    } catch (e: any) {
      if (e.code === "23505") throw conflicto("PLATO_DUPLICADO", `Ya existe el plato "${nombre}"`);
      throw e;
    }
    for (const linea of receta) {
      await this.db.query(
        "INSERT INTO recetas (plato_id, ingrediente_id, cantidad) VALUES ($1, $2, $3)",
        [id, linea.ingredienteId, linea.cantidad],
      );
    }
    return id;
  }

  async obtener(id: number): Promise<Plato | null> {
    const { rows } = await this.db.query(`${SELECT_PLATOS} WHERE p.id = $1`, [id]);
    return rows[0] ? mapear(rows[0]) : null;
  }

  async obtenerPorIds(ids: number[]): Promise<Plato[]> {
    const { rows } = await this.db.query(`${SELECT_PLATOS} WHERE p.id = ANY($1::int[]) ORDER BY p.id`, [ids]);
    return rows.map(mapear);
  }

  async listar(): Promise<Plato[]> {
    const { rows } = await this.db.query(`${SELECT_PLATOS} ORDER BY p.nombre`);
    return rows.map(mapear);
  }
}
