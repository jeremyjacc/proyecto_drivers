-- Restosistem | Datos de ejemplo (sin datos personales reales)
-- Ejecutar despues de schema.sql: psql -U postgres -d restosistem -f db/seed.sql

INSERT INTO mesas (numero) VALUES (1), (2), (3), (4), (5);

INSERT INTO ingredientes (nombre, unidad, stock) VALUES
  ('Arroz',        'g',  5000),
  ('Pollo',        'g',  4000),
  ('Pescado',      'g',  3000),
  ('Camaron',      'g',  1500),
  ('Platano verde','un', 40),
  ('Queso',        'g',  1000),
  ('Cebolla',      'g',  2000),
  ('Maracuya',     'g',  1200),
  ('Azucar',       'g',  2000),
  ('Pan',          'un', 3);        -- stock bajo a proposito, para probar el 409

INSERT INTO platos (nombre, precio) VALUES
  ('Arroz con pollo',     5.50),
  ('Encebollado',         4.00),
  ('Ceviche de camaron',  6.50),
  ('Bolon de queso',      2.50),
  ('Jugo de maracuya',    1.50),
  ('Sanduche de pollo',   3.00);

-- Recetas (cantidad por porcion)
INSERT INTO recetas (plato_id, ingrediente_id, cantidad) VALUES
  -- Arroz con pollo
  (1, (SELECT id FROM ingredientes WHERE nombre = 'Arroz'),   200),
  (1, (SELECT id FROM ingredientes WHERE nombre = 'Pollo'),   180),
  (1, (SELECT id FROM ingredientes WHERE nombre = 'Cebolla'),  30),
  -- Encebollado
  (2, (SELECT id FROM ingredientes WHERE nombre = 'Pescado'), 250),
  (2, (SELECT id FROM ingredientes WHERE nombre = 'Cebolla'),  60),
  -- Ceviche de camaron
  (3, (SELECT id FROM ingredientes WHERE nombre = 'Camaron'), 200),
  (3, (SELECT id FROM ingredientes WHERE nombre = 'Cebolla'),  40),
  -- Bolon de queso
  (4, (SELECT id FROM ingredientes WHERE nombre = 'Platano verde'), 2),
  (4, (SELECT id FROM ingredientes WHERE nombre = 'Queso'),   80),
  -- Jugo de maracuya
  (5, (SELECT id FROM ingredientes WHERE nombre = 'Maracuya'), 150),
  (5, (SELECT id FROM ingredientes WHERE nombre = 'Azucar'),   20),
  -- Sanduche de pollo
  (6, (SELECT id FROM ingredientes WHERE nombre = 'Pan'),       2),
  (6, (SELECT id FROM ingredientes WHERE nombre = 'Pollo'),   100);
