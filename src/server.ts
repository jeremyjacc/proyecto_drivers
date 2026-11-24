import { crearApp } from "./app";
import { cargarConfig } from "./config/env";
import { crearPool } from "./persistence/database/pool";

const config = cargarConfig();
const pool = crearPool(config.databaseUrl);
const app = crearApp(pool);

const server = app.listen(config.port, () => {
  console.log(`Restosistem escuchando en http://localhost:${config.port}`);
});

const apagar = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on("SIGINT", apagar);
process.on("SIGTERM", apagar);
