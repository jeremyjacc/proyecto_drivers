import { Router } from "express";
import type { CatalogoController } from "../controllers/catalogo.controller";
import type { CobroController } from "../controllers/cobro.controller";
import type { EntregasController } from "../controllers/entregas.controller";
import type { PedidosController, PreparacionController } from "../controllers/pedidos.controller";
import { validar } from "../middlewares/validar";
import * as s from "../schemas";

export interface Controladores {
  catalogo: CatalogoController;
  pedidos: PedidosController;
  preparacion: PreparacionController;
  cobro: CobroController;
  entregas: EntregasController;
}

export function crearRutas(c: Controladores): Router {
  const r = Router();

  // Catálogo, ingredientes e inventario
  r.post("/mesas", validar("body", s.crearMesaBody), c.catalogo.crearMesa);
  r.get("/mesas", c.catalogo.listarMesas);
  r.post("/ingredientes", validar("body", s.crearIngredienteBody), c.catalogo.crearIngrediente);
  r.get("/ingredientes", c.catalogo.listarIngredientes);
  r.get("/inventario", c.catalogo.listarInventario);
  r.post(
    "/inventario/:id/reposiciones",
    validar("params", s.idParam),
    validar("body", s.reponerBody),
    c.catalogo.reponer,
  );
  r.post("/platos", validar("body", s.crearPlatoBody), c.catalogo.crearPlato);
  r.get("/platos", c.catalogo.listarPlatos);
  r.get("/platos/:id", validar("params", s.idParam), c.catalogo.obtenerPlato);

  // CU-01 Pedidos
  r.post("/pedidos", validar("body", s.crearPedidoBody), c.pedidos.crear);
  r.get("/pedidos", validar("query", s.listarPedidosQuery), c.pedidos.listar);
  r.get("/pedidos/:id", validar("params", s.idParam), c.pedidos.obtener);
  r.put(
    "/pedidos/:id/items",
    validar("params", s.idParam),
    validar("body", s.modificarPedidoBody),
    c.pedidos.modificar,
  );
  r.post("/pedidos/:id/cancelar", validar("params", s.idParam), c.pedidos.cancelar);

  // CU-02 Preparación
  r.get("/cocina/pedidos", c.preparacion.tablero);
  r.post("/cocina/pedidos/:id/iniciar", validar("params", s.idParam), c.preparacion.iniciar);
  r.post("/cocina/pedidos/:id/listo", validar("params", s.idParam), c.preparacion.listo);
  r.get("/notificaciones", validar("query", s.notificacionesQuery), c.preparacion.notificaciones);

  // CU-03 Cobro
  r.get("/pedidos/:pedidoId/total", validar("params", s.pedidoIdParam), c.cobro.total);
  r.post(
    "/pedidos/:pedidoId/pagos",
    validar("params", s.pedidoIdParam),
    validar("body", s.cobrarBody),
    c.cobro.cobrar,
  );
  r.get("/pedidos/:pedidoId/pagos", validar("params", s.pedidoIdParam), c.cobro.pagos);

  // CU-04 Entregas
  r.get("/entregas/pendientes", c.entregas.pendientes);
  r.get("/entregas", validar("query", s.listarEntregasQuery), c.entregas.listar);
  r.post("/entregas", validar("body", s.tomarEntregaBody), c.entregas.tomar);
  r.get("/entregas/:id", validar("params", s.idParam), c.entregas.obtener);
  r.post("/entregas/:id/en-camino", validar("params", s.idParam), c.entregas.enCamino);
  r.post("/entregas/:id/entregado", validar("params", s.idParam), c.entregas.entregado);
  r.post(
    "/entregas/:id/devuelto",
    validar("params", s.idParam),
    validar("body", s.devolverEntregaBody),
    c.entregas.devuelto,
  );

  return r;
}
