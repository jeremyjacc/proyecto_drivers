# Bitácora de incrementos y cambios — Restosistem

**Proyecto:** Restosistem — Arquitectura de Software, RdA 1, Criterio 2 (Semana 5)
**Alcance de esta bitácora:** implementación del monolito en capas (presentación → aplicación → persistencia), contrato OpenAPI, pruebas y documentación.

> **Cómo leerla.** Cada incremento indica el driver atendido, el caso de uso, los archivos tocados, las pruebas ejecutadas con su resultado real y los pendientes. Los resultados de pruebas citados son los obtenidos al ejecutar `npm test` contra PostgreSQL 16 en el momento indicado.
>
> **Nota de honestidad sobre el versionado.** El repositorio `https://github.com/jeremyjacc/proyecto_drivers.git` partió del commit inicial `3ec4938` (2026-11-23) y los incrementos de este Criterio 2 (`INC-01`…`INC-08`) se consolidaron y verificaron el 2026-11-24 sobre la rama `main`.

## Antecedentes (entregas previas, no modificadas)

| Fecha | Entrega | Contenido relevante |
|---|---|---|
| 04/11/2026 | Criterio 1, Parte 1 | Drivers F-01, F-02, F-03; casos de uso CU-01…CU-04; restricciones R-01, R-02, R-03. |
| 12/11/2026 | Criterio 1, Parte 2 | Escenarios de calidad QA-01…QA-05 y árbol de utilidad. |

Los drivers y casos de uso **no se modificaron**; se implementaron tal como están documentados.

## Trazabilidad driver → caso de uso → escenario de calidad

| Driver | Caso de uso | Regla / Restricción | Escenario y métrica comprobable | Endpoints / Componentes |
|---|---|---|---|---|
| **F-01** Control exacto de existencias y registro de ventas | `CU-01`, `CU-03` | `R-01` (descuento estricto por receta) | **QA-04:** 0 cobros aprobados duplicados (`UNIQUE`), 0 saldos negativos (`CHECK >= 0`) y rollback completo si falta stock en concurrencia | `POST /api/pedidos`, `POST /api/pedidos/{pedidoId}/pagos`, `cobro.service.ts`, `inventario.repository.ts`, `pago.repository.ts` |
| **F-02** Cocina ve pedidos y actualiza estados | `CU-01`, `CU-02` | `R-02` (red local LAN) | **QA-01:** polling exclusivo en vista Cocina cada **1.5 s** (≤ 2 s), detenido al cambiar de pestaña<br>**QA-03:** toma de pedido estándar en **≤ 12 interacciones** | `GET /api/cocina/pedidos`, `…/iniciar`, `…/listo`, `preparacion.service.ts`, `public/app.js` |
| **F-01 / F-02** Continuidad sin internet externo | `CU-01`…`CU-04` | `R-02` (operación local) | **QA-02:** 0 dependencias externas en `public/`, rutas relativas `/api/...` y alerta visible ante pérdida de conexión LAN | `public/index.html`, `public/styles.css`, `public/app.js`, `src/app.ts` |
| **F-03** Seguimiento de entregas y direcciones | `CU-04` | `R-03` (teléfonos de repartidores) | **QA-05:** vista Repartidor mobile-first ligera sin descarga de inventario ni polling rápido; flujo `ASIGNADA → EN_CAMINO → ENTREGADO \| DEVUELTO` | `GET /api/entregas/pendientes`, `POST /api/entregas`, `entregas.service.ts`, `entrega.repository.ts` |

**Alcance excluido explícito:** facturación electrónica conectada al SRI, pasarelas de pago en línea reales, módulo de RRHH/nómina, programas de fidelización, autenticación/roles y replicación hacia nube externa.

**Justificación de red local (`R-02`):** ante cortes o inestabilidad del proveedor de Internet (ISP) en horas pico, operar íntegramente en la LAN del restaurante (backend Node.js + PostgreSQL local + activos estáticos locales sin CDNs) garantiza continuidad operativa sin pérdida de pedidos ni bloqueos en cocina o caja.

---

## INC-01 — Base del monolito: dominio, esquema PostgreSQL y catálogos
- **Fecha:** 2026-11-24
- **Driver:** F-01 (R-01: recetas e inventario como base del descuento exacto); soporte a F-02 y F-03.
- **Caso de uso:** habilita CU-01…CU-04.
- **Archivos/componentes:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `docker-compose.yml`, `.env.example`; `src/domain/{entities,errors,reglas}.ts`; `src/persistence/database/{pool,migrate,migrate-cli,seed-cli}.ts`; `src/persistence/database/migrations/001_esquema_inicial.sql`; repositorios de mesas, ingredientes, inventario y platos; `src/persistence/unit-of-work.ts`; `src/application/catalogo.service.ts`.
- **Cambio:** esquema con restricciones `CHECK`, claves foráneas y `inventario.cantidad >= 0`; recetas (plato–ingrediente–cantidad) por porción; unidad de trabajo transaccional (`BEGIN/COMMIT/ROLLBACK`); migraciones SQL versionadas en `schema_migrations`.
- **Pruebas:** verificación manual con `npm run db:migrate` y `npm run db:seed` (segunda ejecución del seed no duplica datos). Las pruebas automatizadas de los flujos se agregaron en INC-02…INC-05.
- **Resultado:** migración aplicada sobre base vacía sin errores; `npx tsc --noEmit` sin errores.
- **Pendientes:** autenticación y roles (no solicitado en este criterio).

## INC-02 — CU-01 Registrar pedido (incluye alterno de CU-02: cancelar/modificar)
- **Fecha:** 2026-11-24
- **Driver:** F-01 (R-01), F-02.
- **Caso de uso:** CU-01; alterno de CU-02.
- **Archivos/componentes:** `application/pedidos.service.ts`; `persistence/repositories/pedido.repository.ts`; `presentation/{schemas.ts,controllers/pedidos.controller.ts,routes/index.ts,middlewares/*}`; `app.ts`, `server.ts`; `tests/cu01-pedidos.test.ts`.
- **Cambio:** `POST /api/pedidos` (mesa o domicilio) valida datos (Zod), existencia de mesa/platos y **stock por receta** descontando lo ya comprometido por pedidos abiertos; si falta stock responde `409 STOCK_INSUFICIENTE` con el detalle de platos/ingredientes, no persiste el pedido y notifica al salón. Si hay stock, persiste el pedido, ocupa la mesa y notifica a cocina. `PUT /api/pedidos/{id}/items` y `POST /api/pedidos/{id}/cancelar` solo en estado `ENVIADO`. Bloqueo `FOR UPDATE` de existencias para evitar sobreventa concurrente.
- **Pruebas:** `tests/cu01-pedidos.test.ts` (éxito mesa/domicilio, sin inventario, stock comprometido, líneas repetidas, 8 casos de datos inválidos, JSON malformado, 404, modificar/cancelar, concurrencia).
- **Resultado:** al ejecutar la suite completa por primera vez (CU-01…CU-04 + reglas de dominio) pasaron 61/61 pruebas.
- **Pendientes:** R-02 (modo offline) y QA-01 (latencia ≤ 2 s con 30 mesas) no se implementaron/midieron (ver P-02, P-04).

## INC-03 — CU-02 Gestionar preparación
- **Fecha:** 2026-11-24
- **Driver:** F-02.
- **Caso de uso:** CU-02.
- **Archivos/componentes:** `application/preparacion.service.ts`; `presentation/controllers/pedidos.controller.ts` (`PreparacionController`); `domain/reglas.ts` (máquina de estados); `persistence/repositories/notificacion.repository.ts`; `tests/cu02-preparacion.test.ts`.
- **Cambio:** tablero de cocina (`ENVIADO` y `EN_PREPARACION`, más antiguos primero); transiciones `ENVIADO → EN_PREPARACION → LISTO` con `409 ESTADO_INVALIDO` en cualquier otra; al marcar "Listo" se crea la notificación al salón.
- **Pruebas:** `tests/cu02-preparacion.test.ts` (8 casos: orden del tablero, flujo completo + notificación, transiciones inválidas, pedido cancelado, 404/400, filtros).
- **Resultado:** incluidas en las 61/61 mencionadas en INC-02.
- **Pendientes:** la notificación es un registro consultable por HTTP; no hay empuje en tiempo real (WebSocket/SSE) — ver P-04.

## INC-04 — CU-03 Cobrar y descontar inventario
- **Fecha:** 2026-11-24
- **Driver:** F-01.
- **Caso de uso:** CU-03.
- **Archivos/componentes:** `application/cobro.service.ts`; `persistence/repositories/{pago,inventario}.repository.ts`; `presentation/controllers/cobro.controller.ts`; `domain/reglas.ts` (`evaluarPago`); `tests/cu03-cobro.test.ts`.
- **Cambio:** `GET …/total` (el total lo calcula el sistema, no el cliente); `POST …/pagos` en **una sola transacción**: bloquea el pedido, evalúa el pago, descuenta cada ingrediente según receta × cantidad (`UPDATE … WHERE cantidad >= x`), registra movimientos de inventario, guarda el pago y cierra la orden (mesa → `CERRADO`; domicilio → `PAGADO`). **Pago denegado** (autorización denegada o efectivo insuficiente) → `402 PAGO_DENEGADO`, se registra el intento, no se descuenta inventario y la orden queda `PENDIENTE_PAGO`. Índice único parcial: un solo pago aprobado por pedido.
- **Pruebas:** `tests/cu03-cobro.test.ts` (efectivo con cambio y descuento exacto verificado en tabla de movimientos, tarjeta, pago denegado + reintento, efectivo insuficiente, doble cobro, cobros concurrentes, rollback transaccional ante inventario inconsistente, 5 casos de datos inválidos, 404).
- **Resultado:** incluidas en las 61/61 mencionadas en INC-02.
- **Pendientes:** no hay pasarela de pago real (fuera de alcance; el cajero informa el resultado de autorización). Sin reembolsos.

## INC-05 — CU-04 Gestionar envío a domicilio
- **Fecha:** 2026-11-24
- **Driver:** F-03.
- **Caso de uso:** CU-04.
- **Archivos/componentes:** `application/entregas.service.ts`; `persistence/repositories/entrega.repository.ts`; `presentation/controllers/entregas.controller.ts`; `tests/cu04-entregas.test.ts`.
- **Cambio:** `GET /api/entregas/pendientes`; `POST /api/entregas` (solo pedidos de domicilio `LISTO`; restricción `UNIQUE(pedido_id)` impide que dos repartidores tomen el mismo pedido); `ASIGNADA → EN_CAMINO → ENTREGADO | DEVUELTO`. `ENTREGADO` cierra el pedido; `DEVUELTO` (cliente ilocalizable, con motivo obligatorio) pasa el pedido a `DEVUELTO` y avisa al salón. La entrega expone dirección y cliente (F-03).
- **Pruebas:** `tests/cu04-entregas.test.ts` (listado de pendientes, flujo exitoso, flujo devuelto, filtros, transiciones inválidas, pedido de mesa, concurrencia, 400/404).
- **Resultado:** incluidas en las 61/61 mencionadas en INC-02.
- **Pendientes:** R-03 (interfaz móvil para repartidores): se entrega la **API** apta para un cliente móvil; la interfaz de usuario no forma parte de este criterio (ver P-03).

## INC-06 — Contrato OpenAPI y pruebas de contrato/arquitectura
- **Fecha:** 2026-11-24
- **Driver:** F-01, F-02, F-03 (documentación verificable de todos los flujos).
- **Caso de uso:** CU-01…CU-04.
- **Archivos/componentes:** `docs/openapi.yaml`; `tests/contrato-openapi.test.ts`; `tests/arquitectura-capas.test.ts`.
- **Cambio:** contrato OpenAPI 3.0.3 con las 28 operaciones del router `/api` más `/health`, esquemas reutilizables, ejemplos y errores. Las pruebas comprueban que (a) el YAML es válido, (b) las rutas documentadas coinciden **exactamente** con las registradas en Express, y (c) las respuestas reales (éxitos y errores 400/402/404/409) cumplen los esquemas documentados. Las pruebas de arquitectura inspeccionan las importaciones: dominio sin dependencias; aplicación sin Express/pg/zod ni SQL; presentación sin `pg`, sin persistencia y sin SQL; persistencia sin capas superiores.
- **Pruebas:** `npm test`.
- **Resultado:** 71/71 pruebas pasando (7 archivos). `tsc --noEmit` sin errores. Un primer intento de la prueba de arquitectura falló por un defecto de la propia prueba (trataba los paquetes externos como capa desconocida); se corrigió la prueba, no el código.
- **Pendientes:** el contrato no está generado automáticamente desde el código; se mantiene a mano y la prueba de paridad evita que diverja.

## INC-07 — Ajuste CU-03 ∩ CU-04: cobro de pedido a domicilio ya entregado
- **Fecha:** 2026-11-24
- **Driver:** F-01, F-03.
- **Caso de uso:** CU-03 (precondición "Entregado/Listo" del documento del Criterio 1, Parte 1) y CU-04.
- **Archivos/componentes:** `application/cobro.service.ts`; `persistence/repositories/{inventario,plato}.repository.ts`; `docs/openapi.yaml`; `tests/cu04-entregas.test.ts`; `tests/cu03-cobro.test.ts` (título de un caso).
- **Cambio:** al revisar los documentos se detectó que un pedido a domicilio entregado (`CERRADO`) y aún no cobrado no podía cobrarse. Ahora es cobrable, y mientras tenga el pago pendiente sigue **reservando** stock (evita vender lo que se descontará al cobrar). Un pedido `DEVUELTO` no es cobrable y libera su stock.
- **Pruebas:** 2 pruebas nuevas en `tests/cu04-entregas.test.ts`; suite completa.
- **Resultado:** 73/73 pruebas pasando.
- **Pendientes:** si un pedido ya pagado se devuelve, el sistema no gestiona reembolso ni reposición automática de inventario.

## INC-08 — Validación cruzada de pedidos, ajuste de contrato/README y verificación en PostgreSQL 18
- **Fecha:** 2026-11-24
- **Driver:** F-01, F-02, F-03 (consistencia de entrada, contrato OpenAPI y reproducibilidad de pruebas).
- **Caso de uso:** CU-01…CU-04.
- **Archivos/componentes:** `src/presentation/schemas.ts`; `docs/openapi.yaml`; `README.md`; `tests/cu01-pedidos.test.ts`; `tests/contrato-openapi.test.ts`.
- **Cambio:** se agregó `.superRefine` en `crearPedidoBody` (`schemas.ts`) para rechazar en presentación mezclas inválidas (`MESA` sin `mesaId` o con datos de domicilio; `DOMICILIO` sin cliente/dirección o con `mesaId`). Se alineó `minLength: 1` del filtro `repartidor` en `docs/openapi.yaml`. Se corrigió el ejemplo de `curl` en `README.md` (`cantidad: 50` en lugar de `500`, respetando el límite `max(100)`). Se ampliaron `tests/contrato-openapi.test.ts` (validación `201` de catálogos) y `tests/cu01-pedidos.test.ts` (2 casos `400` de validación cruzada). Se inicializó el repositorio Git local (`main`) con `.env` y `node_modules` excluidos en `.gitignore`.
- **Pruebas:** `npm run typecheck`, `npm run db:migrate`, `npm run db:seed`, `npm test` contra PostgreSQL 18 local y verificación en vivo de `GET /health`, `GET /api/platos` y `POST /api/pedidos` (`409 STOCK_INSUFICIENTE`).
- **Resultado:** `tsc --noEmit` sin errores; **75/75 pruebas pasando** (7 archivos).
- **Pendientes:** crear los commits en Git y subir al repositorio remoto en GitHub (`P-01`).

## INC-09 — Interfaz web operativa ligera conectada a la API REST
- **Fecha:** 2026-11-24
- **Driver:** F-01, F-02, F-03 (visualización y operación integral de los 4 flujos sin alterar la arquitectura en capas).
- **Caso de uso:** CU-01…CU-04.
- **Archivos/componentes:** `public/index.html`, `public/styles.css`, `public/app.js`; `src/app.ts`; `README.md`.
- **Cambio:** se incorporó una interfaz web estática servida en `/` desde `src/app.ts` con vistas por rol (**Mesero**, **Cocina**, **Caja**, **Repartidor**, **Inventario y Catálogo**) y una consola inferior que muestra el código HTTP y JSON real devuelto por cada endpoint `/api/*`. No modifica el router `/api`, las capas ni el contrato OpenAPI.
- **Pruebas:** `npm run typecheck`, `npm test` y verificación en vivo de `GET /` + consola visual contra PostgreSQL 18.
- **Resultado:** `tsc --noEmit` sin errores; **75/75 pruebas pasando** (7 archivos); interfaz web verificada en `/` junto con `/styles.css`, `/app.js` y `/health`.
- **Pendientes:** verificación manual en navegador por el autor y registro del commit final en Moodle (`P-01`).

## INC-10 — Auditoría arquitectónica de concurrencia (QA-04), LAN local (QA-02), Cocina/Repartidor (QA-01/QA-05) y trazabilidad
- **Fecha:** 2026-11-25
- **Driver:** F-01, F-02, F-03 (`R-01`, `R-02`, `R-03`, `QA-01`…`QA-05`).
- **Caso de uso:** CU-01…CU-04.
- **Archivos/componentes:** `tests/cu03-cobro.test.ts`; `public/index.html`; `public/styles.css`; `public/app.js`; `README.md`; `docs/bitacora.md`.
- **Cambio:** se agregó prueba concurrente (`Promise.all`) de dos pedidos compitiendo por el último ingrediente disponible y validación explícita de 0 cobros aprobados duplicados y 0 saldos negativos. En la interfaz web local (`public/`) se incorporó banner de caída/reconexión LAN (`#lan-alert`), carga selectiva por vista (Repartidor mobile-first no descarga inventario/recetas ni hace polling rápido) y polling exclusivo en Cocina cada `1.5 s` (detenido al salir de la pestaña). Se completó la matriz de trazabilidad con métricas comprobables, exclusiones de alcance, justificación LAN y referencias técnicas.
- **Pruebas:** `npm run typecheck` y `npm test` contra PostgreSQL 18 local.
- **Resultado:** `tsc --noEmit` sin errores; **76/76 pruebas pasando** (7 archivos, incluyendo concurrencia sobre último ingrediente); `0` recursos externos en `public/` y UI verificada en vivo.
- **Pendientes:** publicar en GitHub (`P-01`).

## INC-11 — Publicación HTTP del contrato en `GET /openapi.yaml`
- **Fecha:** 2026-11-25
- **Driver:** F-01, F-02, F-03 (verificabilidad directa del contrato OpenAPI desde el servidor).
- **Caso de uso:** CU-01…CU-04.
- **Archivos/componentes:** `src/app.ts`; `tests/contrato-openapi.test.ts`; `README.md`; `docs/bitacora.md`.
- **Cambio:** se expuso `GET /openapi.yaml` (`application/yaml`) en la raíz de composición (`src/app.ts`) alineando el proyecto con la práctica de referencia de la semana 5 sin alterar el router `/api`, junto con su prueba automatizada en `tests/contrato-openapi.test.ts`.
- **Pruebas:** `npm run typecheck` y `npm test`.
- **Resultado:** `tsc --noEmit` sin errores; **77/77 pruebas pasando** (7 archivos).

---

## Pendientes y limitaciones (estado real)

| ID | Pendiente | Motivo / estado |
|---|---|---|
| P-01 | Indicar en Moodle la rama (`main`) y el hash del commit tras hacer `git push` a GitHub | Commit preparado sobre `origin/main` (`3ec4938`) en `https://github.com/jeremyjacc/proyecto_drivers.git`. |
| P-02 | **R-02** sincronización hacia nube tras cortes de Internet | No implementado (el sistema opera 100 % en LAN local; la replicación eventual hacia la nube queda para etapas posteriores). |
| P-03 | **QA-05** auditoría automatizada con Lighthouse en CI/CD y PWA offline | Se entrega vista web mobile-first ligera sin dependencias externas; la auditoría Lighthouse en CI queda pendiente. |
| P-04 | **QA-01** y **QA-04** pruebas de carga con 30 mesas simultáneas (JMeter) | Cocina actualiza vía polling cada 1.5 s y las transacciones están cubiertas por pruebas de concurrencia; falta benchmark de 30 clientes con JMeter. |
| P-05 | Autenticación, roles y auditoría de usuario | Fuera de alcance en este criterio. |
| P-06 | Cobertura de código (`vitest --coverage`) no configurada | Se verifican escenarios funcionales, concurrencia, capas y contrato OpenAPI. |

## Referencias técnicas

- Bass, L., Clements, P., & Kazman, R. *Software Architecture in Practice*. Addison-Wesley.
- ISO/IEC 25010. *Systems and software engineering — Systems and software Quality Requirements and Evaluation (SQuaRE)*.
