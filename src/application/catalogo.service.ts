import { conflicto, noEncontrado, validacion } from "../domain/errors";
import type { UnidadDeTrabajo } from "../persistence/unit-of-work";

/** Mesas, ingredientes, recetas/platos e inventario (módulos Ingredientes e Inventario). */
export class CatalogoService {
  constructor(private readonly uow: UnidadDeTrabajo) {}

  crearMesa(numero: number) {
    return this.uow.lectura.mesas.crear(numero);
  }
  listarMesas() {
    return this.uow.lectura.mesas.listar();
  }

  crearIngrediente(datos: { nombre: string; unidad: string; existenciaInicial: number }) {
    return this.uow.transaccion(async (r) => {
      const ing = await r.ingredientes.crear(datos.nombre, datos.unidad);
      await r.inventario.inicializar(ing.id, datos.existenciaInicial);
      return { ...ing, existencia: datos.existenciaInicial };
    });
  }
  listarIngredientes() {
    return this.uow.lectura.ingredientes.listar();
  }

  async reponerInventario(ingredienteId: number, cantidad: number) {
    return this.uow.transaccion(async (r) => {
      if (!(await r.ingredientes.obtener(ingredienteId))) {
        throw noEncontrado("INGREDIENTE_NO_ENCONTRADO", `No existe el ingrediente ${ingredienteId}`);
      }
      await r.inventario.reponer(ingredienteId, cantidad);
      return (await r.inventario.obtener(ingredienteId))!;
    });
  }
  listarInventario() {
    return this.uow.lectura.inventario.listar();
  }

  crearPlato(datos: {
    nombre: string;
    precio: number;
    receta: { ingredienteId: number; cantidad: number }[];
  }) {
    return this.uow.transaccion(async (r) => {
      const ids = datos.receta.map((l) => l.ingredienteId);
      if (new Set(ids).size !== ids.length) {
        throw validacion("RECETA_DUPLICADA", "La receta repite ingredientes");
      }
      const existentes = await r.ingredientes.idsExistentes(ids);
      const faltan = ids.filter((id) => !existentes.includes(id));
      if (faltan.length) {
        throw conflicto("INGREDIENTE_NO_ENCONTRADO", "La receta usa ingredientes inexistentes", {
          ingredientesInexistentes: faltan,
        });
      }
      const id = await r.platos.crear(datos.nombre, datos.precio, datos.receta);
      return (await r.platos.obtener(id))!;
    });
  }
  listarPlatos() {
    return this.uow.lectura.platos.listar();
  }
  async obtenerPlato(id: number) {
    const plato = await this.uow.lectura.platos.obtener(id);
    if (!plato) throw noEncontrado("PLATO_NO_ENCONTRADO", `No existe el plato ${id}`);
    return plato;
  }
}
