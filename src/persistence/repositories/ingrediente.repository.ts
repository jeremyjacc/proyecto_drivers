import { conflicto } from "../../domain/errors";
import type { Ingrediente } from "../../domain/entities";
import type { Queryable } from "../database/pool";

const mapear = (r: any): Ingrediente => ({ id: r.id, nombre: r.nombre, unidad: r.unidad });

export class IngredienteRepository {
  constructor(private readonly db: Queryable) {}

  async crear(nombre: string, unidad: string): Promise<Ingrediente> {
    try {
      const { rows } = await this.db.query(
        "INSERT INTO ingredientes (nombre, unidad) VALUES ($1, $2) RETURNING id, nombre, unidad",
        [nombre, unidad],
      );
      return mapear(rows[0]);
    } catch (e: any) {
      if (e.code === "23505") {
        throw conflicto("INGREDIENTE_DUPLICADO", `Ya existe el ingrediente "${nombre}"`);
      }
      throw e;
    }
  }

  async obtener(id: number): Promise<Ingrediente | null> {
    const { rows } = await this.db.query(
      "SELECT id, nombre, unidad FROM ingredientes WHERE id = $1",
      [id],
    );
    return rows[0] ? mapear(rows[0]) : null;
  }

  async listar(): Promise<Ingrediente[]> {
    const { rows } = await this.db.query("SELECT id, nombre, unidad FROM ingredientes ORDER BY nombre");
    return rows.map(mapear);
  }

  /** Devuelve los ids que existen entre los solicitados. */
  async idsExistentes(ids: number[]): Promise<number[]> {
    const { rows } = await this.db.query("SELECT id FROM ingredientes WHERE id = ANY($1::int[])", [ids]);
    return rows.map((r) => r.id);
  }
}
