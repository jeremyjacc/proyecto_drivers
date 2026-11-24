import type { Request, Response } from "express";
import type { CobroService } from "../../application/cobro.service";
import { datos, type Infer } from "../middlewares/validar";
import type { cobrarBody, pedidoIdParam } from "../schemas";

export class CobroController {
  constructor(private readonly svc: CobroService) {}

  total = async (req: Request, res: Response) => {
    const { pedidoId } = datos<Infer<typeof pedidoIdParam>>(req, "params");
    res.json(await this.svc.totalDelPedido(pedidoId));
  };
  cobrar = async (req: Request, res: Response) => {
    const { pedidoId } = datos<Infer<typeof pedidoIdParam>>(req, "params");
    const b = datos<Infer<typeof cobrarBody>>(req, "body");
    res.status(201).json(await this.svc.cobrar({ pedidoId, ...b }));
  };
  pagos = async (req: Request, res: Response) => {
    const { pedidoId } = datos<Infer<typeof pedidoIdParam>>(req, "params");
    res.json(await this.svc.pagosDelPedido(pedidoId));
  };
}
