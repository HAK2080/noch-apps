-- Seed modifier groups and per-product attachments so the drink ticket
-- actually carries the customizations staff care about.
--
-- Design choices for fast staff workflow at the till:
--   - Sugar and Milk default to "Normal" (pre-selected in the modal),
--     so for ~80% of orders staff just taps "Add to cart" once.
--   - Extras is multi-select (Extra Shot AND Extra Syrup possible together).
--   - Temperature is only attached where it adds value — Hot/Iced Coffee
--     and Hot/Iced Tea categories already imply temperature, no need to
--     ask twice. Matcha and Nochi's Favorites are the genuinely variable
--     ones.
--   - Nothing is is_required=true. Staff can blow through the modal in
--     one tap; required fields would slow them down at peak.
--
-- Branch_id on groups is metadata only — the front-end resolves modifiers
-- through pos_product_modifier_groups, which has no branch filter. So
-- groups attached to one product show at every branch that product is
-- visible in.

DO $$
DECLARE
  v_branch_id uuid := '8936e821-ad7f-4d69-b654-c2f76404f89f'; -- Noch Hay Alandlous
  v_g_sugar uuid;
  v_g_milk  uuid;
  v_g_extra uuid;
  v_g_temp  uuid;
BEGIN
  -- ─── Groups ────────────────────────────────────────────────────────
  INSERT INTO pos_modifier_groups (branch_id, name, name_ar, min_select, max_select, is_required, sort_order)
  VALUES (v_branch_id, 'Sugar level', 'مستوى السكر', 0, 1, false, 1)
  RETURNING id INTO v_g_sugar;

  INSERT INTO pos_modifier_groups (branch_id, name, name_ar, min_select, max_select, is_required, sort_order)
  VALUES (v_branch_id, 'Milk type', 'نوع الحليب', 0, 1, false, 2)
  RETURNING id INTO v_g_milk;

  INSERT INTO pos_modifier_groups (branch_id, name, name_ar, min_select, max_select, is_required, sort_order)
  VALUES (v_branch_id, 'Extras', 'إضافات', 0, 5, false, 3)
  RETURNING id INTO v_g_extra;

  INSERT INTO pos_modifier_groups (branch_id, name, name_ar, min_select, max_select, is_required, sort_order)
  VALUES (v_branch_id, 'Temperature', 'الحرارة', 0, 1, false, 4)
  RETURNING id INTO v_g_temp;

  -- ─── Sugar level (Normal first, default) ───────────────────────────
  INSERT INTO pos_modifiers (group_id, name, name_ar, price_delta, sort_order, is_default) VALUES
    (v_g_sugar, 'Normal',      'عادي',       0, 1, true),
    (v_g_sugar, 'Extra sweet', 'سكر زيادة', 0, 2, false),
    (v_g_sugar, 'No sugar',    'بدون سكر',  0, 3, false),
    (v_g_sugar, 'Less sugar',  'سكر قليل',  0, 4, false);

  -- ─── Milk type (Normal first, default) ─────────────────────────────
  INSERT INTO pos_modifiers (group_id, name, name_ar, price_delta, sort_order, is_default) VALUES
    (v_g_milk, 'Normal',  'عادي',  0, 1, true),
    (v_g_milk, 'Coconut', 'جوز الهند', 0, 2, false),
    (v_g_milk, 'Oat',     'شوفان', 0, 3, false),
    (v_g_milk, 'Almond',  'لوز',   0, 4, false),
    (v_g_milk, 'Skim',    'خالي الدسم', 0, 5, false);

  -- ─── Extras (multi-select, no default) ─────────────────────────────
  INSERT INTO pos_modifiers (group_id, name, name_ar, price_delta, sort_order, is_default) VALUES
    (v_g_extra, 'Extra shot',        'شوت إضافي',     3, 1, false),
    (v_g_extra, 'Extra syrup pump',  'سيرب إضافي',    2, 2, false);

  -- ─── Temperature (no default — staff picks; only on variable cats) ─
  INSERT INTO pos_modifiers (group_id, name, name_ar, price_delta, sort_order, is_default) VALUES
    (v_g_temp, 'Hot',   'ساخن',  0, 1, false),
    (v_g_temp, 'Iced',  'مثلج',  0, 2, false);

  -- ─── Attach Sugar level to all drink categories ────────────────────
  -- Covers: Hot Coffee, Iced Coffee, Matcha, Tea, Iced Tea, Nochi's Favorites
  INSERT INTO pos_product_modifier_groups (product_id, group_id)
  SELECT p.id, v_g_sugar
    FROM pos_products p
    JOIN pos_categories c ON c.id = p.category_id
   WHERE p.is_active = true
     AND c.name IN ('Hot Coffee', 'Iced Coffee', 'Matcha', 'Tea', 'Iced Tea', 'Nochi''s Favorites')
  ON CONFLICT DO NOTHING;

  -- ─── Attach Milk type to coffee, matcha, favorites (anything that uses milk)
  INSERT INTO pos_product_modifier_groups (product_id, group_id)
  SELECT p.id, v_g_milk
    FROM pos_products p
    JOIN pos_categories c ON c.id = p.category_id
   WHERE p.is_active = true
     AND c.name IN ('Hot Coffee', 'Iced Coffee', 'Matcha', 'Nochi''s Favorites')
  ON CONFLICT DO NOTHING;

  -- ─── Attach Extras (extra shot, syrup) — espresso-based drinks
  INSERT INTO pos_product_modifier_groups (product_id, group_id)
  SELECT p.id, v_g_extra
    FROM pos_products p
    JOIN pos_categories c ON c.id = p.category_id
   WHERE p.is_active = true
     AND c.name IN ('Hot Coffee', 'Iced Coffee', 'Matcha', 'Nochi''s Favorites')
  ON CONFLICT DO NOTHING;

  -- ─── Attach Temperature only to ambiguous drinks ───────────────────
  -- Hot Coffee / Iced Coffee / Tea / Iced Tea categories already convey
  -- temperature. Matcha and Nochi's Favorites are the variable ones.
  INSERT INTO pos_product_modifier_groups (product_id, group_id)
  SELECT p.id, v_g_temp
    FROM pos_products p
    JOIN pos_categories c ON c.id = p.category_id
   WHERE p.is_active = true
     AND c.name IN ('Matcha', 'Nochi''s Favorites')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Seeded modifier groups and product attachments.';
END $$;
