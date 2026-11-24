import type { Request, Response } from "express";
import type { PedidosService } from "../../application/pedidos.service";
import type { PreparacionService } from "../../application/preparacion.service";
import { datos, type Infer } from "../middlewares/validar";
import type {
  crearPedidoBody,
  idParam,
  listarPedidosQuery,
  modificarPedidoBody,
  notificacionesQuery,
} from "../schemas";

export class PedidosController {
  constructor(private readonly svc: PedidosService) {}

  crear = async (req: Request, res: Response) => {
    const pedido = await this.svc.registrar(datos<Infer<typeof crearPedidoBody>>(req, "body"));
    res.status(201).location(`/api/pedidos/${pedido.id}`).json(pedido);
  };
  listar = async (req: Request, res: Response) => {
    res.json(await this.svc.listar(datos<Infer<typeof listarPedidosQuery>>(req, "query")));
  };
  obtener = async (req: Request, res: Response) => {
    const { id } = datos<Infer<typeof idParam>>(req, "params");
    res.json(await this.svc.obtener(id));
  };
  modificar = async (req: Request, res: Response) => {
    const { id } = datos<Infer<typeof idParam>>(req, "params");
    const b = datos<Infer<typeof modificarPedidoBody>>(req, "body");
    res.json(await this.svc.modificarItems(id, b.items));
  };
  cancelar = async (req: Request, res: Response) => {
    const { id } = datos<Infer<typeof idParam>>(req, "params");
    res.json(await this.svc.cancelar(id));
  };
}

export class PreparacionController {
  constructor(private readonly svc: PreparacionService) {}

  tablero = async (_req: Request, res: Response) => {
    res.json(await this.svc.tablero());
  };
  iniciar = async (req: Request, res: Response) => {
    const { id } = datos<Infer<typeof idParam>>(req, "params");
    res.json(await this.svc.iniciar(id));
  };
  listo = async (req: Request, res: Response) => {
    const { id } = datos<Infer<typeof idParam>>(req, "params");
    res.json(await this.svc.marcarListo(id));
  };
  notificaciones = async (req: Request, res: Response) => {
    res.json(await this.svc.notificaciones(datos<Infer<typeof notificacionesQuery>>(req, "query")));
  };
}
