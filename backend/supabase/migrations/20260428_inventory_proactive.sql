-- Proactive inventory — POS-derived consumption engine + auto-flag
--
-- Replaces the reactive workflow (PDF → WhatsApp → run out). Joins POS sales
-- × cost recipes × ingredients to estimate avg daily usage per ingredient
-- per branch, then flags items where projected days-to-out < lead time.
--
-- Stock is currently global (no branch_id on stock). v1 returns per-branch
-- consumption + combined, but compares against the global stock row. Adding
-- a stock_per_branch table is out of scope for this migration; flagged as
-- Phase 2 in the digest output.

-- 1) Lead-time + reorder columns on ingredients ───────────────────────────

alter table ingredients
  add column if not exists lead_time_days int default 7,
  add column if not exists reorder_qty numeric,
  add column if not exists daily_usage_manual numeric,
  add column if not exists archived boolean default false,
  add column if not exists discontinued boolean default false;

-- 2) View: per-ingredient daily usage from POS over last 30d ───────────────
-- Skips fixed_cost rows and rows without an ingredient_id (custom labels).
-- Joins:
--   pos_orders (last 30d, completed)
--     → pos_order_items (product_id, quantity)
--     → pos_products (cost_recipe_id)
--     → recipe_ingredients (ingredient_id, qty_used)
--     → ingredients

create or replace view v_pos_ingredient_consumption_30d as
with order_items_window as (
  select
    o.branch_id,
    oi.product_id,
    oi.quantity,
    o.created_at::date as order_date
  from pos_orders o
  join pos_order_items oi on oi.order_id = o.id
  where o.created_at >= (now() - interval '30 days')
    and coalesce(o.status, 'completed') in ('completed', 'paid', 'closed')
    and coalesce(o.voided_at, '1970-01-01'::timestamptz) = '1970-01-01'::timestamptz
),
ingredient_usage as (
  select
    oiw.branch_id,
    ri.ingredient_id,
    sum(oiw.quantity * coalesce(ri.qty_used, 0)) as total_consumed,
    count(distinct oiw.order_date) as active_days,
    min(oiw.order_date) as first_day,
    max(oiw.order_date) as last_day
  from order_items_window oiw
  join pos_products p on p.id = oiw.product_id
  join recipe_ingredients ri on ri.recipe_id = p.cost_recipe_id
  where p.cost_recipe_id is not null
    and ri.ingredient_id is not null
    and coalesce(ri.is_fixed_cost, false) = false
  group by oiw.branch_id, ri.ingredient_id
)
select
  iu.branch_id,
  iu.ingredient_id,
  iu.total_consumed,
  iu.active_days,
  iu.first_day,
  iu.last_day,
  -- Average over the window (30d) so days with no sales count as zero.
  round((iu.total_consumed / 30.0)::numeric, 4) as avg_daily_usage_30d
from ingredient_usage iu;

comment on view v_pos_ingredient_consumption_30d is
  'POS-derived daily ingredient consumption per branch over last 30 days. '
  'Joins pos_order_items → pos_products.cost_recipe_id → recipe_ingredients. '
  'Skips fixed_cost rows. Used by flag_low_stock_proactive().';

-- 3) RPC: flag_low_stock_proactive ─────────────────────────────────────────
-- Returns flagged ingredients sorted by urgency. Combines POS-derived usage
-- (summed across all branches) with manual override (ingredients.daily_usage_manual)
-- when set. Falls back to the legacy stock_logs-based ingredient_consumption
-- view when neither is available.

create or replace function flag_low_stock_proactive()
returns table (
  ingredient_id uuid,
  name text,
  name_ar text,
  tier text,
  qty_available numeric,
  unit text,
  min_threshold numeric,
  daily_usage numeric,
  usage_source text,         -- 'pos' | 'manual' | 'stock_logs' | 'unknown'
  days_to_out numeric,
  lead_time_days int,
  reorder_qty numeric,
  status text                -- 'critical' | 'reorder_now' | 'reorder_soon' | 'ok'
)
security definer
set search_path = public
language sql as $$
  with pos_combined as (
    -- Sum across branches for combined-business view
    select ingredient_id, sum(avg_daily_usage_30d) as daily
    from v_pos_ingredient_consumption_30d
    group by ingredient_id
  ),
  resolved_usage as (
    select
      i.id as ingredient_id,
      coalesce(
        nullif(i.daily_usage_manual, 0),
        nullif(pc.daily, 0),
        nullif(ic.avg_daily_usage_30d, 0),
        0
      ) as daily,
      case
        when i.daily_usage_manual is not null and i.daily_usage_manual > 0 then 'manual'
        when pc.daily is not null and pc.daily > 0 then 'pos'
        when ic.avg_daily_usage_30d is not null and ic.avg_daily_usage_30d > 0 then 'stock_logs'
        else 'unknown'
      end as source
    from ingredients i
    left join pos_combined pc on pc.ingredient_id = i.id
    left join ingredient_consumption ic on ic.ingredient_id = i.id
  )
  select
    i.id,
    i.name,
    i.name_ar,
    i.tier,
    s.qty_available,
    s.unit,
    s.min_threshold,
    ru.daily,
    ru.source,
    case when ru.daily > 0 then round((s.qty_available / ru.daily)::numeric, 1) else null end as days_to_out,
    coalesce(i.lead_time_days, 7),
    i.reorder_qty,
    case
      when s.qty_available <= 0 then 'critical'
      when ru.daily > 0 and s.qty_available / ru.daily <= coalesce(i.lead_time_days, 7) then 'reorder_now'
      when s.qty_available <= coalesce(s.min_threshold, 0) then 'reorder_now'
      when ru.daily > 0 and s.qty_available / ru.daily <= (coalesce(i.lead_time_days, 7) * 1.5) then 'reorder_soon'
      else 'ok'
    end as status
  from ingredients i
  join stock s on s.ingredient_id = i.id
  left join resolved_usage ru on ru.ingredient_id = i.id
  where coalesce(i.archived, false) = false
    and coalesce(i.discontinued, false) = false
  order by
    case
      when s.qty_available <= 0 then 0
      when ru.daily > 0 and s.qty_available / ru.daily <= coalesce(i.lead_time_days, 7) then 1
      when s.qty_available <= coalesce(s.min_threshold, 0) then 2
      else 3
    end,
    case when ru.daily > 0 then s.qty_available / ru.daily else 9999 end asc;
$$;

grant execute on function flag_low_stock_proactive() to authenticated;

-- 4) RPC: inventory_review_digest ──────────────────────────────────────────
-- Compact text summary for Telegram + in-app banner. Twice-weekly digest
-- (Sun + Wed) caller invokes this; it returns a single string ready to
-- post.

create or replace function inventory_review_digest()
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_critical int;
  v_reorder_now int;
  v_reorder_soon int;
  v_summary text := '';
  v_lines text := '';
  v_row record;
begin
  select
    count(*) filter (where status = 'critical'),
    count(*) filter (where status = 'reorder_now'),
    count(*) filter (where status = 'reorder_soon')
  into v_critical, v_reorder_now, v_reorder_soon
  from flag_low_stock_proactive();

  v_summary := format(
    '📦 Inventory review %s — %s critical, %s reorder now, %s reorder soon',
    to_char(now(), 'Dy DD Mon'),
    v_critical, v_reorder_now, v_reorder_soon
  );

  for v_row in
    select * from flag_low_stock_proactive()
     where status in ('critical', 'reorder_now')
     order by days_to_out asc nulls first
     limit 20
  loop
    v_lines := v_lines || E'\n' || format(
      '%s %s — %s%s left%s',
      case v_row.status when 'critical' then '🔴' else '🟠' end,
      v_row.name,
      coalesce(v_row.qty_available::text, '?'),
      coalesce(' ' || v_row.unit, ''),
      case
        when v_row.days_to_out is not null
          then format(' · ~%s days to out', v_row.days_to_out)
        else ''
      end
    );
  end loop;

  return jsonb_build_object(
    'critical', v_critical,
    'reorder_now', v_reorder_now,
    'reorder_soon', v_reorder_soon,
    'text', v_summary || v_lines,
    'generated_at', now()
  );
end;
$$;

grant execute on function inventory_review_digest() to authenticated;

-- 5) Optional pg_cron schedule (run separately if pg_cron extension exists)
-- Sundays + Wednesdays at 09:00. Caller wires the digest result to Telegram
-- via the existing send-telegram edge function from a server-side hook.
--
-- create extension if not exists pg_cron;
-- select cron.schedule(
--   'inventory-review-sun', '0 9 * * 0',
--   $$select inventory_review_digest()$$
-- );
-- select cron.schedule(
--   'inventory-review-wed', '0 9 * * 3',
--   $$select inventory_review_digest()$$
-- );

-- 6) Phase 2 follow-ups (not in this migration):
--   - Add branch_id to stock or create stock_per_branch (so flagging is
--     per-branch instead of global stock × per-branch consumption mismatch).
--   - Edge function that calls inventory_review_digest() and fans out to
--     Telegram via the existing send-telegram fn.
