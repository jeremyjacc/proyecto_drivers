# Restosistem

Sistema de gestión para restaurantes: comunicación mesero–cocina, pedidos a domicilio, control de inventario por recetas y seguimiento de entregas.
Proyecto de **Arquitectura de Software** — RdA 1, Criterio 2 (Semana 5): *monolito en capas, contrato de API, pruebas y bitácora*.

## Qué implementa

Cuatro flujos de punta a punta (HTTP → aplicación → PostgreSQL), con los drivers y casos de uso del Criterio 1:

| Caso de uso | Driver | Qué hace |
|---|---|---|
| **CU-01** Registrar pedido | F-01, F-02 | Valida el stock por receta (R-01), rechaza si no alcanza (409 + aviso al salón) y envía el pedido a cocina. Permite modificar/cancelar mientras esté `ENVIADO`. |
| **CU-02** Gestionar preparación | F-02 | Tablero de cocina; `ENVIADO → EN_PREPARACION → LISTO`; notifica al salón. |
| **CU-03** Cobrar y descontar inventario | F-01 | Total, método de pago, descuento exacto de ingredientes **en una transacción** y cierre de la orden. Pago denegado → 402, sin descuento, orden pendiente de pago. |
| **CU-04** Envío a domicilio | F-03 | El repartidor toma el pedido, `EN_CAMINO`, `ENTREGADO` o `DEVUELTO` (cliente ilocalizable). |

Módulos: Pedidos, Preparación, Ingredientes, Inventario, Ventas y Entregas.

### Alcance excluido y justificación de red local (LAN)

- **Fuera de alcance:** facturación electrónica conectada al SRI (solo se manejan totales y registros internos), pasarelas de pago en línea reales (el cajero registra el resultado de autorización), módulo de recursos humanos/nómina, programas de fidelización, autenticación/roles y sincronización asíncrona hacia nube externa.
- **Justificación de operación 100 % en red local (`R-02` / `QA-02`):** la conexión externa a Internet del restaurante puede interrumpirse o degradarse durante horas pico. Para no paralizar el salón, la cocina ni la caja, Restosistem ejecuta tanto el backend/PostgreSQL como la interfaz estática (`public/`) íntegramente en la red local (LAN), sin dependencias externas (`https://...` de CDNs, fuentes o iconos), consumiendo rutas relativas (`/api/...`) y alertando en pantalla si falla el servidor local.

### Matriz de trazabilidad (Drivers · Casos de Uso · Reglas · Escenarios)

| Driver | Caso de uso | Regla / Restricción | Escenario y métrica comprobable | Evidencia verificable |
|---|---|---|---|---|
| **F-01** Control exacto de inventario y ventas | `CU-01`, `CU-03` | `R-01` (receta obligatoria) | **QA-04:** 0 cobros aprobados duplicados, 0 saldos negativos en inventario bajo concurrencia, rollback completo ante stock insuficiente y descuento por transacción | `cobro.service.ts`, `001_esquema_inicial.sql`, `tests/cu03-cobro.test.ts` |
| **F-02** Pantallas en cocina en tiempo real | `CU-01`, `CU-02` | `R-02` (LAN estable) | **QA-01:** actualización en vista Cocina cada **1.5 s** (≤ 2 s) solo mientras la pestaña está activa<br>**QA-03:** toma de pedido estándar (4 platos, 2 bebidas, 1 modificador) en **≤ 12 interacciones** sin recargas | `preparacion.service.ts`, `public/app.js`, `tests/cu02-preparacion.test.ts` |
| **F-01 / F-02** Continuidad operativa | `CU-01`…`CU-04` | `R-02` (operación LAN) | **QA-02:** 0 recursos externos (`https://...`) en `public/`; peticiones relativas (`/api/...`) y aviso visible ante caída del servidor local | `public/index.html`, `public/styles.css`, `public/app.js` |
| **F-03** Seguimiento de entregas a domicilio | `CU-04` | `R-03` (móviles de repartidores) | **QA-05:** vista Repartidor mobile-first ligera (sin carga de inventario/recetas ni polling rápido), flujo `ASIGNADA → EN_CAMINO → ENTREGADO / DEVUELTO` | `entregas.service.ts`, `public/app.js`, `public/styles.css`, `tests/cu04-entregas.test.ts` |

## Tecnologías

Node.js ≥ 20 · TypeScript · Express 5 · PostgreSQL 16 (`pg`, SQL explícito) · Zod (validación) · OpenAPI 3.0 · Vitest + Supertest.

## Requisitos previos

- Node.js 20 o superior y npm.
- PostgreSQL 14+ (se probó con 16). Opciones: instalación local o Docker.

## Instalación

```bash
npm install
cp .env.example .env        # y ajusta los valores si hace falta
```

### Variables de entorno

| Variable | Descripción | Ejemplo (solo desarrollo) |
|---|---|---|
| `PORT` | Puerto HTTP | `3000` |
| `DATABASE_URL` | Base de datos de la aplicación | `postgresql://restosistem:restosistem@localhost:5432/restosistem` |
| `TEST_DATABASE_URL` | Base **exclusiva** de pruebas (su nombre debe contener `test`; **se borra y recrea** en cada ejecución) | `postgresql://restosistem:restosistem@localhost:5432/restosistem_test` |

Las credenciales del ejemplo son valores de desarrollo local; no uses estas en producción. `.env` está en `.gitignore`.

### Configuración de PostgreSQL

**Opción A — Docker** (crea las dos bases: `restosistem` y `restosistem_test`):

```bash
docker compose up -d
```

**Opción B — PostgreSQL local:**

```sql
CREATE USER restosistem WITH PASSWORD 'restosistem';
CREATE DATABASE restosistem OWNER restosistem;
CREATE DATABASE restosistem_test OWNER restosistem;
```

### Migraciones (creación de tablas)

```bash
npm run db:migrate    # aplica src/persistence/database/migrations/*.sql (idempotente)
npm run db:seed       # opcional: datos de DEMOSTRACIÓN (mesas, ingredientes, 2 platos con receta)
```

## Ejecutar

```bash
npm start             # http://localhost:3000 (interfaz web y API REST)
curl localhost:3000/health
```

Al abrir `http://localhost:3000` en el navegador se carga el panel operativo visual (Mesero, Cocina, Caja, Repartidor e Inventario/Catálogo), que consume directamente los endpoints `/api/*` del backend junto con un visor de la última llamada HTTP.

## Pruebas

```bash
npm test              # Vitest: recrea el esquema en TEST_DATABASE_URL y ejecuta toda la suite
npm run typecheck     # tsc --noEmit
```

Requiere PostgreSQL accesible en `TEST_DATABASE_URL`. La suite usa PostgreSQL real (no mocks) y limpia las tablas antes de cada prueba.

| Archivo | Verifica |
|---|---|
| `tests/cu01-pedidos.test.ts` | CU-01: éxito, sin inventario, stock comprometido, validaciones, cancelar/modificar, concurrencia |
| `tests/cu02-preparacion.test.ts` | CU-02: tablero, transiciones, notificación al salón, estados inválidos |
| `tests/cu03-cobro.test.ts` | CU-03: descuento exacto por receta, pago denegado, doble cobro, rollback transaccional |
| `tests/cu04-entregas.test.ts` | CU-04: entrega exitosa, devuelta, reglas de estado, cobro de pedido entregado |
| `tests/contrato-openapi.test.ts` | El YAML es válido, coincide con las rutas reales y las respuestas cumplen sus esquemas |
| `tests/arquitectura-capas.test.ts` | Dependencias descendentes entre capas, sin SQL en presentación |
| `tests/reglas-dominio.test.ts` | Reglas puras (transiciones, stock, pagos) |

## Contrato OpenAPI

Archivo: [`docs/openapi.yaml`](docs/openapi.yaml), también publicado en vivo en `GET http://localhost:3000/openapi.yaml`. Para verlo en una interfaz, por ejemplo:

```bash
npx @redocly/cli preview-docs docs/openapi.yaml       # o pega el YAML en https://editor.swagger.io
```

## Ejemplos de solicitudes

```bash
H='Content-Type: application/json'; B=http://localhost:3000/api

# CU-01: pedido de mesa (tras npm run db:seed)
curl -X POST $B/pedidos -H "$H" -d '{"tipo":"MESA","mesaId":1,"items":[{"platoId":1,"cantidad":2,"nota":"sin cebolla"}]}'

# Sin stock suficiente → 409 STOCK_INSUFICIENTE
curl -X POST $B/pedidos -H "$H" -d '{"tipo":"MESA","mesaId":1,"items":[{"platoId":1,"cantidad":50}]}'

# CU-02: cocina
curl $B/cocina/pedidos
curl -X POST $B/cocina/pedidos/1/iniciar
curl -X POST $B/cocina/pedidos/1/listo

# CU-03: pago denegado (402) y luego pago en efectivo (201, descuenta inventario)
curl -X POST $B/pedidos/1/pagos -H "$H" -d '{"metodo":"TARJETA","resultadoAutorizacion":"DENEGADO","motivoDenegacion":"Fondos insuficientes"}'
curl -X POST $B/pedidos/1/pagos -H "$H" -d '{"metodo":"EFECTIVO","montoRecibido":20}'
curl $B/inventario

# CU-04: pedido a domicilio → listo → repartidor
curl -X POST $B/pedidos -H "$H" -d '{"tipo":"DOMICILIO","cliente":{"nombre":"Ana Pérez","telefono":"0991234567"},"direccionEntrega":"Av. Siempre Viva 742","items":[{"platoId":2,"cantidad":1}]}'
# (iniciar y marcar listo el pedido, luego:)
curl -X POST $B/entregas -H "$H" -d '{"pedidoId":2,"repartidor":"Luis Mora"}'
curl -X POST $B/entregas/1/en-camino
curl -X POST $B/entregas/1/entregado          # o: /devuelto con {"motivo":"Cliente ilocalizable"}
```

Los errores tienen siempre la forma `{"error":{"codigo","mensaje","detalles"}}`. Códigos: 400 datos inválidos, 402 pago denegado, 404 no existe, 409 regla de negocio/estado.

## Arquitectura (monolito en capas)

```
Presentación ──▶ Aplicación ──▶ Persistencia ──▶ PostgreSQL
        ╲            │              ╱
         ╲──────▶  Dominio  ◀──────╱      (entidades, errores y reglas puras)
```

| Capa | Responsabilidad | Prohibido |
|---|---|---|
| `src/presentation` | Rutas, controladores, validación (Zod), mapeo error → HTTP | SQL, reglas de negocio |
| `src/application` | Casos de uso, orquestación y transacciones (vía `UnidadDeTrabajo`) | Express, `pg`, SQL |
| `src/persistence` | Repositorios con SQL, pool, migraciones, unidad de trabajo | Depender de application/presentation |
| `src/domain` | Estados, errores de negocio, reglas puras (stock, pagos, transiciones) | Depender de cualquier capa o framework |

`src/app.ts` es la raíz de composición donde se conectan las capas. `tests/arquitectura-capas.test.ts` hace cumplir estas reglas automáticamente.

## Estructura de carpetas

```
restosistem/
├── docs/
│   ├── openapi.yaml            # contrato de API
│   └── bitacora.md             # incrementos, trazabilidad con drivers, pendientes
├── public/                     # interfaz web ligera (consume /api/*)
├── src/
│   ├── config/env.ts
│   ├── domain/                 # entities.ts, errors.ts, reglas.ts
│   ├── application/            # catalogo, pedidos, preparacion, cobro, entregas (servicios/casos de uso)
│   ├── persistence/
│   │   ├── database/           # pool, migrate, seed, migrations/*.sql
│   │   ├── repositories/       # mesa, ingrediente, inventario, plato, pedido, pago, entrega, notificacion
│   │   └── unit-of-work.ts
│   ├── presentation/
│   │   ├── routes/ controllers/ middlewares/ schemas.ts
│   ├── app.ts                  # composición de capas
│   └── server.ts
├── tests/                      # Vitest + helpers
├── docker-compose.yml
└── .env.example
```

## Referencias técnicas

- Bass, L., Clements, P., & Kazman, R. *Software Architecture in Practice*. Addison-Wesley (escenarios de atributos de calidad, árbol de utilidad y tácticas de desempeño/disponibilidad).
- ISO/IEC 25010. *Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE) — System and software quality models* (características de adecuación funcional, eficiencia de desempeño, fiabilidad y usabilidad).
