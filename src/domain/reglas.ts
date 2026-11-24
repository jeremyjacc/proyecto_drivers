import { conflicto } from "./errors";
import type {
  EstadoEntrega,
  EstadoPedido,
  MetodoPago,
  RequerimientoFila,
} from "./entities";

/* ---------- Máquinas de estado (reglas de negocio puras) ---------- */

export const TRANSICIONES_PEDIDO: Record<EstadoPedido, EstadoPedido[]> = {
  ENVIADO: ["EN_PREPARACION", "CANCELADO"],
  EN_PREPARACION: ["LISTO"],
  LISTO: ["CERRADO", "DEVUELTO"],
  CERRADO: [],
  CANCELADO: [],
  DEVUELTO: [],
};

export const TRANSICIONES_ENTREGA: Record<EstadoEntrega, EstadoEntrega[]> = {
  ASIGNADA: ["EN_CAMINO"],
  EN_CAMINO: ["ENTREGADO", "DEVUELTO"],
  ENTREGADO: [],
  DEVUELTO: [],
};

export function asegurarTransicion<E extends string>(
  mapa: Record<E, E[]>,
  desde: E,
  hacia: E,
  entidad: string,
): void {
  if (!mapa[desde].includes(hacia)) {
    throw conflicto(
      "ESTADO_INVALIDO",
      `No se puede pasar ${entidad} de ${desde} a ${hacia}`,
      { estadoActual: desde, estadoSolicitado: hacia, permitidos: mapa[desde] },
    );
  }
}

/* ---------- R-01: validación de stock por receta ---------- */

export interface PlatoBloqueado {
  platoId: number;
  plato: string;
  faltantes: {
    ingredienteId: number;
    ingrediente: string;
    unidad: string;
    requerido: number;
    disponible: number;
  }[];
}

/**
 * Un plato queda bloqueado cuando alguno de sus ingredientes base no alcanza
 * para cubrir el total requerido por TODO el pedido (R-01).
 */
export function evaluarStock(filas: RequerimientoFila[]): PlatoBloqueado[] {
  const bloqueados = new Map<number, PlatoBloqueado>();
  for (const f of filas) {
    if (f.requeridoTotal > f.disponible) {
      const entrada =
        bloqueados.get(f.platoId) ??
        { platoId: f.platoId, plato: f.plato, faltantes: [] as PlatoBloqueado["faltantes"] };
      entrada.faltantes.push({
        ingredienteId: f.ingredienteId,
        ingrediente: f.ingrediente,
        unidad: f.unidad,
        requerido: f.requeridoTotal,
        disponible: Math.max(f.disponible, 0),
      });
      bloqueados.set(f.platoId, entrada);
    }
  }
  return [...bloqueados.values()];
}

/* ---------- CU-03: reglas de pago (sin pasarela externa) ---------- */

export interface SolicitudPago {
  metodo: MetodoPago;
  total: number;
  montoRecibido?: number;
  /** Resultado que el cajero registra desde el terminal/comprobante. */
  resultadoAutorizacion?: "APROBADO" | "DENEGADO";
  motivoDenegacion?: string;
}

export type EvaluacionPago =
  | { aprobado: true; cambio: number }
  | { aprobado: false; motivo: string };

export function redondear(valor: number, decimales = 2): number {
  const f = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * f) / f;
}

export function evaluarPago(s: SolicitudPago): EvaluacionPago {
  if (s.metodo === "EFECTIVO") {
    const recibido = s.montoRecibido ?? 0;
    if (recibido < s.total) {
      return {
        aprobado: false,
        motivo: `Monto recibido (${recibido.toFixed(2)}) insuficiente para el total (${s.total.toFixed(2)})`,
      };
    }
    return { aprobado: true, cambio: redondear(recibido - s.total) };
  }
  if (s.resultadoAutorizacion === "DENEGADO") {
    return { aprobado: false, motivo: s.motivoDenegacion ?? "Autorización denegada" };
  }
  return { aprobado: true, cambio: 0 };
}
