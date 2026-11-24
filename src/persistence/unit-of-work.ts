import { EntregaRepository } from "./repositories/entrega.repository";
import { IngredienteRepository } from "./repositories/ingrediente.repository";
import { InventarioRepository } from "./repositories/inventario.repository";
import { MesaRepository } from "./repositories/mesa.repository";
import { NotificacionRepository } from "./repositories/notificacion.repository";
import { PagoRepository } from "./repositories/pago.repository";
import { PedidoRepository } from "./repositories/pedido.repository";
import { PlatoRepository } from "./repositories/plato.repository";
import type { Pool, Queryable } from "./database/pool";

/** Conjunto de repositorios que comparten la misma conexión/transacción. */
export interface Repositorios {
  mesas: MesaRepository;
  ingredientes: IngredienteRepository;
  inventario: InventarioRepository;
  platos: PlatoRepository;
  pedidos: PedidoRepository;
  pagos: PagoRepository;
  entregas: EntregaRepository;
  notificaciones: NotificacionRepository;
}

export function crearRepositorios(db: Queryable): Repositorios {
  return {
    mesas: new MesaRepository(db),
    ingredientes: new IngredienteRepository(db),
    inventario: new InventarioRepository(db),
    platos: new PlatoRepository(db),
    pedidos: new PedidoRepository(db),
    pagos: new PagoRepository(db),
    entregas: new EntregaRepository(db),
    notificaciones: new NotificacionRepository(db),
  };
}

/**
 * Contrato que consume la capa de aplicación: ejecutar trabajo dentro de una
 * transacción (`transaccion`) o lecturas sin transacción (`lectura`).
 * La capa de aplicación no conoce `pg` ni SQL.
 */
export interface UnidadDeTrabajo {
  transaccion<T>(trabajo: (repos: Repositorios) => Promise<T>): Promise<T>;
  lectura: Repositorios;
}

export class PgUnidadDeTrabajo implements UnidadDeTrabajo {
  readonly lectura: Repositorios;

  constructor(private readonly pool: Pool) {
    this.lectura = crearRepositorios(pool);
  }

  async transaccion<T>(trabajo: (repos: Repositorios) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const resultado = await trabajo(crearRepositorios(client));
      await client.query("COMMIT");
      return resultado;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
