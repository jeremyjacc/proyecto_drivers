import type { EstadoPedido, Pedido, TipoPedido } from "../../domain/entities";
import type { Queryable } from "../database/pool";

export interface NuevoPedido {
  tipo: TipoPedido;
  mesaId: number | null;
  cliente: { nombre: string; telefono: string } | null;
  direccionEntrega: string | null;
  notas: string | null;
  total: number;
  items: { platoId: number; cantidad: number; precioUnitario: number; nota: string | null }[];
}

const SELECT_PEDIDO = `
  SELECT p.*, m.numero AS mesa_numero,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'id', pi.id, 'platoId', pi.plato_id, 'plato', pl.nombre,
                    'cantidad', pi.cantidad, 'precioUnitario', pi.precio_unitario,
                    'nota', pi.nota) ORDER BY pi.id)
             FROM pedido_items pi JOIN platos pl ON pl.id = pi.plato_id
            WHERE pi.pedido_id = p.id), '[]'::json) AS items
    FROM pedidos p
    LEFT JOIN mesas m ON m.id = p.mesa_id`;

function mapear(r: any): Pedido {
  return {
    id: r.id,
    tipo: r.tipo,
    estado: r.estado,
    pagoEstado: r.pago_estado,
    mesa: r.mesa_id ? { id: r.mesa_id, numero: r.mesa_numero } : null,
    cliente: r.cliente_nombre
      ? { nombre: r.cliente_nombre, telefono: r.cliente_telefono }
      : null,
    direccionEntrega: r.direccion_entrega,
    notas: r.notas,
    total: Number(r.total),
    items: r.items.map((i: any) => ({
      id: i.id,
      platoId: i.platoId,
      plato: i.plato,
      cantidad: i.cantidad,
      precioUnitario: Number(i.precioUnitario),
      subtotal: Math.round(Number(i.precioUnitario) * i.cantidad * 100) / 100,
      nota: i.nota,
    })),
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  };
}

export class PedidoRepository {
  constructor(private readonly db: Queryable) {}

  async crear(n: NuevoPedido): Promise<number> {
    const { rows } = await this.db.query(
      `INSERT INTO pedidos (tipo, mesa_id, cliente_nombre, cliente_telefono,
                            direccion_entrega, notas, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        n.tipo,
        n.mesaId,
        n.cliente?.nombre ?? null,
        n.cliente?.telefono ?? null,
        n.direccionEntrega,
        n.notas,
        n.total,
      ],
    );
    const id: number = rows[0].id;
    await this.insertarItems(id, n.items);
    return id;
  }

  async reemplazarItems(
    pedidoId: number,
    items: NuevoPedido["items"],
    total: number,
  ): Promise<void> {
    await this.db.query("DELETE FROM pedido_items WHERE pedido_id = $1", [pedidoId]);
    await this.insertarItems(pedidoId, items);
    await this.db.query("UPDATE pedidos SET total = $2, actualizado_en = now() WHERE id = $1", [
      pedidoId,
      total,
    ]);
  }

  private async insertarItems(pedidoId: number, items: NuevoPedido["items"]): Promise<void> {
    for (const it of items) {
      await this.db.query(
        `INSERT INTO pedido_items (pedido_id, plato_id, cantidad, precio_unitario, nota)
         VALUES ($1,$2,$3,$4,$5)`,
        [pedidoId, it.platoId, it.cantidad, it.precioUnitario, it.nota],
      );
    }
  }

  async obtener(id: number): Promise<Pedido | null> {
    const { rows } = await this.db.query(`${SELECT_PEDIDO} WHERE p.id = $1`, [id]);
    return rows[0] ? mapear(rows[0]) : null;
  }

  /** Obtiene el pedido bloqueando su fila para serializar cambios concurrentes. */
  async obtenerBloqueando(id: number): Promise<Pedido | null> {
    const lock = await this.db.query("SELECT id FROM pedidos WHERE id = $1 FOR UPDATE", [id]);
    if (!lock.rowCount) return null;
    return this.obtener(id);
  }

  async listar(filtro: { estado?: EstadoPedido[]; tipo?: TipoPedido }): Promise<Pedido[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filtro.estado?.length) {
      params.push(filtro.estado);
      where.push(`p.estado = ANY($${params.length}::text[])`);
    }
    if (filtro.tipo) {
      params.push(filtro.tipo);
      where.push(`p.tipo = $${params.length}`);
    }
    const { rows } = await this.db.query(
      `${SELECT_PEDIDO} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY p.creado_en, p.id`,
      params,
    );
    return rows.map(mapear);
  }

  async actualizarEstado(id: number, estado: EstadoPedido): Promise<void> {
    await this.db.query("UPDATE pedidos SET estado = $2, actualizado_en = now() WHERE id = $1", [
      id,
      estado,
    ]);
  }

  /** Marca el pedido como pagado; `cerrar` además lo pasa a CERRADO (pedidos de mesa). */
  async marcarPagado(id: number, cerrar: boolean): Promise<void> {
    await this.db.query(
      `UPDATE pedidos SET pago_estado = 'PAGADO',
              estado = CASE WHEN $2::boolean THEN 'CERRADO' ELSE estado END,
              actualizado_en = now()
        WHERE id = $1`,
      [id, cerrar],
    );
  }
}
