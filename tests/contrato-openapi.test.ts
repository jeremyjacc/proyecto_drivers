import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { crearRutas } from "../src/presentation/routes";
import { dejarListo, domicilio, pedidoDomicilio, sembrar, usarEntorno } from "./helpers/entorno";

const SPEC = path.resolve(__dirname, "../docs/openapi.yaml");
const env = usarEntorno();

/** Rutas realmente registradas en Express, como "METODO /ruta/{param}". */
function rutasImplementadas(): string[] {
  const noop = new Proxy({}, { get: () => () => undefined }) as any;
  const router = crearRutas({ catalogo: noop, pedidos: noop, preparacion: noop, cobro: noop, entregas: noop });
  const rutas: string[] = [];
  for (const layer of (router as any).stack) {
    if (!layer.route) continue;
    for (const metodo of Object.keys(layer.route.methods)) {
      rutas.push(`${metodo.toUpperCase()} ${layer.route.path.replace(/:(\w+)/g, "{$1}")}`);
    }
  }
  return rutas.sort();
}

describe("Contrato OpenAPI (docs/openapi.yaml)", () => {
  it("es un documento OpenAPI 3 válido", async () => {
    const api: any = await SwaggerParser.validate(SPEC);
    expect(api.openapi).toMatch(/^3\./);
  });

  it("documenta exactamente las rutas implementadas (ni más ni menos)", async () => {
    const api: any = await SwaggerParser.parse(SPEC);
    const documentadas: string[] = [];
    for (const [ruta, item] of Object.entries<any>(api.paths)) {
      if (ruta === "/health") continue; // vive fuera del router /api
      for (const metodo of ["get", "post", "put", "patch", "delete"]) {
        if (item[metodo]) documentadas.push(`${metodo.toUpperCase()} ${ruta}`);
      }
    }
    expect(documentadas.sort()).toEqual(rutasImplementadas());
  });

  it("todas las operaciones tienen operationId único y una respuesta exitosa", async () => {
    const api: any = await SwaggerParser.parse(SPEC);
    const ids = new Set<string>();
    for (const item of Object.values<any>(api.paths)) {
      for (const op of Object.values<any>(item).filter((o) => o?.responses)) {
        expect(op.operationId).toBeTruthy();
        expect(ids.has(op.operationId)).toBe(false);
        ids.add(op.operationId);
        expect(Object.keys(op.responses).some((c) => /^2/.test(c))).toBe(true);
      }
    }
  });

  it("las respuestas reales cumplen los esquemas documentados", async () => {
    const api: any = await SwaggerParser.dereference(SPEC);
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);

    const conforme = (res: { status: number; body: any }, ruta: string, metodo: string) => {
      const op = api.paths[ruta][metodo];
      const def = op.responses[String(res.status)];
      expect(def, `${metodo.toUpperCase()} ${ruta} no documenta el código ${res.status}`).toBeTruthy();
      const schema = def.content?.["application/json"]?.schema;
      expect(schema, `${metodo.toUpperCase()} ${ruta} ${res.status} sin esquema`).toBeTruthy();
      const valido = ajv.validate(schema, res.body);
      expect(valido, `${metodo.toUpperCase()} ${ruta} ${res.status}: ${ajv.errorsText()}`).toBe(true);
    };

    const { mesa, carne, hamburguesa } = await sembrar(env.api);
    const mesa2 = await env.api.post("/api/mesas").send({ numero: 2 });
    conforme(mesa2, "/mesas", "post");
    const queso = await env.api.post("/api/ingredientes").send({ nombre: "Queso", unidad: "g", existenciaInicial: 100 });
    conforme(queso, "/ingredientes", "post");
    const quesadilla = await env.api.post("/api/platos").send({
      nombre: "Quesadilla",
      precio: 4.5,
      receta: [{ ingredienteId: queso.body.id, cantidad: 50 }],
    });
    conforme(quesadilla, "/platos", "post");
    conforme(await env.api.get("/api/mesas"), "/mesas", "get");
    conforme(await env.api.get("/api/ingredientes"), "/ingredientes", "get");
    conforme(await env.api.get("/api/inventario"), "/inventario", "get");
    conforme(await env.api.get("/api/platos"), "/platos", "get");
    conforme(await env.api.get(`/api/platos/${hamburguesa.id}`), "/platos/{id}", "get");
    conforme(await env.api.post(`/api/inventario/${carne.id}/reposiciones`).send({ cantidad: 10 }), "/inventario/{id}/reposiciones", "post");
    conforme(await env.api.post("/api/mesas").send({ numero: 1 }), "/mesas", "post"); // 409
    conforme(await env.api.post("/api/mesas").send({ numero: -1 }), "/mesas", "post"); // 400

    // CU-01
    const crear = await env.api.post("/api/pedidos").send({ tipo: "MESA", mesaId: mesa.id, items: [{ platoId: hamburguesa.id, cantidad: 2 }] });
    conforme(crear, "/pedidos", "post");
    conforme(await env.api.post("/api/pedidos").send({ tipo: "MESA", mesaId: mesa.id, items: [{ platoId: hamburguesa.id, cantidad: 50 }] }), "/pedidos", "post"); // 409
    conforme(await env.api.post("/api/pedidos").send({ items: [] }), "/pedidos", "post"); // 400
    conforme(await env.api.get("/api/pedidos?estado=ENVIADO"), "/pedidos", "get");
    conforme(await env.api.get(`/api/pedidos/${crear.body.id}`), "/pedidos/{id}", "get");
    conforme(await env.api.get("/api/pedidos/999"), "/pedidos/{id}", "get"); // 404
    conforme(await env.api.put(`/api/pedidos/${crear.body.id}/items`).send({ items: [{ platoId: hamburguesa.id, cantidad: 1 }] }), "/pedidos/{id}/items", "put");

    // CU-02
    conforme(await env.api.get("/api/cocina/pedidos"), "/cocina/pedidos", "get");
    conforme(await env.api.post(`/api/cocina/pedidos/${crear.body.id}/listo`), "/cocina/pedidos/{id}/listo", "post"); // 409
    conforme(await env.api.post(`/api/cocina/pedidos/${crear.body.id}/iniciar`), "/cocina/pedidos/{id}/iniciar", "post");
    conforme(await env.api.get("/api/notificaciones"), "/notificaciones", "get");
    const aCancelar = (await env.api.post("/api/pedidos").send({ tipo: "MESA", mesaId: mesa.id, items: [{ platoId: hamburguesa.id, cantidad: 1 }] })).body;
    conforme(await env.api.post(`/api/pedidos/${aCancelar.id}/cancelar`), "/pedidos/{id}/cancelar", "post");

    // CU-03
    await env.api.post(`/api/cocina/pedidos/${crear.body.id}/listo`);
    conforme(await env.api.get(`/api/pedidos/${crear.body.id}/total`), "/pedidos/{pedidoId}/total", "get");
    conforme(
      await env.api.post(`/api/pedidos/${crear.body.id}/pagos`).send({ metodo: "TARJETA", resultadoAutorizacion: "DENEGADO", motivoDenegacion: "x" }),
      "/pedidos/{pedidoId}/pagos",
      "post",
    ); // 402
    conforme(await env.api.post(`/api/pedidos/${crear.body.id}/pagos`).send({ metodo: "EFECTIVO", montoRecibido: 50 }), "/pedidos/{pedidoId}/pagos", "post"); // 201
    conforme(await env.api.get(`/api/pedidos/${crear.body.id}/pagos`), "/pedidos/{pedidoId}/pagos", "get");

    // CU-04
    const dom = await pedidoDomicilio(env.api, hamburguesa.id, 1);
    await dejarListo(env.api, dom.id);
    conforme(await env.api.get("/api/entregas/pendientes"), "/entregas/pendientes", "get");
    const tomar = await env.api.post("/api/entregas").send({ pedidoId: dom.id, repartidor: "Luis" });
    conforme(tomar, "/entregas", "post");
    conforme(await env.api.get("/api/entregas"), "/entregas", "get");
    conforme(await env.api.get(`/api/entregas/${tomar.body.id}`), "/entregas/{id}", "get");
    conforme(await env.api.post(`/api/entregas/${tomar.body.id}/entregado`), "/entregas/{id}/entregado", "post"); // 409
    conforme(await env.api.post(`/api/entregas/${tomar.body.id}/en-camino`), "/entregas/{id}/en-camino", "post");
    conforme(await env.api.post(`/api/entregas/${tomar.body.id}/devuelto`).send({ motivo: "Cliente ilocalizable" }), "/entregas/{id}/devuelto", "post");
    const dom2 = await pedidoDomicilio(env.api, hamburguesa.id, 1);
    await dejarListo(env.api, dom2.id);
    const e2 = (await env.api.post("/api/entregas").send({ pedidoId: dom2.id, repartidor: "Luis" })).body;
    await env.api.post(`/api/entregas/${e2.id}/en-camino`);
    conforme(await env.api.post(`/api/entregas/${e2.id}/entregado`), "/entregas/{id}/entregado", "post");

    // /health
    const health = await env.api.get("/health");
    expect(ajv.validate(api.paths["/health"].get.responses["200"].content["application/json"].schema, health.body)).toBe(true);
    expect(domicilio.direccionEntrega).toBeTruthy();
  });
});
