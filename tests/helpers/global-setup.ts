import "dotenv/config";
import { crearPool } from "../../src/persistence/database/pool";
import { migrar } from "../../src/persistence/database/migrate";

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://restosistem:restosistem@localhost:5432/restosistem_test";

/** Recrea el esquema de la base EXCLUSIVA de pruebas y aplica las migraciones reales. */
export default async function setup() {
  if (!/test/i.test(new URL(TEST_DB_URL).pathname)) {
    throw new Error("TEST_DATABASE_URL debe apuntar a una base cuyo nombre contenga 'test'");
  }
  process.env.TEST_DATABASE_URL = TEST_DB_URL;
  const pool = crearPool(TEST_DB_URL);
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await migrar(pool);
  } finally {
    await pool.end();
  }
}
