import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../src");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? archivos(p) : p.endsWith(".ts") ? [p] : [];
  });
}

/** Módulos importados (relativos y paquetes) por cada archivo de una capa. */
function importaciones(archivo: string): string[] {
  const src = readFileSync(archivo, "utf8");
  return [...src.matchAll(/(?:import|export)[^'"]*?from\s+["']([^"']+)["']|import\(["']([^"']+)["']\)/g)].map(
    (m) => m[1] ?? m[2],
  );
}

function capaDe(archivo: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const destino = path.relative(SRC, path.resolve(path.dirname(archivo), spec));
  return destino.split(path.sep)[0];
}

const capa = (nombre: string) => archivos(path.join(SRC, nombre));

describe("Arquitectura monolítica en capas: dependencias descendentes", () => {
  it("domain no depende de ninguna otra capa ni de frameworks", () => {
    for (const f of capa("domain")) {
      for (const spec of importaciones(f)) {
        expect(spec, f).toMatch(/^\.\/|^\.\.\/domain/);
      }
    }
  });

  it("application no importa Express, pg, zod ni la capa de presentación", () => {
    for (const f of capa("application")) {
      for (const spec of importaciones(f)) {
        expect(["express", "pg", "zod"], `${f} importa ${spec}`).not.toContain(spec);
        expect(capaDe(f, spec), `${f} importa ${spec}`).not.toBe("presentation");
      }
    }
  });

  it("application solo accede a la persistencia mediante la unidad de trabajo (sin SQL)", () => {
    for (const f of capa("application")) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/);
      for (const spec of importaciones(f)) {
        if (capaDe(f, spec) === "persistence") {
          expect(spec, f).toMatch(/unit-of-work$/);
        }
      }
    }
  });

  it("presentation no importa persistence ni ejecuta SQL", () => {
    for (const f of capa("presentation")) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\b(SELECT|INSERT INTO|DELETE FROM)\b|\.query\(/);
      for (const spec of importaciones(f)) {
        expect(spec, `${f} importa ${spec}`).not.toBe("pg");
        expect(capaDe(f, spec), `${f} importa ${spec}`).not.toBe("persistence");
      }
    }
  });

  it("los controladores dependen de servicios de aplicación y no contienen reglas de negocio", () => {
    const controladores = capa("presentation/controllers");
    expect(controladores.length).toBeGreaterThan(0);
    for (const f of controladores) {
      for (const spec of importaciones(f)) {
        const c = capaDe(f, spec);
        if (c === null) continue; // paquetes externos (express, zod)
        expect(["application", "presentation", "domain"], `${f} importa ${spec}`).toContain(c);
        expect(spec, f).not.toMatch(/domain\/reglas/);
      }
    }
  });

  it("persistence no depende de application ni de presentation", () => {
    for (const f of capa("persistence")) {
      for (const spec of importaciones(f)) {
        expect(["application", "presentation"], `${f} importa ${spec}`).not.toContain(capaDe(f, spec));
        expect(spec, f).not.toBe("express");
      }
    }
  });
});
