CREATE OR REPLACE FUNCTION get_ingredient_consumption(
  p_ingredient_name text,
  p_start_date date DEFAULT (CURRENT_DATE - 30),
  p_end_date   date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  ingredient_name   text,
  total_consumed_g  numeric,
  total_serves      bigint,
  avg_daily_g       numeric,
  source            text,
  qty_per_serve_g   numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  -- Recipe-linked: use qty_used from recipe_ingredients
  SELECT
    i.name,
    SUM(oi.quantity * COALESCE(ri.qty_used, i.default_qty_per_serve)) AS total_consumed_g,
    SUM(oi.quantity)::bigint AS total_serves,
    ROUND(SUM(oi.quantity * COALESCE(ri.qty_used, i.default_qty_per_serve))
          / GREATEST((p_end_date - p_start_date), 1), 2) AS avg_daily_g,
    CASE WHEN ri.qty_used IS NOT NULL THEN 'recipe' ELSE 'manual_default' END AS source,
    COALESCE(ri.qty_used, i.default_qty_per_serve) AS qty_per_serve_g
  FROM pos_orders o
  JOIN pos_order_items oi ON oi.order_id = o.id
  JOIN pos_products pp ON pp.id = oi.product_id
  JOIN cost_recipes cr ON cr.id = pp.cost_recipe_id
  JOIN recipe_ingredients ri ON ri.recipe_id = cr.id
  JOIN ingredients i ON i.id = ri.ingredient_id
  WHERE i.name ILIKE '%' || p_ingredient_name || '%'
    AND o.created_at::date BETWEEN p_start_date AND p_end_date
    AND o.status = 'completed'
  GROUP BY i.name, ri.qty_used, i.default_qty_per_serve

  UNION ALL

  -- Fallback: products not linked to a cost_recipe, use manual default
  SELECT
    i.name,
    SUM(oi.quantity * i.default_qty_per_serve) AS total_consumed_g,
    SUM(oi.quantity)::bigint AS total_serves,
    ROUND(SUM(oi.quantity * i.default_qty_per_serve)
          / GREATEST((p_end_date - p_start_date), 1), 2) AS avg_daily_g,
    'manual_default' AS source,
    i.default_qty_per_serve AS qty_per_serve_g
  FROM pos_orders o
  JOIN pos_order_items oi ON oi.order_id = o.id
  JOIN pos_products pp ON pp.id = oi.product_id
  JOIN ingredients i ON i.name ILIKE '%' || p_ingredient_name || '%'
  WHERE pp.cost_recipe_id IS NULL
    AND i.default_qty_per_serve IS NOT NULL
    AND o.created_at::date BETWEEN p_start_date AND p_end_date
    AND o.status = 'completed'
  GROUP BY i.name, i.default_qty_per_serve
$$;

GRANT EXECUTE ON FUNCTION get_ingredient_consumption TO authenticated;
