import "dotenv/config";

export interface Config {
  port: number;
  databaseUrl: string;
}

export function cargarConfig(): Config {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Falta la variable de entorno DATABASE_URL (ver .env.example)");
  }
  return { port: Number(process.env.PORT ?? 3000), databaseUrl };
}
