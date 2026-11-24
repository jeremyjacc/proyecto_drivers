import { describe, expect, it } from "vitest";
import { dejarListo, pedidoDeMesa, pedidoDomicilio, sembrar, usarEntorno } from "./helpers/entorno";

const env = usarEntorno();

async function existencias() {
  const inv = (await env.api.get("/api/inventario")).body as any[];
  return Object.fromEntries(inv.map((i) => [i.ingrediente, i.cantidad]));
}

describe("CU-03 Cobrar y descontar inventario (F-01)", () => {
  it("genera el total desde el pedido", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 2);
    const res = await env.api.get(`/api/pedidos/${p.id}/total`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pedidoId: p.id, total: 17, pagoEstado: "PENDIENTE_PAGO" });
  });

  it("efectivo: cobra, calcula el cambio, descuenta EXACTAMENTE según la receta y cierra la orden", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 2);
    await dejarListo(env.api, p.id);
    expect(await existencias()).toEqual({ Carne: 500, Pan: 10 }); // aún sin descontar

    const res = await env.api.post(`/api/pedidos/${p.id}/pagos`).send({ metodo: "EFECTIVO", montoRecibido: 20 });
    expect(res.status).toBe(201);
    expect(res.body.cambio).toBe(3);
    expect(res.body.pago).toMatchObject({ metodo: "EFECTIVO", total: 17, resultado: "APROBADO", montoRecibido: 20 });
    expect(res.body.pedido).toMatchObject({ estado: "CERRADO", pagoEstado: "PAGADO" });
    expect(res.body.ingredientesDescontados).toEqual([
      expect.objectContaining({ ingrediente: "Carne", cantidad: 300 }),
      expect.objectContaining({ ingrediente: "Pan", cantidad: 2 }),
    ]);

    // 2 hamburguesas × (150 g carne, 1 pan)
    expect(await existencias()).toEqual({ Carne: 200, Pan: 8 });
    const inv = (await env.api.get("/api/inventario")).body;
    expect(inv.every((i: any) => i.comprometido === 0)).toBe(true);
    expect((await env.api.get("/api/mesas")).body[0].estado).toBe("LIBRE");
    expect((await env.api.get(`/api/pedidos/${p.id}/pagos`)).body).toHaveLength(1);

    // trazabilidad en movimientos_inventario
    const { rows } = await env.pool.query(
      "SELECT i.nombre, m.cantidad FROM movimientos_inventario m JOIN ingredientes i ON i.id = m.ingrediente_id WHERE m.tipo='CONSUMO' AND m.pedido_id=$1 ORDER BY i.nombre",
      [p.id],
    );
    expect(rows.map((r) => [r.nombre, Number(r.cantidad)])).toEqual([["Carne", 300], ["Pan", 2]]);
  });

  it("tarjeta aprobada: cobra sin cambio y descuenta", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
    await dejarListo(env.api, p.id);
    const res = await env.api
      .post(`/api/pedidos/${p.id}/pagos`)
      .send({ metodo: "TARJETA", resultadoAutorizacion: "APROBADO", referencia: "AUT-123" });
    expect(res.status).toBe(201);
    expect(res.body.cambio).toBe(0);
    expect(res.body.pago.referencia).toBe("AUT-123");
    expect(await existencias()).toEqual({ Carne: 350, Pan: 9 });
  });

  it("pago DENEGADO: responde 402, NO descuenta inventario, NO cierra y la orden queda pendiente de pago", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 2);
    await dejarListo(env.api, p.id);

    const res = await env.api
      .post(`/api/pedidos/${p.id}/pagos`)
      .send({ metodo: "TARJETA", resultadoAutorizacion: "DENEGADO", motivoDenegacion: "Fondos insuficientes" });
    expect(res.status).toBe(402);
    expect(res.body.error.codigo).toBe("PAGO_DENEGADO");
    expect(res.body.error.mensaje).toContain("Fondos insuficientes");

    expect(await existencias()).toEqual({ Carne: 500, Pan: 10 });
    const pedido = (await env.api.get(`/api/pedidos/${p.id}`)).body;
    expect(pedido).toMatchObject({ estado: "LISTO", pagoEstado: "PENDIENTE_PAGO" });
    expect((await env.api.get("/api/mesas")).body[0].estado).toBe("OCUPADA");
    const { rows } = await env.pool.query("SELECT count(*)::int AS n FROM movimientos_inventario WHERE tipo='CONSUMO'");
    expect(rows[0].n).toBe(0);

    // el intento denegado queda registrado
    const pagos = (await env.api.get(`/api/pedidos/${p.id}/pagos`)).body;
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({ resultado: "DENEGADO", motivoDenegacion: "Fondos insuficientes" });

    // y se puede reintentar con éxito después
    const reintento = await env.api.post(`/api/pedidos/${p.id}/pagos`).send({ metodo: "EFECTIVO", montoRecibido: 17 });
    expect(reintento.status).toBe(201);
    expect(await existencias()).toEqual({ Carne: 200, Pan: 8 });
    expect((await env.api.get(`/api/pedidos/${p.id}/pagos`)).body).toHaveLength(2);
  });

  it("efectivo insuficiente se trata como pago denegado (402) y no descuenta", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 2);
    await dejarListo(env.api, p.id);
    const res = await env.api.post(`/api/pedidos/${p.id}/pagos`).send({ metodo: "EFECTIVO", montoRecibido: 10 });
    expect(res.status).toBe(402);
    expect(await existencias()).toEqual({ Carne: 500, Pan: 10 });
    expect((await env.api.get(`/api/pedidos/${p.id}`)).body.pagoEstado).toBe("PENDIENTE_PAGO");
  });

  it("no se puede cobrar dos veces el mismo pedido (409) ni descontar dos veces", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
    await dejarListo(env.api, p.id);
    await env.api.post(`/api/pedidos/${p.id}/pagos`).send({ metodo: "EFECTIVO", montoRecibido: 8.5 });
    const otra = await env.api.post(`/api/pedidos/${p.id}/pagos`).send({ metodo: "EFECTIVO", montoRecibido: 8.5 });
    expect(otra.status).toBe(409);
    expect(otra.body.error.codigo).toBe("PEDIDO_YA_PAGADO");
    expect(await existencias()).toEqual({ Carne: 350, Pan: 9 });
  });

  it("pagos concurrentes del mismo pedido: solo uno se aprueba", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
    await dejarListo(env.api, p.id);
    const envio = () => env.api.post(`/api/pedidos/${p.id}/pagos`).send({ metodo: "EFECTIVO", montoRecibido: 10 });
    const [a, b] = await Promise.all([envio(), envio()]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await existencias()).toEqual({ Carne: 350, Pan: 9 });
  });

  it("solo se cobran pedidos LISTO (409 si está ENVIADO)", async () => {
    const { mesa, hamburguesa } = await sembrar(env.api);
    const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
    const res = await env.api.post(`/api/pedidos/${p.id}/pagos`).send({ metodo: "EFECTIVO", montoRecibido: 50 });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe("PEDIDO_NO_COBRABLE");
  });

  it("el descuento es transaccional: si falta stock real se revierte todo", async () => {
    const { mesa, hamburguesa, pan } = await sembrar(env.api);
    const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 2);
    await dejarListo(env.api, p.id);
    // Se altera el inventario por fuera de la API (merma) para forzar la inconsistencia
    await env.pool.query("UPDATE inventario SET cantidad = 1 WHERE ingrediente_id = $1", [pan.id]);
    const res = await env.api.post(`/api/pedidos/${p.id}/pagos`).send({ metodo: "EFECTIVO", montoRecibido: 17 });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe("INVENTARIO_INCONSISTENTE");
    // La carne (que se descontó primero dentro de la transacción) debe haberse revertido
    expect(await existencias()).toEqual({ Carne: 500, Pan: 1 });
    expect((await env.api.get(`/api/pedidos/${p.id}`)).body).toMatchObject({ estado: "LISTO", pagoEstado: "PENDIENTE_PAGO" });
    expect((await env.api.get(`/api/pedidos/${p.id}/pagos`)).body).toHaveLength(0);
  });

  it("domicilio: el cobro deja el pedido PAGADO pero sigue LISTO hasta la entrega", async () => {
    const { hamburguesa } = await sembrar(env.api);
    const p = await pedidoDomicilio(env.api, hamburguesa.id, 1);
    await dejarListo(env.api, p.id);
    const res = await env.api.post(`/api/pedidos/${p.id}/pagos`).send({ metodo: "TRANSFERENCIA", resultadoAutorizacion: "APROBADO" });
    expect(res.status).toBe(201);
    expect(res.body.pedido).toMatchObject({ estado: "LISTO", pagoEstado: "PAGADO" });
    expect(await existencias()).toEqual({ Carne: 350, Pan: 9 });
  });

  describe("datos inválidos (400)", () => {
    const casos: [string, object][] = [
      ["método desconocido", { metodo: "CHEQUE", montoRecibido: 10 }],
      ["efectivo sin monto", { metodo: "EFECTIVO" }],
      ["monto negativo", { metodo: "EFECTIVO", montoRecibido: -5 }],
      ["tarjeta sin resultado de autorización", { metodo: "TARJETA" }],
      ["campo desconocido", { metodo: "EFECTIVO", montoRecibido: 10, total: 1 }],
    ];
    it.each(casos)("%s", async (_n, cuerpo) => {
      const { mesa, hamburguesa } = await sembrar(env.api);
      const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
      await dejarListo(env.api, p.id);
      const res = await env.api.post(`/api/pedidos/${p.id}/pagos`).send(cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe("DATOS_INVALIDOS");
      expect(await existencias()).toEqual({ Carne: 500, Pan: 10 });
    });
  });

  it("404 si el pedido no existe", async () => {
    expect((await env.api.post("/api/pedidos/999/pagos").send({ metodo: "EFECTIVO", montoRecibido: 1 })).status).toBe(404);
    expect((await env.api.get("/api/pedidos/999/total")).status).toBe(404);
  });
});
