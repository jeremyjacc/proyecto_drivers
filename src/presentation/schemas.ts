import { z } from "zod";
//Plantilla de datos para  ID
const id = z.coerce.number().int().positive();
export const idParam = z.object({ id });
export const pedidoIdParam = z.object({ pedidoId: id });

const texto = (max = 200) => z.string().trim().min(1).max(max);
const cantidadPositiva = z.number().positive().finite();

export const crearMesaBody = z.object({ numero: z.number().int().positive() }).strict();
//PLANTILLA PARA CREAR INSUMO
export const crearIngredienteBody = z
  .object({
    nombre: texto(100),
    unidad: texto(20),
    existenciaInicial: z.number().min(0).finite().default(0),
  })
  .strict();

export const reponerBody = z.object({ cantidad: cantidadPositiva }).strict();
// PLANTILLA DE DATOS VÁLIDOS PARA CREAR PLATILLO
export const crearPlatoBody = z
  .object({
    nombre: texto(100),
    precio: z.number().min(0).finite(),
    receta: z
      .array(z.object({ ingredienteId: z.number().int().positive(), cantidad: cantidadPositiva }).strict())
      .min(1, "La receta debe tener al menos un ingrediente"),
  })
  .strict();
// PLANTILLA DE DATOS PARA CREAR UN ITEM DE PEDIDO
const itemPedido = z
  .object({
    platoId: z.number().int().positive(),
    cantidad: z.number().int().positive().max(100),
    nota: z.string().trim().max(200).nullish(),
  })
  .strict();
// PLANTILLA DE DATOS VÁLIDOS PARA CREAR PEDIDO
export const crearPedidoBody = z
  .object({
    tipo: z.enum(["MESA", "DOMICILIO"]),
    mesaId: z.number().int().positive().optional(),
    cliente: z.object({ nombre: texto(100), telefono: texto(30) }).strict().optional(),
    direccionEntrega: texto(300).optional(),
    notas: z.string().trim().max(300).nullish(),
    items: z.array(itemPedido).min(1, "El pedido debe tener al menos un platillo"),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.tipo === "MESA") {
      if (v.mesaId === undefined) {
        ctx.addIssue({ code: "custom", path: ["mesaId"], message: "Un pedido de mesa requiere mesaId" });
      }
      if (v.cliente !== undefined || v.direccionEntrega !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["tipo"],
          message: "Un pedido de mesa no debe incluir cliente ni direccionEntrega",
        });
      }
    } else if (v.tipo === "DOMICILIO") {
      if (!v.cliente || !v.direccionEntrega) {
        ctx.addIssue({
          code: "custom",
          path: !v.cliente ? ["cliente"] : ["direccionEntrega"],
          message: "Un pedido a domicilio requiere cliente y direccionEntrega",
        });
      }
      if (v.mesaId !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["mesaId"],
          message: "Un pedido a domicilio no debe incluir mesaId",
        });
      }
    }
  });

export const modificarPedidoBody = z
  .object({ items: z.array(itemPedido).min(1, "El pedido debe tener al menos un platillo") })
  .strict();

export const listarPedidosQuery = z.object({
  estado: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()) : undefined))
    .pipe(
      z
        .array(z.enum(["ENVIADO", "EN_PREPARACION", "LISTO", "CERRADO", "CANCELADO", "DEVUELTO"]))
        .optional(),
    ),
  tipo: z.enum(["MESA", "DOMICILIO"]).optional(),
});

export const notificacionesQuery = z.object({
  destino: z.enum(["SALON", "COCINA"]).optional(),
  pedidoId: z.coerce.number().int().positive().optional(),
});

export const cobrarBody = z
  .object({
    metodo: z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA"]),
    montoRecibido: z.number().min(0).finite().optional(),
    resultadoAutorizacion: z.enum(["APROBADO", "DENEGADO"]).optional(),
    motivoDenegacion: z.string().trim().max(200).optional(),
    referencia: z.string().trim().max(100).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.metodo === "EFECTIVO" && v.montoRecibido === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["montoRecibido"],
        message: "montoRecibido es obligatorio para pagos en efectivo",
      });
    }
    if (v.metodo !== "EFECTIVO" && v.resultadoAutorizacion === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["resultadoAutorizacion"],
        message: "resultadoAutorizacion es obligatorio para tarjeta y transferencia",
      });
    }
  });

export const tomarEntregaBody = z
  .object({ pedidoId: z.number().int().positive(), repartidor: texto(100) })
  .strict();

export const devolverEntregaBody = z.object({ motivo: texto(300) }).strict();

export const listarEntregasQuery = z.object({
  estado: z.enum(["ASIGNADA", "EN_CAMINO", "ENTREGADO", "DEVUELTO"]).optional(),
  repartidor: z.string().trim().min(1).optional(),
});
