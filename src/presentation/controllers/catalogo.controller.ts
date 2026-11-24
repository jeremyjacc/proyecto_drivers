import type { Request, Response } from "express";
import type { CatalogoService } from "../../application/catalogo.service";
import { datos, type Infer } from "../middlewares/validar";
import type { crearIngredienteBody, crearMesaBody, crearPlatoBody, idParam, reponerBody } from "../schemas";

export class CatalogoController {
  constructor(private readonly svc: CatalogoService) {}

  crearMesa = async (req: Request, res: Response) => {
    const b = datos<Infer<typeof crearMesaBody>>(req, "body");
    res.status(201).json(await this.svc.crearMesa(b.numero));
  };
  listarMesas = async (_req: Request, res: Response) => {
    res.json(await this.svc.listarMesas());
  };

  crearIngrediente = async (req: Request, res: Response) => {
    res.status(201).json(await this.svc.crearIngrediente(datos<Infer<typeof crearIngredienteBody>>(req, "body")));
  };
  listarIngredientes = async (_req: Request, res: Response) => {
    res.json(await this.svc.listarIngredientes());
  };

  listarInventario = async (_req: Request, res: Response) => {
    res.json(await this.svc.listarInventario());
  };
  reponer = async (req: Request, res: Response) => {
    const { id } = datos<Infer<typeof idParam>>(req, "params");
    const b = datos<Infer<typeof reponerBody>>(req, "body");
    res.json(await this.svc.reponerInventario(id, b.cantidad));
  };

  crearPlato = async (req: Request, res: Response) => {
    res.status(201).json(await this.svc.crearPlato(datos<Infer<typeof crearPlatoBody>>(req, "body")));
  };
  listarPlatos = async (_req: Request, res: Response) => {
    res.json(await this.svc.listarPlatos());
  };
  obtenerPlato = async (req: Request, res: Response) => {
    const { id } = datos<Infer<typeof idParam>>(req, "params");
    res.json(await this.svc.obtenerPlato(id));
  };
}
