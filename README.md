# Restosistem

Sistema de gestion de restaurante. Monolito en capas: presentacion -> aplicacion -> persistencia.

## Requisitos
- Node.js 20+
- PostgreSQL 16 (o Docker)

## Instalacion
```bash
npm install
cp .env.example .env   # editar DATABASE_URL
```

## Base de datos
```bash
psql -U postgres -d restosistem -f db/schema.sql
psql -U postgres -d restosistem -f db/seed.sql
```

## Ejecucion
```bash
npm run dev
```

## Pruebas
```bash
npm test
```

## Estructura
- `src/presentation/` rutas y controladores HTTP
- `src/application/` casos de uso y reglas
- `src/persistence/` repositorios y SQL
- `docs/openapi.yaml` contrato de API
- `docs/bitacora.md` bitacora de incrementos
- `tests/` pruebas automatizadas
