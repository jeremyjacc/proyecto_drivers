import "dotenv/config";
import request from "supertest";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { crearApp } from "../../src/app";
import { crearPool, type Pool } from "../../src/persistence/database/pool";

const URL_PRUEBAS =
  process.env.TEST_DATABASE_URL ??
  "postgresql://restosistem:restosistem@localhost:5432/restosistem_test";

export interface Entorno {
  pool: Pool;
  api: ReturnType<typeof request>;
}

/** Registra los hooks que dejan la base limpia antes de cada prueba. */
export function usarEntorno(): Entorno {
  const entorno = {} as Entorno;
  beforeAll(() => {
    entorno.pool = crearPool(URL_PRUEBAS);
    entorno.api = request(crearApp(entorno.pool));
  });
  beforeEach(async () => {
    await entorno.pool.query(
      `TRUNCATE notificaciones, entregas, movimientos_inventario, pagos, pedido_items, pedidos,
                recetas, platos, inventario, ingredientes, mesas RESTART IDENTITY CASCADE`,
    );
  });
  afterAll(async () => {
    await entorno.pool.end();
  });
  return entorno;
}

/**
 * Datos de prueba creados a través de la propia API (no se inserta SQL a mano):
 * mesa 1; Carne 500 g; Pan 10 u; Hamburguesa ($8.50: 150 g carne + 1 pan).
 */
export async function sembrar(api: Entorno["api"]) {
  const mesa = (await api.post("/api/mesas").send({ numero: 1 })).body;
  const carne = (
    await api.post("/api/ingredientes").send({ nombre: "Carne", unidad: "g", existenciaInicial: 500 })
  ).body;
  const pan = (
    await api.post("/api/ingredientes").send({ nombre: "Pan", unidad: "u", existenciaInicial: 10 })
  ).body;
  const hamburguesa = (
    await api.post("/api/platos").send({
      nombre: "Hamburguesa",
      precio: 8.5,
      receta: [
        { ingredienteId: carne.id, cantidad: 150 },
        { ingredienteId: pan.id, cantidad: 1 },
      ],
    })
  ).body;
  return { mesa, carne, pan, hamburguesa };
}

export async function pedidoDeMesa(
  api: Entorno["api"],
  mesaId: number,
  platoId: number,
  cantidad = 2,
) {
  const res = await api.post("/api/pedidos").send({ tipo: "MESA", mesaId, items: [{ platoId, cantidad }] });
  return res.body;
}

export const domicilio = {
  cliente: { nombre: "Ana Pérez", telefono: "0991234567" },
  direccionEntrega: "Av. Siempre Viva 742, piso 3",
};

export async function pedidoDomicilio(api: Entorno["api"], platoId: number, cantidad = 1) {
  const res = await api
    .post("/api/pedidos")
    .send({ tipo: "DOMICILIO", ...domicilio, items: [{ platoId, cantidad }] });
  return res.body;
}

export async function dejarListo(api: Entorno["api"], pedidoId: number) {
  await api.post(`/api/cocina/pedidos/${pedidoId}/iniciar`);
  return (await api.post(`/api/cocina/pedidos/${pedidoId}/listo`)).body;
}
