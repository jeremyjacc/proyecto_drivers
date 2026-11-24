import { describe, expect, it } from "vitest";
import { domicilio, pedidoDeMesa, sembrar, usarEntorno } from "./helpers/entorno";

const env = usarEntorno();

describe("CU-01 Registrar pedido (F-01, R-01)", () => {
  it("registra un pedido de mesa, lo envía a cocina y lo persiste (201)", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const res = await env.api
      .post("/api/pedidos")
      .send({ tipo: "MESA", mesaId: mesa.id, items: [{ platoId: hamburguesa.id, cantidad: 2, nota: "sin cebolla" }] });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/pedidos/${res.body.id}`);
    expect(res.body).toMatchObject({
      tipo: "MESA",
      estado: "ENVIADO",
      pagoEstado: "PENDIENTE_PAGO",
      total: 17,
      mesa: { id: mesa.id, numero: 1 },
    });
    expect(res.body.items[0]).toMatchObject({ plato: "Hamburguesa", cantidad: 2, subtotal: 17, nota: "sin cebolla" });

    // Persistido: se recupera por GET y aparece en el tablero de cocina
    expect((await env.api.get(`/api/pedidos/${res.body.id}`)).body.id).toBe(res.body.id);
    const cocina = (await env.api.get("/api/cocina/pedidos")).body;
    expect(cocina.map((p: any) => p.id)).toContain(res.body.id);
    // La mesa queda ocupada y cocina recibe una notificación
    expect((await env.api.get("/api/mesas")).body[0].estado).toBe("OCUPADA");
    const notif = (await env.api.get("/api/notificaciones?destino=COCINA")).body;
    expect(notif).toHaveLength(1);
    expect(notif[0].pedidoId).toBe(res.body.id);
  });

  it("registra un pedido a domicilio con cliente y dirección", async () => {
    const { hamburguesa } = await sembrar(env.api);
    const res = await env.api
      .post("/api/pedidos")
      .send({ tipo: "DOMICILIO", ...domicilio, items: [{ platoId: hamburguesa.id, cantidad: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ tipo: "DOMICILIO", mesa: null, direccionEntrega: domicilio.direccionEntrega });
    expect(res.body.cliente).toEqual(domicilio.cliente);
  });

  it("R-01: rechaza (409) un pedido sin inventario suficiente, no lo persiste y notifica al salón", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    // 4 hamburguesas = 600 g de carne, solo hay 500 g
    const res = await env.api
      .post("/api/pedidos")
      .send({ tipo: "MESA", mesaId: mesa.id, items: [{ platoId: hamburguesa.id, cantidad: 4 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe("STOCK_INSUFICIENTE");
    const bloqueado = res.body.error.detalles.platosBloqueados[0];
    expect(bloqueado.plato).toBe("Hamburguesa");
    expect(bloqueado.faltantes).toEqual([
      expect.objectContaining({ ingrediente: "Carne", requerido: 600, disponible: 500 }),
    ]);

    expect((await env.api.get("/api/pedidos")).body).toHaveLength(0);
    expect((await env.api.get("/api/mesas")).body[0].estado).toBe("LIBRE");
    const salon = (await env.api.get("/api/notificaciones?destino=SALON")).body;
    expect(salon).toHaveLength(1);
    expect(salon[0].mensaje).toContain("Hamburguesa");
    // y el plato figura como no disponible solo cuando no quedan porciones
    expect((await env.api.get(`/api/platos/${hamburguesa.id}`)).body.porcionesDisponibles).toBe(3);
  });

  it("R-01: el stock ya comprometido por pedidos abiertos cuenta contra nuevos pedidos", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    expect((await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 3)).estado).toBe("ENVIADO"); // 450 g
    const res = await env.api
      .post("/api/pedidos")
      .send({ tipo: "MESA", mesaId: mesa.id, items: [{ platoId: hamburguesa.id, cantidad: 1 }] }); // +150 > 500
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe("STOCK_INSUFICIENTE");
    // el inventario físico no se toca hasta el cobro
    expect((await env.api.get("/api/inventario")).body.find((i: any) => i.ingrediente === "Carne")).toMatchObject({
      cantidad: 500,
      comprometido: 450,
      disponible: 50,
    });
  });

  it("suma los requerimientos de varias líneas del mismo pedido", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const res = await env.api.post("/api/pedidos").send({
      tipo: "MESA",
      mesaId: mesa.id,
      items: [
        { platoId: hamburguesa.id, cantidad: 2 },
        { platoId: hamburguesa.id, cantidad: 2 },
      ],
    });
    expect(res.status).toBe(409);
  });

  describe("datos inválidos (400)", () => {
    const casos: [string, (ids: { mesaId: number; platoId: number }) => unknown][] = [
      ["sin items", ({ mesaId }) => ({ tipo: "MESA", mesaId, items: [] })],
      ["cantidad cero", ({ mesaId, platoId }) => ({ tipo: "MESA", mesaId, items: [{ platoId, cantidad: 0 }] })],
      ["cantidad fraccionaria", ({ mesaId, platoId }) => ({ tipo: "MESA", mesaId, items: [{ platoId, cantidad: 1.5 }] })],
      ["tipo desconocido", ({ platoId }) => ({ tipo: "BARRA", items: [{ platoId, cantidad: 1 }] })],
      ["mesa sin mesaId", ({ platoId }) => ({ tipo: "MESA", items: [{ platoId, cantidad: 1 }] })],
      ["domicilio sin dirección", ({ platoId }) => ({ tipo: "DOMICILIO", cliente: domicilio.cliente, items: [{ platoId, cantidad: 1 }] })],
      ["domicilio sin cliente", ({ platoId }) => ({ tipo: "DOMICILIO", direccionEntrega: "x", items: [{ platoId, cantidad: 1 }] })],
      ["mesa con direccionEntrega", ({ mesaId, platoId }) => ({ tipo: "MESA", mesaId, direccionEntrega: "x", items: [{ platoId, cantidad: 1 }] })],
      ["domicilio con mesaId", ({ mesaId, platoId }) => ({ tipo: "DOMICILIO", mesaId, ...domicilio, items: [{ platoId, cantidad: 1 }] })],
      ["campo desconocido", ({ mesaId, platoId }) => ({ tipo: "MESA", mesaId, total: 1, items: [{ platoId, cantidad: 1 }] })],
    ];
    it.each(casos)("%s", async (_n, cuerpo) => {
      const { mesa, hamburguesa } = await sembrar(env.api);
      const res = await env.api.post("/api/pedidos").send(cuerpo({ mesaId: mesa.id, platoId: hamburguesa.id }) as object);
      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toMatch(/DATOS_INVALIDOS|MESA_REQUERIDA|DATOS_DOMICILIO_REQUERIDOS/);
    });

    it("JSON malformado", async () => {
      const res = await env.api.post("/api/pedidos").set("Content-Type", "application/json").send("{no es json");
      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe("JSON_INVALIDO");
    });
  });

  it("404 si la mesa o el plato no existen", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const sinMesa = await env.api.post("/api/pedidos").send({ tipo: "MESA", mesaId: 999, items: [{ platoId: hamburguesa.id, cantidad: 1 }] });
    expect(sinMesa.status).toBe(404);
    expect(sinMesa.body.error.codigo).toBe("MESA_NO_ENCONTRADA");
    const sinPlato = await env.api.post("/api/pedidos").send({ tipo: "MESA", mesaId: mesa.id, items: [{ platoId: 999, cantidad: 1 }] });
    expect(sinPlato.status).toBe(404);
    expect(sinPlato.body.error.codigo).toBe("PLATO_NO_ENCONTRADO");
  });

  it("GET /pedidos/:id devuelve 404 si no existe y 400 si el id es inválido", async () => {
    expect((await env.api.get("/api/pedidos/12345")).status).toBe(404);
    expect((await env.api.get("/api/pedidos/abc")).status).toBe(400);
  });

  describe("caso alterno de CU-02: cancelar o modificar antes de preparar", () => {
    it("modifica los platillos de un pedido ENVIADO y recalcula el total", async () => {
      const { mesa, hamburguesa } = await sembrar(env.api);
      const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 2);
      const res = await env.api.put(`/api/pedidos/${p.id}/items`).send({ items: [{ platoId: hamburguesa.id, cantidad: 3 }] });
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(25.5);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].cantidad).toBe(3);
    });

    it("la modificación también valida inventario, excluyendo el propio pedido", async () => {
      const { mesa, hamburguesa } = await sembrar(env.api);
      const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 3); // 450 g
      const ok = await env.api.put(`/api/pedidos/${p.id}/items`).send({ items: [{ platoId: hamburguesa.id, cantidad: 3 }] });
      expect(ok.status).toBe(200); // no se cuenta contra sí mismo
      const mal = await env.api.put(`/api/pedidos/${p.id}/items`).send({ items: [{ platoId: hamburguesa.id, cantidad: 4 }] });
      expect(mal.status).toBe(409);
      expect(mal.body.error.codigo).toBe("STOCK_INSUFICIENTE");
    });

    it("cancela un pedido ENVIADO, libera la mesa, notifica a cocina y libera el stock comprometido", async () => {
      const { mesa, hamburguesa } = await sembrar(env.api);
      const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 3);
      const res = await env.api.post(`/api/pedidos/${p.id}/cancelar`);
      expect(res.status).toBe(200);
      expect(res.body.estado).toBe("CANCELADO");
      expect((await env.api.get("/api/mesas")).body[0].estado).toBe("LIBRE");
      expect((await env.api.get("/api/platos/" + hamburguesa.id)).body.porcionesDisponibles).toBe(3);
      const cocina = (await env.api.get(`/api/notificaciones?destino=COCINA&pedidoId=${p.id}`)).body;
      expect(cocina.some((n: any) => n.mensaje.includes("cancelado"))).toBe(true);
      expect((await env.api.get("/api/cocina/pedidos")).body).toHaveLength(0);
    });

    it("no permite cancelar ni modificar una vez iniciada la preparación (409)", async () => {
      const { mesa, hamburguesa } = await sembrar(env.api);
      const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
      await env.api.post(`/api/cocina/pedidos/${p.id}/iniciar`);
      const c = await env.api.post(`/api/pedidos/${p.id}/cancelar`);
      expect(c.status).toBe(409);
      expect(c.body.error.codigo).toBe("PEDIDO_NO_CANCELABLE");
      const m = await env.api.put(`/api/pedidos/${p.id}/items`).send({ items: [{ platoId: hamburguesa.id, cantidad: 1 }] });
      expect(m.status).toBe(409);
      expect(m.body.error.codigo).toBe("PEDIDO_NO_MODIFICABLE");
    });
  });

  it("dos pedidos concurrentes no pueden sobrevender el stock", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const body = { tipo: "MESA", mesaId: mesa.id, items: [{ platoId: hamburguesa.id, cantidad: 2 }] }; // 300 g cada uno
    const [a, b] = await Promise.all([env.api.post("/api/pedidos").send(body), env.api.post("/api/pedidos").send(body)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });
});
