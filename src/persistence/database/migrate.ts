import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Pool } from "./pool";

const DIR_MIGRACIONES = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

/** Aplica en orden los archivos .sql pendientes. Devuelve los nombres aplicados. */
export async function migrar(pool: Pool): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       nombre TEXT PRIMARY KEY,
       aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
  const archivos = (await readdir(DIR_MIGRACIONES)).filter((f) => f.endsWith(".sql")).sort();
  const aplicadas: string[] = [];
  for (const archivo of archivos) {
    const ya = await pool.query("SELECT 1 FROM schema_migrations WHERE nombre = $1", [archivo]);
    if (ya.rowCount) continue;
    const sql = await readFile(path.join(DIR_MIGRACIONES, archivo), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (nombre) VALUES ($1)", [archivo]);
      await client.query("COMMIT");
      aplicadas.push(archivo);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  return aplicadas;
}
