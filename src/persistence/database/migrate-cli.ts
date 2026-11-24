import { cargarConfig } from "../../config/env";
import { crearPool } from "./pool";
import { migrar } from "./migrate";

const config = cargarConfig();
const pool = crearPool(config.databaseUrl);
try {
  const aplicadas = await migrar(pool);
  console.log(
    aplicadas.length ? `Migraciones aplicadas: ${aplicadas.join(", ")}` : "Base de datos al día.",
  );
} finally {
  await pool.end();
}
