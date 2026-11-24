import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny, z } from "zod";
import { validacion } from "../../domain/errors";

type Fuente = "body" | "params" | "query";

/** Valida y reemplaza la fuente (body/params/query) por el valor ya tipado. */
export function validar<S extends ZodTypeAny>(fuente: Fuente, schema: S) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const r = schema.safeParse(req[fuente]);
    if (!r.success) {
      return next(
        validacion(
          "DATOS_INVALIDOS",
          "La solicitud contiene datos inválidos",
          r.error.issues.map((i) => ({ campo: i.path.join("."), mensaje: i.message })),
        ),
      );
    }
    // En Express 5 req.query es de solo lectura: se guarda en una propiedad propia.
    (req as any).validado = { ...((req as any).validado ?? {}), [fuente]: r.data };
    next();
  };
}

export function datos<T>(req: Request, fuente: Fuente): T {
  return (req as any).validado[fuente] as T;
}

export type Infer<S extends ZodTypeAny> = z.infer<S>;
