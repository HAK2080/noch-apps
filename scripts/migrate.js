#!/usr/bin/env node
/**
 * Supabase migration runner
 * Usage: node scripts/migrate.js
 * Requires SUPABASE_ACCESS_TOKEN in .env
 */
import 'dotenv/config'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PROJECT_REF = 'kxqjasdvoohiexedtfqw'
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!ACCESS_TOKEN) {
  console.error('❌  SUPABASE_SERVICE_ROLE_KEY not set in .env')
  process.exit(1)
}

async function runSQL(sql, label) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  )
  const json = await res.json()
  if (!res.ok || json.error) {
    console.error(`❌  ${label}:`, json.error || json.message || JSON.stringify(json))
    return false
  }
  console.log(`✅  ${label}`)
  return true
}

async function main() {
  console.log('🚀  Running Noch migrations against project:', PROJECT_REF)
  console.log()

  // ── Fix 1: Expenses table — cost_center_id must be text, not uuid ─────────
  await runSQL(`
    DROP TABLE IF EXISTS expenses CASCADE;
    CREATE TABLE expenses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cost_center_id text REFERENCES cost_centers(id),
      category_id uuid REFERENCES expense_categories(id),
      amount numeric(10,2) NOT NULL CHECK (amount > 0),
      currency text DEFAULT 'LYD',
      description text NOT NULL,
      receipt_url text,
      status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
      submitted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      approval_note text,
      submitted_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "expenses_all" ON expenses;
    CREATE POLICY "expenses_all" ON expenses FOR ALL USING (true);
  `, 'Fix expenses table (text cost_center_id)')

  // ── Fix 2: Ensure cost_centers, expense_categories exist ─────────────────
  await runSQL(`
    CREATE TABLE IF NOT EXISTS cost_centers (
      id text PRIMARY KEY,
      name text NOT NULL,
      created_at timestamptz DEFAULT now()
    );
    INSERT INTO cost_centers (id, name) VALUES
      ('CC00', 'CEO'), ('CC01', 'Noch City Walk'),
      ('CC02', 'Noch Galaria Mall'), ('CC03', 'Bloom Abu Nawas'), ('CC99', 'MD')
    ON CONFLICT (id) DO NOTHING;
    ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "cc_all" ON cost_centers;
    CREATE POLICY "cc_all" ON cost_centers FOR ALL USING (true);
  `, 'Ensure cost_centers table')

  await runSQL(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      created_at timestamptz DEFAULT now()
    );
    INSERT INTO expense_categories (name) VALUES
      ('Food & Beverages'), ('Supplies & Equipment'), ('Utilities'),
      ('Marketing'), ('Maintenance & Repairs'), ('Transport'),
      ('Staff'), ('Rent'), ('Technology'), ('Training'), ('Miscellaneous')
    ON CONFLICT (name) DO NOTHING;
    ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "ec_all" ON expense_categories;
    CREATE POLICY "ec_all" ON expense_categories FOR ALL USING (true);
  `, 'Ensure expense_categories table')

  // ── Fix 3: inventory_alert_prefs ─────────────────────────────────────────
  await runSQL(`
    CREATE TABLE IF NOT EXISTS inventory_alert_prefs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
      in_app boolean DEFAULT true,
      telegram boolean DEFAULT false,
      updated_at timestamptz DEFAULT now()
    );
    ALTER TABLE inventory_alert_prefs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "iap_all" ON inventory_alert_prefs;
    CREATE POLICY "iap_all" ON inventory_alert_prefs FOR ALL USING (true);
  `, 'Ensure inventory_alert_prefs table')

  // ── Fix 4: Profile columns ───────────────────────────────────────────────
  await runSQL(`
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employment_type text DEFAULT 'full_time'
      CHECK (employment_type IN ('full_time', 'part_time', 'temporary'));
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS start_date date;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS branch_id uuid;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS app_role text DEFAULT 'staff';
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_salary_lyd numeric(10,2);
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hourly_rate_lyd numeric(10,2);
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin_code text
      CHECK (pin_code IS NULL OR (length(pin_code) BETWEEN 4 AND 6 AND pin_code ~ '^[0-9]+$'));
  `, 'Profile columns (employment, role, salary, PIN)')

  // ── Fix 5: ingredients track_type ────────────────────────────────────────
  await runSQL(`
    ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS track_type text DEFAULT 'consumable'
      CHECK (track_type IN ('consumable', 'equipment'));
  `, 'Ingredients track_type column')

  // ── Fix 6: Create cost_recipes (was missing from DB) ─────────────────────
  await runSQL(`
    CREATE TABLE IF NOT EXISTS cost_recipes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      description text,
      category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    ALTER TABLE cost_recipes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "cr_all" ON cost_recipes;
    CREATE POLICY "cr_all" ON cost_recipes FOR ALL USING (true);
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ri_recipe') THEN
        ALTER TABLE recipe_ingredients ADD CONSTRAINT fk_ri_recipe
          FOREIGN KEY (recipe_id) REFERENCES cost_recipes(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `, 'Create cost_recipes table')

  // ── Fix 7: POS → ingredients auto-deduction ──────────────────────────────
  await runSQL(`
    ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES cost_recipes(id) ON DELETE SET NULL;
    ALTER TABLE stock ADD COLUMN IF NOT EXISTS last_manual_count_at timestamptz;
    ALTER TABLE stock ADD COLUMN IF NOT EXISTS last_manual_count_qty numeric(10,3);
  `, 'POS recipe_id + stock manual count columns')

  await runSQL(`
    CREATE OR REPLACE FUNCTION deduct_ingredients_on_sale()
    RETURNS TRIGGER AS $$
    DECLARE
      v_recipe_id uuid;
      v_ri RECORD;
    BEGIN
      IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
      SELECT recipe_id INTO v_recipe_id FROM pos_products WHERE id = NEW.product_id;
      IF v_recipe_id IS NULL THEN RETURN NEW; END IF;
      FOR v_ri IN
        SELECT ingredient_id, qty_used
        FROM recipe_ingredients
        WHERE recipe_id = v_recipe_id AND (is_fixed_cost IS NULL OR is_fixed_cost = false)
      LOOP
        UPDATE stock
        SET qty_available = GREATEST(0, qty_available - (v_ri.qty_used * NEW.quantity)),
            updated_at = now()
        WHERE ingredient_id = v_ri.ingredient_id;
        IF FOUND THEN
          INSERT INTO stock_logs (ingredient_id, qty_change, type, notes)
          VALUES (v_ri.ingredient_id, -(v_ri.qty_used * NEW.quantity), 'pos_sale', 'POS: ' || NEW.product_name);
        END IF;
      END LOOP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    DROP TRIGGER IF EXISTS trg_deduct_ingredients ON pos_order_items;
    CREATE TRIGGER trg_deduct_ingredients
      AFTER INSERT ON pos_order_items
      FOR EACH ROW EXECUTE FUNCTION deduct_ingredients_on_sale();
  `, 'POS ingredient deduction trigger')

  // ── Fix 8: profiles.email + auth_user_id for staff login provisioning ──────
  await runSQL(`
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_user_id uuid;
    CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique ON profiles(email) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_user_id_unique ON profiles(auth_user_id) WHERE auth_user_id IS NOT NULL;
  `, 'profiles.email + auth_user_id for staff app login')

  // ── Fix 9: profiles RLS + auto-link function ─────────────────────────────
  await runSQL(`
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

    -- SELECT: id match OR auth_user_id match OR email match OR owner
    DROP POLICY IF EXISTS profiles_select ON profiles;
    CREATE POLICY profiles_select ON profiles
      FOR SELECT USING (
        id = auth.uid()
        OR auth_user_id = auth.uid()
        OR lower(email) = lower((auth.jwt()->>'email'))
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND p.role = 'owner'
        )
      );

    -- UPDATE: same conditions
    DROP POLICY IF EXISTS profiles_update ON profiles;
    CREATE POLICY profiles_update ON profiles
      FOR UPDATE USING (
        id = auth.uid()
        OR auth_user_id = auth.uid()
        OR lower(email) = lower((auth.jwt()->>'email'))
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND p.role = 'owner'
        )
      );

    -- SECURITY DEFINER function: link auth UUID to profile by email (bypasses RLS)
    -- Called after signup or first login when auth_user_id is missing
    CREATE OR REPLACE FUNCTION link_auth_to_profile(p_auth_user_id uuid, p_email text)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      UPDATE profiles
      SET auth_user_id = p_auth_user_id
      WHERE lower(email) = lower(p_email)
        AND auth_user_id IS NULL;
    END; $$;
  `, 'profiles RLS + link_auth_to_profile function')

  console.log()
  console.log('✅  All migrations complete.')
}

main().catch(err => { console.error(err); process.exit(1) })
