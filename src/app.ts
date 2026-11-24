import express, { type Express } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CatalogoService } from "./application/catalogo.service";
import { CobroService } from "./application/cobro.service";
import { EntregasService } from "./application/entregas.service";
import { PedidosService } from "./application/pedidos.service";
import { PreparacionService } from "./application/preparacion.service";
import type { Pool } from "./persistence/database/pool";
import { PgUnidadDeTrabajo, type UnidadDeTrabajo } from "./persistence/unit-of-work";
import { CatalogoController } from "./presentation/controllers/catalogo.controller";
import { CobroController } from "./presentation/controllers/cobro.controller";
import { EntregasController } from "./presentation/controllers/entregas.controller";
import {
  PedidosController,
  PreparacionController,
} from "./presentation/controllers/pedidos.controller";
import { manejarErrores, noEncontradaRuta } from "./presentation/middlewares/errores";
import { crearRutas } from "./presentation/routes";

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

/**
 * Raíz de composición del monolito: aquí (y solo aquí) se conectan las tres
 * capas — Presentación → Aplicación → Persistencia.
 */
export function crearApp(pool: Pool): Express {
  const uow: UnidadDeTrabajo = new PgUnidadDeTrabajo(pool);

  const catalogo = new CatalogoService(uow);
  const pedidos = new PedidosService(uow);
  const preparacion = new PreparacionService(uow);
  const cobro = new CobroService(uow);
  const entregas = new EntregasService(uow);

  const app = express();
  app.use(express.json());
  app.use(express.static(PUBLIC_DIR));

  app.get("/health", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ estado: "ok" });
  });

  app.use(
    "/api",
    crearRutas({
      catalogo: new CatalogoController(catalogo),
      pedidos: new PedidosController(pedidos),
      preparacion: new PreparacionController(preparacion),
      cobro: new CobroController(cobro),
      entregas: new EntregasController(entregas),
    }),
  );

  app.use(noEncontradaRuta);
  app.use(manejarErrores);
  return app;
}
