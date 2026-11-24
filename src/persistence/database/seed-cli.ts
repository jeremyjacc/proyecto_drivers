import { cargarConfig } from "../../config/env";
import { crearPool } from "./pool";
import { migrar } from "./migrate";
import { PgUnidadDeTrabajo } from "../unit-of-work";

/**
 * Datos de DEMOSTRACIÓN (no son datos reales): 3 mesas, 4 ingredientes y 2 platos con receta.
 * Es idempotente: si ya hay ingredientes, no hace nada.
 */
const pool = crearPool(cargarConfig().databaseUrl);
try {
  await migrar(pool);
  const uow = new PgUnidadDeTrabajo(pool);
  await uow.transaccion(async (r) => {
    if ((await r.ingredientes.listar()).length > 0) {
      console.log("Ya existen datos; no se inserta nada.");
      return;
    }
    for (const n of [1, 2, 3]) await r.mesas.crear(n);
    const carne = await r.ingredientes.crear("Carne de res", "g");
    const pan = await r.ingredientes.crear("Pan de hamburguesa", "u");
    const queso = await r.ingredientes.crear("Queso", "g");
    const papas = await r.ingredientes.crear("Papas", "g");
    await r.inventario.inicializar(carne.id, 5000);
    await r.inventario.inicializar(pan.id, 40);
    await r.inventario.inicializar(queso.id, 1000);
    await r.inventario.inicializar(papas.id, 4000);
    await r.platos.crear("Hamburguesa clásica", 8.5, [
      { ingredienteId: carne.id, cantidad: 150 },
      { ingredienteId: pan.id, cantidad: 1 },
      { ingredienteId: queso.id, cantidad: 30 },
    ]);
    await r.platos.crear("Porción de papas", 3.25, [{ ingredienteId: papas.id, cantidad: 250 }]);
    console.log("Datos de demostración insertados.");
  });
} finally {
  await pool.end();
}
