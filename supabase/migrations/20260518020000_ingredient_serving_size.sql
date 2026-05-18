ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS default_qty_per_serve numeric,
  ADD COLUMN IF NOT EXISTS serve_unit text;

UPDATE ingredients SET default_qty_per_serve = 20, serve_unit = 'g'
WHERE name ILIKE '%coffee%' OR name ILIKE '%bean%' OR name ILIKE '%espresso%';

UPDATE ingredients SET default_qty_per_serve = 5, serve_unit = 'g'
WHERE name ILIKE '%matcha%';
