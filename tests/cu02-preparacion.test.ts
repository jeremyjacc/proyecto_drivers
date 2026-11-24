import { describe, expect, it } from "vitest";
import { pedidoDeMesa, sembrar, usarEntorno } from "./helpers/entorno";

const env = usarEntorno();

describe("CU-02 Gestionar preparación (F-02)", () => {
  it("la cocina ve los pedidos enviados, ordenados del más antiguo al más nuevo", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const a = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
    const b = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
    const res = await env.api.get("/api/cocina/pedidos");
    expect(res.status).toBe(200);
    expect(res.body.map((p: any) => p.id)).toEqual([a.id, b.id]);
    expect(res.body[0].items[0].plato).toBe("Hamburguesa");
  });

  it("ENVIADO → EN_PREPARACION → LISTO, y notifica al salón al terminar", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);

    const iniciar = await env.api.post(`/api/cocina/pedidos/${p.id}/iniciar`);
    expect(iniciar.status).toBe(200);
    expect(iniciar.body.estado).toBe("EN_PREPARACION");
    expect((await env.api.get("/api/notificaciones?destino=SALON")).body).toHaveLength(0);

    const listo = await env.api.post(`/api/cocina/pedidos/${p.id}/listo`);
    expect(listo.status).toBe(200);
    expect(listo.body.estado).toBe("LISTO");
    expect((await env.api.get(`/api/pedidos/${p.id}`)).body.estado).toBe("LISTO"); // persistido

    const salon = (await env.api.get(`/api/notificaciones?destino=SALON&pedidoId=${p.id}`)).body;
    expect(salon).toHaveLength(1);
    expect(salon[0].mensaje).toContain(`#${p.id}`);
    // un pedido LISTO sale del tablero de cocina
    expect((await env.api.get("/api/cocina/pedidos")).body).toHaveLength(0);
  });

  it("el pedido en preparación sigue visible para cocina", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
    await env.api.post(`/api/cocina/pedidos/${p.id}/iniciar`);
    const tablero = (await env.api.get("/api/cocina/pedidos")).body;
    expect(tablero[0]).toMatchObject({ id: p.id, estado: "EN_PREPARACION" });
  });

  describe("transiciones inválidas (409)", () => {
    it("no se puede marcar LISTO un pedido que no está en preparación", async () => {
      const { mesa, hamburguesa } = await sembrar(env.api);
      const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
      const res = await env.api.post(`/api/cocina/pedidos/${p.id}/listo`);
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe("ESTADO_INVALIDO");
      expect(res.body.error.detalles.estadoActual).toBe("ENVIADO");
    });

    it("no se puede iniciar dos veces", async () => {
      const { mesa, hamburguesa } = await sembrar(env.api);
      const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
      await env.api.post(`/api/cocina/pedidos/${p.id}/iniciar`);
      expect((await env.api.post(`/api/cocina/pedidos/${p.id}/iniciar`)).status).toBe(409);
    });

    it("no se puede iniciar un pedido cancelado", async () => {
      const { mesa, hamburguesa } = await sembrar(env.api);
      const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
      await env.api.post(`/api/pedidos/${p.id}/cancelar`);
      const res = await env.api.post(`/api/cocina/pedidos/${p.id}/iniciar`);
      expect(res.status).toBe(409);
      expect(res.body.error.detalles.estadoActual).toBe("CANCELADO");
    });
  });

  it("404 si el pedido no existe y 400 si el id es inválido", async () => {
    expect((await env.api.post("/api/cocina/pedidos/999/iniciar")).status).toBe(404);
    expect((await env.api.post("/api/cocina/pedidos/abc/listo")).status).toBe(400);
  });

  it("valida los filtros de notificaciones (400)", async () => {
    expect((await env.api.get("/api/notificaciones?destino=OTRO")).status).toBe(400);
  });
});
