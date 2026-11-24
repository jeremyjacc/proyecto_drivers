import { describe, expect, it } from "vitest";
import { dejarListo, domicilio, pedidoDeMesa, pedidoDomicilio, sembrar, usarEntorno } from "./helpers/entorno";

const env = usarEntorno();

async function domicilioListo() {
  const { hamburguesa, mesa } = await sembrar(env.api);
  const p = await pedidoDomicilio(env.api, hamburguesa.id, 1);
  await dejarListo(env.api, p.id);
  return { pedido: p, hamburguesa, mesa };
}

describe("CU-04 Gestionar envío a domicilio (F-03)", () => {
  it("lista los pedidos a domicilio listos pendientes de repartidor", async () => {
    const { pedido, hamburguesa, mesa } = await domicilioListo();
    await pedidoDomicilio(env.api, hamburguesa.id, 1); // sigue ENVIADO: no debe aparecer
    const mesaLista = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
    await dejarListo(env.api, mesaLista.id); // de mesa: no debe aparecer
    const res = await env.api.get("/api/entregas/pendientes");
    expect(res.status).toBe(200);
    expect(res.body.map((p: any) => p.id)).toEqual([pedido.id]);
    expect(res.body[0].direccionEntrega).toBe(domicilio.direccionEntrega);
  });

  it("flujo exitoso: tomar → EN_CAMINO → ENTREGADO y cierra el pedido", async () => {
    const { pedido } = await domicilioListo();

    const tomar = await env.api.post("/api/entregas").send({ pedidoId: pedido.id, repartidor: "Luis Mora" });
    expect(tomar.status).toBe(201);
    expect(tomar.body).toMatchObject({
      pedidoId: pedido.id,
      repartidor: "Luis Mora",
      estado: "ASIGNADA",
      direccion: domicilio.direccionEntrega, // F-03: la dirección viaja con la entrega
      cliente: domicilio.cliente,
    });
    expect((await env.api.get("/api/entregas/pendientes")).body).toHaveLength(0);

    const enCamino = await env.api.post(`/api/entregas/${tomar.body.id}/en-camino`);
    expect(enCamino.status).toBe(200);
    expect(enCamino.body.estado).toBe("EN_CAMINO");
    expect(enCamino.body.enCaminoEn).not.toBeNull();

    const entregado = await env.api.post(`/api/entregas/${tomar.body.id}/entregado`);
    expect(entregado.status).toBe(200);
    expect(entregado.body.estado).toBe("ENTREGADO");
    expect(entregado.body.finalizadaEn).not.toBeNull();
    expect((await env.api.get(`/api/pedidos/${pedido.id}`)).body.estado).toBe("CERRADO");
    expect((await env.api.get(`/api/entregas/${tomar.body.id}`)).body.estado).toBe("ENTREGADO");
  });

  it("flujo devuelto: cliente ilocalizable → DEVUELTO con motivo, pedido DEVUELTO y aviso al salón", async () => {
    const { pedido } = await domicilioListo();
    const e = (await env.api.post("/api/entregas").send({ pedidoId: pedido.id, repartidor: "Luis Mora" })).body;
    await env.api.post(`/api/entregas/${e.id}/en-camino`);

    const res = await env.api.post(`/api/entregas/${e.id}/devuelto`).send({ motivo: "Cliente ilocalizable" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: "DEVUELTO", motivoDevolucion: "Cliente ilocalizable" });
    expect((await env.api.get(`/api/pedidos/${pedido.id}`)).body.estado).toBe("DEVUELTO");
    const salon = (await env.api.get(`/api/notificaciones?destino=SALON&pedidoId=${pedido.id}`)).body;
    expect(salon.some((n: any) => n.mensaje.includes("devuelto"))).toBe(true);
  });

  it("filtra entregas por estado y repartidor", async () => {
    const { pedido } = await domicilioListo();
    const e = (await env.api.post("/api/entregas").send({ pedidoId: pedido.id, repartidor: "Luis Mora" })).body;
    await env.api.post(`/api/entregas/${e.id}/en-camino`);
    expect((await env.api.get("/api/entregas?estado=EN_CAMINO&repartidor=Luis%20Mora")).body).toHaveLength(1);
    expect((await env.api.get("/api/entregas?estado=ENTREGADO")).body).toHaveLength(0);
    expect((await env.api.get("/api/entregas?repartidor=Otro")).body).toHaveLength(0);
    expect((await env.api.get("/api/entregas?estado=XX")).status).toBe(400);
  });

  describe("reglas de estado (409)", () => {
    it("no se puede entregar ni devolver sin haber salido EN_CAMINO", async () => {
      const { pedido } = await domicilioListo();
      const e = (await env.api.post("/api/entregas").send({ pedidoId: pedido.id, repartidor: "Luis" })).body;
      const a = await env.api.post(`/api/entregas/${e.id}/entregado`);
      expect(a.status).toBe(409);
      expect(a.body.error.codigo).toBe("ESTADO_INVALIDO");
      expect((await env.api.post(`/api/entregas/${e.id}/devuelto`).send({ motivo: "x" })).status).toBe(409);
      expect((await env.api.get(`/api/pedidos/${pedido.id}`)).body.estado).toBe("LISTO");
    });

    it("una entrega finalizada no cambia de estado", async () => {
      const { pedido } = await domicilioListo();
      const e = (await env.api.post("/api/entregas").send({ pedidoId: pedido.id, repartidor: "Luis" })).body;
      await env.api.post(`/api/entregas/${e.id}/en-camino`);
      await env.api.post(`/api/entregas/${e.id}/entregado`);
      expect((await env.api.post(`/api/entregas/${e.id}/devuelto`).send({ motivo: "x" })).status).toBe(409);
      expect((await env.api.post(`/api/entregas/${e.id}/en-camino`)).status).toBe(409);
    });

    it("no se puede tomar un pedido que aún no está LISTO", async () => {
      const { hamburguesa } = await sembrar(env.api);
      const p = await pedidoDomicilio(env.api, hamburguesa.id, 1);
      const res = await env.api.post("/api/entregas").send({ pedidoId: p.id, repartidor: "Luis" });
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe("PEDIDO_NO_LISTO");
    });

    it("no se puede tomar un pedido de mesa", async () => {
      const { hamburguesa, mesa } = await sembrar(env.api);
      const p = await pedidoDeMesa(env.api, mesa.id, hamburguesa.id, 1);
      await dejarListo(env.api, p.id);
      const res = await env.api.post("/api/entregas").send({ pedidoId: p.id, repartidor: "Luis" });
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe("PEDIDO_NO_ES_DOMICILIO");
    });

    it("dos repartidores no pueden tomar el mismo pedido", async () => {
      const { pedido } = await domicilioListo();
      const [a, b] = await Promise.all([
        env.api.post("/api/entregas").send({ pedidoId: pedido.id, repartidor: "Luis" }),
        env.api.post("/api/entregas").send({ pedidoId: pedido.id, repartidor: "Marta" }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const otra = await env.api.post("/api/entregas").send({ pedidoId: pedido.id, repartidor: "Pedro" });
      expect(otra.body.error.codigo).toBe("ENTREGA_YA_TOMADA");
    });
  });

  describe("datos inválidos y no encontrados", () => {
    it("400 al tomar sin repartidor o con pedidoId inválido", async () => {
      expect((await env.api.post("/api/entregas").send({ pedidoId: 1 })).status).toBe(400);
      expect((await env.api.post("/api/entregas").send({ pedidoId: "uno", repartidor: "L" })).status).toBe(400);
    });
    it("400 al devolver sin motivo", async () => {
      const { pedido } = await domicilioListo();
      const e = (await env.api.post("/api/entregas").send({ pedidoId: pedido.id, repartidor: "Luis" })).body;
      await env.api.post(`/api/entregas/${e.id}/en-camino`);
      const res = await env.api.post(`/api/entregas/${e.id}/devuelto`).send({});
      expect(res.status).toBe(400);
      expect((await env.api.get(`/api/entregas/${e.id}`)).body.estado).toBe("EN_CAMINO");
    });
    it("404 con pedido o entrega inexistentes", async () => {
      expect((await env.api.post("/api/entregas").send({ pedidoId: 999, repartidor: "L" })).status).toBe(404);
      expect((await env.api.get("/api/entregas/999")).status).toBe(404);
      expect((await env.api.post("/api/entregas/999/en-camino")).status).toBe(404);
    });
  });
});

describe("CU-03 ∩ CU-04: cobro de un pedido a domicilio ya entregado", () => {
  it("el pedido entregado sin cobrar sigue reservando stock y se puede cobrar después", async () => {
    const { pedido } = await domicilioListo();
    const e = (await env.api.post("/api/entregas").send({ pedidoId: pedido.id, repartidor: "Luis" })).body;
    await env.api.post(`/api/entregas/${e.id}/en-camino`);
    await env.api.post(`/api/entregas/${e.id}/entregado`);
    expect((await env.api.get(`/api/pedidos/${pedido.id}`)).body).toMatchObject({ estado: "CERRADO", pagoEstado: "PENDIENTE_PAGO" });

    const inv = (await env.api.get("/api/inventario")).body.find((i: any) => i.ingrediente === "Carne");
    expect(inv).toMatchObject({ cantidad: 500, comprometido: 150 });

    const pago = await env.api.post(`/api/pedidos/${pedido.id}/pagos`).send({ metodo: "EFECTIVO", montoRecibido: 10 });
    expect(pago.status).toBe(201);
    expect(pago.body.pedido).toMatchObject({ estado: "CERRADO", pagoEstado: "PAGADO" });
    const despues = (await env.api.get("/api/inventario")).body.find((i: any) => i.ingrediente === "Carne");
    expect(despues).toMatchObject({ cantidad: 350, comprometido: 0 });
  });

  it("un pedido devuelto no se puede cobrar y libera el stock comprometido", async () => {
    const { pedido } = await domicilioListo();
    const e = (await env.api.post("/api/entregas").send({ pedidoId: pedido.id, repartidor: "Luis" })).body;
    await env.api.post(`/api/entregas/${e.id}/en-camino`);
    await env.api.post(`/api/entregas/${e.id}/devuelto`).send({ motivo: "Cliente ilocalizable" });
    const res = await env.api.post(`/api/pedidos/${pedido.id}/pagos`).send({ metodo: "EFECTIVO", montoRecibido: 10 });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe("PEDIDO_NO_COBRABLE");
    const inv = (await env.api.get("/api/inventario")).body.find((i: any) => i.ingrediente === "Carne");
    expect(inv).toMatchObject({ cantidad: 500, comprometido: 0 });
  });
});
