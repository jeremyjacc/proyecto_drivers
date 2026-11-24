/**
 * Errores de negocio. No conocen HTTP: la capa de presentación decide
 * qué código de estado corresponde a cada `tipo`.
 */
export type TipoError = "validacion" | "no_encontrado" | "conflicto" | "pago_denegado";

export class AppError extends Error {
  constructor(
    public readonly tipo: TipoError,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalles?: unknown,
  ) {
    super(mensaje);
    this.name = "AppError";
  }
}

export const validacion = (codigo: string, mensaje: string, detalles?: unknown) =>
  new AppError("validacion", codigo, mensaje, detalles);

export const noEncontrado = (codigo: string, mensaje: string, detalles?: unknown) =>
  new AppError("no_encontrado", codigo, mensaje, detalles);

export const conflicto = (codigo: string, mensaje: string, detalles?: unknown) =>
  new AppError("conflicto", codigo, mensaje, detalles);

export const pagoDenegado = (mensaje: string, detalles?: unknown) =>
  new AppError("pago_denegado", "PAGO_DENEGADO", mensaje, detalles);
