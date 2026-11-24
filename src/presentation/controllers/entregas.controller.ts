import type { Request, Response } from "express";
import type { EntregasService } from "../../application/entregas.service";
import { datos, type Infer } from "../middlewares/validar";
import type { devolverEntregaBody, idParam, listarEntregasQuery, tomarEntregaBody } from "../schemas";

export class EntregasController {
  constructor(private readonly svc: EntregasService) {}

  pendientes = async (_req: Request, res: Response) => {
    res.json(await this.svc.pendientesDeTomar());
  };
  listar = async (req: Request, res: Response) => {
    res.json(await this.svc.listar(datos<Infer<typeof listarEntregasQuery>>(req, "query")));
  };
  tomar = async (req: Request, res: Response) => {
    const b = datos<Infer<typeof tomarEntregaBody>>(req, "body");
    const e = await this.svc.tomar(b.pedidoId, b.repartidor);
    res.status(201).location(`/api/entregas/${e.id}`).json(e);
  };
  obtener = async (req: Request, res: Response) => {
    const { id } = datos<Infer<typeof idParam>>(req, "params");
    res.json(await this.svc.obtener(id));
  };
  enCamino = async (req: Request, res: Response) => {
    const { id } = datos<Infer<typeof idParam>>(req, "params");
    res.json(await this.svc.enCamino(id));
  };
  entregado = async (req: Request, res: Response) => {
    const { id } = datos<Infer<typeof idParam>>(req, "params");
    res.json(await this.svc.entregado(id));
  };
  devuelto = async (req: Request, res: Response) => {
    const { id } = datos<Infer<typeof idParam>>(req, "params");
    const b = datos<Infer<typeof devolverEntregaBody>>(req, "body");
    res.json(await this.svc.devuelto(id, b.motivo));
  };
}
