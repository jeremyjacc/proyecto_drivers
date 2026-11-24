-- Restosistem | Esquema PostgreSQL
-- Ejecutar: psql -U postgres -d restosistem -f db/schema.sql

DROP TABLE IF EXISTS pagos, pedido_items, pedidos, recetas, platos, ingredientes, mesas CASCADE;

CREATE TABLE mesas (
  id      SERIAL PRIMARY KEY,
  numero  INT NOT NULL UNIQUE,
  estado  VARCHAR(10) NOT NULL DEFAULT 'abierta'
          CHECK (estado IN ('abierta', 'cerrada'))
);

CREATE TABLE ingredientes (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(80) NOT NULL UNIQUE,
  unidad  VARCHAR(10) NOT NULL,                      -- g, ml, un
  stock   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (stock >= 0)
);

CREATE TABLE platos (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(80) NOT NULL UNIQUE,
  precio  NUMERIC(8,2) NOT NULL CHECK (precio > 0)
);

-- R-01: receta = ingredientes y cantidades exactas por porcion de plato
CREATE TABLE recetas (
  plato_id        INT NOT NULL REFERENCES platos(id) ON DELETE CASCADE,
  ingrediente_id  INT NOT NULL REFERENCES ingredientes(id),
  cantidad        NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
  PRIMARY KEY (plato_id, ingrediente_id)
);

CREATE TABLE pedidos (
  id         SERIAL PRIMARY KEY,
  mesa_id    INT REFERENCES mesas(id),               -- NULL si es domicilio
  tipo       VARCHAR(10) NOT NULL DEFAULT 'salon'
             CHECK (tipo IN ('salon', 'domicilio')),
  estado     VARCHAR(20) NOT NULL DEFAULT 'pendiente'
             CHECK (estado IN ('pendiente', 'en_preparacion', 'listo',
                               'entregado', 'pagado', 'cancelado')),
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pedido_items (
  id         SERIAL PRIMARY KEY,
  pedido_id  INT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  plato_id   INT NOT NULL REFERENCES platos(id),
  cantidad   INT NOT NULL CHECK (cantidad > 0),
  nota       VARCHAR(200)
);

CREATE TABLE pagos (
  id         SERIAL PRIMARY KEY,
  pedido_id  INT NOT NULL REFERENCES pedidos(id),
  metodo     VARCHAR(15) NOT NULL
             CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia')),
  monto      NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  estado     VARCHAR(10) NOT NULL DEFAULT 'aprobado'
             CHECK (estado IN ('aprobado', 'denegado')),
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pedidos_estado ON pedidos(estado);
CREATE INDEX idx_items_pedido   ON pedido_items(pedido_id);
