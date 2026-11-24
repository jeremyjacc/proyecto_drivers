-- Restosistem: esquema inicial (módulos Pedidos, Preparación, Ingredientes,
-- Inventario, Ventas y Entregas).

CREATE TABLE mesas (
  id      SERIAL PRIMARY KEY,
  numero  INTEGER NOT NULL UNIQUE CHECK (numero > 0),
  estado  TEXT NOT NULL DEFAULT 'LIBRE' CHECK (estado IN ('LIBRE', 'OCUPADA'))
);

-- Módulo Ingredientes
CREATE TABLE ingredientes (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL UNIQUE,
  unidad     TEXT NOT NULL,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Módulo Inventario (existencias actuales; nunca negativas)
CREATE TABLE inventario (
  ingrediente_id  INTEGER PRIMARY KEY REFERENCES ingredientes(id) ON DELETE CASCADE,
  cantidad        NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE platos (
  id      SERIAL PRIMARY KEY,
  nombre  TEXT NOT NULL UNIQUE,
  precio  NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  activo  BOOLEAN NOT NULL DEFAULT TRUE
);

-- Receta: ingredientes y cantidades exactas por porción (R-01)
CREATE TABLE recetas (
  plato_id        INTEGER NOT NULL REFERENCES platos(id) ON DELETE CASCADE,
  ingrediente_id  INTEGER NOT NULL REFERENCES ingredientes(id),
  cantidad        NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
  PRIMARY KEY (plato_id, ingrediente_id)
);

-- Módulo Pedidos
CREATE TABLE pedidos (
  id                 SERIAL PRIMARY KEY,
  tipo               TEXT NOT NULL CHECK (tipo IN ('MESA', 'DOMICILIO')),
  mesa_id            INTEGER REFERENCES mesas(id),
  cliente_nombre     TEXT,
  cliente_telefono   TEXT,
  direccion_entrega  TEXT,
  estado             TEXT NOT NULL DEFAULT 'ENVIADO'
                     CHECK (estado IN ('ENVIADO','EN_PREPARACION','LISTO','CERRADO','CANCELADO','DEVUELTO')),
  pago_estado        TEXT NOT NULL DEFAULT 'PENDIENTE_PAGO'
                     CHECK (pago_estado IN ('PENDIENTE_PAGO','PAGADO')),
  total              NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  notas              TEXT,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pedido_tipo_coherente CHECK (
    (tipo = 'MESA' AND mesa_id IS NOT NULL)
    OR (tipo = 'DOMICILIO' AND direccion_entrega IS NOT NULL
        AND cliente_nombre IS NOT NULL AND cliente_telefono IS NOT NULL)
  )
);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);

CREATE TABLE pedido_items (
  id               SERIAL PRIMARY KEY,
  pedido_id        INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  plato_id         INTEGER NOT NULL REFERENCES platos(id),
  cantidad         INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario  NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
  nota             TEXT
);
CREATE INDEX idx_pedido_items_pedido ON pedido_items(pedido_id);

-- Módulo Ventas (intentos de pago, aprobados y denegados)
CREATE TABLE pagos (
  id                 SERIAL PRIMARY KEY,
  pedido_id          INTEGER NOT NULL REFERENCES pedidos(id),
  metodo             TEXT NOT NULL CHECK (metodo IN ('EFECTIVO','TARJETA','TRANSFERENCIA')),
  total              NUMERIC(12,2) NOT NULL,
  monto_recibido     NUMERIC(12,2),
  resultado          TEXT NOT NULL CHECK (resultado IN ('APROBADO','DENEGADO')),
  motivo_denegacion  TEXT,
  referencia         TEXT,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Un pedido solo puede tener un pago aprobado
CREATE UNIQUE INDEX pagos_un_aprobado_por_pedido ON pagos(pedido_id) WHERE resultado = 'APROBADO';

-- Trazabilidad del descuento de inventario (F-01)
CREATE TABLE movimientos_inventario (
  id              SERIAL PRIMARY KEY,
  ingrediente_id  INTEGER NOT NULL REFERENCES ingredientes(id),
  pedido_id       INTEGER REFERENCES pedidos(id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('CONSUMO','REPOSICION')),
  cantidad        NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Módulo Entregas (F-03)
CREATE TABLE entregas (
  id                  SERIAL PRIMARY KEY,
  pedido_id           INTEGER NOT NULL UNIQUE REFERENCES pedidos(id),
  repartidor          TEXT NOT NULL,
  estado              TEXT NOT NULL DEFAULT 'ASIGNADA'
                      CHECK (estado IN ('ASIGNADA','EN_CAMINO','ENTREGADO','DEVUELTO')),
  motivo_devolucion   TEXT,
  tomada_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
  en_camino_en        TIMESTAMPTZ,
  finalizada_en       TIMESTAMPTZ
);

-- Notificaciones a salón y cocina (CU-01, CU-02)
CREATE TABLE notificaciones (
  id         SERIAL PRIMARY KEY,
  destino    TEXT NOT NULL CHECK (destino IN ('SALON','COCINA')),
  pedido_id  INTEGER REFERENCES pedidos(id),
  mensaje    TEXT NOT NULL,
  creada_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
