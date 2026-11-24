export type TipoPedido = "MESA" | "DOMICILIO";
export type EstadoPedido =
  | "ENVIADO"
  | "EN_PREPARACION"
  | "LISTO"
  | "CERRADO"
  | "CANCELADO"
  | "DEVUELTO";
export type EstadoPago = "PENDIENTE_PAGO" | "PAGADO";
export type EstadoEntrega = "ASIGNADA" | "EN_CAMINO" | "ENTREGADO" | "DEVUELTO";
export type MetodoPago = "EFECTIVO" | "TARJETA" | "TRANSFERENCIA";
export type ResultadoPago = "APROBADO" | "DENEGADO";
export type DestinoNotificacion = "SALON" | "COCINA";

export interface Mesa {
  id: number;
  numero: number;
  estado: "LIBRE" | "OCUPADA";
}

export interface Ingrediente {
  id: number;
  nombre: string;
  unidad: string;
}

export interface ExistenciaInventario {
  ingredienteId: number;
  ingrediente: string;
  unidad: string;
  cantidad: number;
  comprometido: number;
  disponible: number;
}

export interface RecetaLinea {
  ingredienteId: number;
  ingrediente: string;
  unidad: string;
  cantidad: number;
}

export interface Plato {
  id: number;
  nombre: string;
  precio: number;
  activo: boolean;
  receta: RecetaLinea[];
  /** Porciones que se pueden preparar con el stock no comprometido. */
  porcionesDisponibles: number;
  disponible: boolean;
}

export interface PedidoItem {
  id: number;
  platoId: number;
  plato: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  nota: string | null;
}

export interface Pedido {
  id: number;
  tipo: TipoPedido;
  estado: EstadoPedido;
  pagoEstado: EstadoPago;
  mesa: { id: number; numero: number } | null;
  cliente: { nombre: string; telefono: string } | null;
  direccionEntrega: string | null;
  notas: string | null;
  total: number;
  items: PedidoItem[];
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface Pago {
  id: number;
  pedidoId: number;
  metodo: MetodoPago;
  total: number;
  montoRecibido: number | null;
  resultado: ResultadoPago;
  motivoDenegacion: string | null;
  referencia: string | null;
  creadoEn: Date;
}

export interface Entrega {
  id: number;
  pedidoId: number;
  repartidor: string;
  estado: EstadoEntrega;
  direccion: string;
  cliente: { nombre: string; telefono: string };
  motivoDevolucion: string | null;
  tomadaEn: Date;
  enCaminoEn: Date | null;
  finalizadaEn: Date | null;
}

export interface Notificacion {
  id: number;
  destino: DestinoNotificacion;
  pedidoId: number | null;
  mensaje: string;
  creadaEn: Date;
}

/** Fila de requerimiento de un plato solicitado frente al stock disponible. */
export interface RequerimientoFila {
  platoId: number;
  plato: string;
  ingredienteId: number;
  ingrediente: string;
  unidad: string;
  requeridoPlato: number;
  requeridoTotal: number;
  disponible: number;
}

export interface ConsumoIngrediente {
  ingredienteId: number;
  ingrediente: string;
  unidad: string;
  cantidad: number;
}
