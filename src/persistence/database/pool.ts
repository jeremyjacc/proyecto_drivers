import pg from "pg";

export type Pool = pg.Pool;

/** Contrato mínimo de ejecución de consultas (pool o cliente de transacción). */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export function crearPool(connectionString: string): Pool {
  return new pg.Pool({ connectionString, max: 10 });
}
