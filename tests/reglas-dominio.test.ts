import { describe, expect, it } from "vitest";
import { AppError } from "../src/domain/errors";
import {
  asegurarTransicion,
  evaluarPago,
  evaluarStock,
  TRANSICIONES_ENTREGA,
  TRANSICIONES_PEDIDO,
} from "../src/domain/reglas";

describe("reglas de dominio (unitarias, sin base de datos)", () => {
  it("transiciones de pedido permitidas e inválidas", () => {
    expect(() => asegurarTransicion(TRANSICIONES_PEDIDO, "ENVIADO", "EN_PREPARACION", "el pedido")).not.toThrow();
    expect(() => asegurarTransicion(TRANSICIONES_PEDIDO, "EN_PREPARACION", "LISTO", "el pedido")).not.toThrow();
    expect(() => asegurarTransicion(TRANSICIONES_PEDIDO, "ENVIADO", "LISTO", "el pedido")).toThrow(AppError);
    expect(() => asegurarTransicion(TRANSICIONES_PEDIDO, "EN_PREPARACION", "CANCELADO", "el pedido")).toThrow(AppError);
    expect(() => asegurarTransicion(TRANSICIONES_PEDIDO, "CERRADO", "LISTO", "el pedido")).toThrow(AppError);
  });

  it("transiciones de entrega", () => {
    expect(() => asegurarTransicion(TRANSICIONES_ENTREGA, "ASIGNADA", "EN_CAMINO", "la entrega")).not.toThrow();
    expect(() => asegurarTransicion(TRANSICIONES_ENTREGA, "EN_CAMINO", "DEVUELTO", "la entrega")).not.toThrow();
    expect(() => asegurarTransicion(TRANSICIONES_ENTREGA, "ASIGNADA", "ENTREGADO", "la entrega")).toThrow(AppError);
    expect(() => asegurarTransicion(TRANSICIONES_ENTREGA, "ENTREGADO", "DEVUELTO", "la entrega")).toThrow(AppError);
  });

  it("evaluarStock bloquea solo los platos con ingredientes insuficientes", () => {
    const fila = (platoId: number, ing: number, total: number, disp: number) => ({
      platoId, plato: `P${platoId}`, ingredienteId: ing, ingrediente: `I${ing}`, unidad: "g",
      requeridoPlato: total, requeridoTotal: total, disponible: disp,
    });
    const r = evaluarStock([fila(1, 1, 100, 100), fila(2, 2, 50, 49.9), fila(2, 3, 10, 5)]);
    expect(r).toHaveLength(1);
    expect(r[0].platoId).toBe(2);
    expect(r[0].faltantes.map((f) => f.ingredienteId)).toEqual([2, 3]);
  });

  it("evaluarPago: efectivo con cambio, efectivo insuficiente, tarjeta aprobada y denegada", () => {
    expect(evaluarPago({ metodo: "EFECTIVO", total: 17, montoRecibido: 20 })).toEqual({ aprobado: true, cambio: 3 });
    expect(evaluarPago({ metodo: "EFECTIVO", total: 17.1, montoRecibido: 20 })).toEqual({ aprobado: true, cambio: 2.9 });
    expect(evaluarPago({ metodo: "EFECTIVO", total: 17, montoRecibido: 16.99 })).toMatchObject({ aprobado: false });
    expect(evaluarPago({ metodo: "TARJETA", total: 17, resultadoAutorizacion: "APROBADO" })).toEqual({ aprobado: true, cambio: 0 });
    expect(
      evaluarPago({ metodo: "TARJETA", total: 17, resultadoAutorizacion: "DENEGADO", motivoDenegacion: "Sin fondos" }),
    ).toEqual({ aprobado: false, motivo: "Sin fondos" });
  });
});
