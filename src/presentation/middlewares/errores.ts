import type { NextFunction, Request, Response } from "express";
import { AppError, type TipoError } from "../../domain/errors";
// Mapeo de tipos de error a códigos de estado HTTP
// Un middleware es un código que se ejecuta
//  automáticamente antes o después del controlador 
// para no repetir código

// En este caso, se encarga de manejar los errores y 
// enviar respuestas JSON apropiadas al cliente.
const STATUS: Record<TipoError, number> = {
  validacion: 400,
  no_encontrado: 404,
  conflicto: 409,
  pago_denegado: 402,
};

export function noEncontradaRuta(req: Request, res: Response) {
  res.status(404).json({
    error: { codigo: "RUTA_NO_ENCONTRADA", mensaje: `No existe ${req.method} ${req.path}` },
  });
}

export function manejarErrores(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(STATUS[err.tipo]).json({
      error: { codigo: err.codigo, mensaje: err.message, detalles: err.detalles },
    });
  }
  if ((err as any)?.type === "entity.parse.failed") {
    return res.status(400).json({
      error: { codigo: "JSON_INVALIDO", mensaje: "El cuerpo de la solicitud no es JSON válido" },
    });
  }
  console.error(err);
  res.status(500).json({
    error: { codigo: "ERROR_INTERNO", mensaje: "Ocurrió un error inesperado" },
  });
}
