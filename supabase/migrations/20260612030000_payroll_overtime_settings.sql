-- Optional overtime & extra-day pay (ALL OFF BY DEFAULT).
--
-- Settings live on the finance_settings singleton (id = 'default'); per-staff
-- options on profiles. shift_labor_cost is recreated with the multiplier math
-- APPENDED as new columns — the 9 existing columns keep their exact name,
-- type and order (CREATE OR REPLACE VIEW requirement).
--
-- INVARIANT: with the default flags (everything false), labor_cost_lyd is
-- exactly hours × rate — identical to the previous view. finance_pnl (latest:
-- 20260523010000) just sums labor_cost_lyd and needs no change.
--
-- Day-of-week convention: ISO (extract(isodow)) 1=Mon … 5=Fri 6=Sat 7=Sun,
-- evaluated in Africa/Tripoli local time (UTC+2; server stores UTC).
-- Libya weekend default: {5,6} (Friday, Saturday).

-- ── 1. Settings columns (defaults = feature OFF) ─────────────────────────────
alter table finance_settings
  add column if not exists overtime_enabled               boolean       default false,
  add column if not exists overtime_daily_threshold_hours numeric(4,1)  default 8,
  add column if not exists overtime_multiplier            numeric(4,2)  default 1.5,
  add column if not exists extra_day_enabled              boolean       default false,
  add column if not exists extra_day_multiplier           numeric(4,2)  default 2.0,
  add column if not exists weekend_days                   smallint[]    default '{5,6}';

-- ── 2. Per-staff payroll options ─────────────────────────────────────────────
alter table profiles
  add column if not exists days_off        smallint[],              -- scheduled days off (ISO dow); null = none
  add column if not exists overtime_exempt boolean default false;   -- true = OT multiplier never applies

-- ── 3. Recreate shift_labor_cost ─────────────────────────────────────────────
-- Existing column order preserved: attendee_id, shift_id, user_id, branch_id,
-- clocked_in_at, clocked_out_at, hourly_rate_lyd, hours, labor_cost_lyd.
-- New columns appended after.
create or replace view shift_labor_cost as
select
  a.id                                                        as attendee_id,
  a.shift_id,
  a.user_id,
  a.branch_id,
  a.clocked_in_at,
  a.clocked_out_at,
  coalesce(a.hourly_rate_override_lyd, p.hourly_rate_lyd, 0)  as hourly_rate_lyd,
  calc.hours                                                  as hours,
  -- Total pay including multipliers. With default settings this reduces to
  -- hours × rate exactly (reg=hours, ot=0, ot_mult=1, day_mult=1).
  ((calc.reg_hours + calc.ot_hours * calc.ot_mult)
     * coalesce(a.hourly_rate_override_lyd, p.hourly_rate_lyd, 0)
     * calc.day_mult)                                         as labor_cost_lyd,
  -- ── appended columns ──
  calc.reg_hours                                              as regular_hours,
  calc.ot_hours                                               as overtime_hours,
  (calc.day_mult <> 1)                                        as is_extra_day,
  calc.ot_mult                                                as overtime_multiplier_applied,
  calc.day_mult                                               as extra_day_multiplier_applied
from pos_shift_attendees a
left join profiles p on p.id = a.user_id
-- left join lateral (not cross join): rows must survive a missing settings row
left join lateral (
  select * from finance_settings where id = 'default'
) s on true
cross join lateral (
  select
    h.hours,
    case when coalesce(s.overtime_enabled, false) and not coalesce(p.overtime_exempt, false)
         then least(h.hours, coalesce(s.overtime_daily_threshold_hours, 8))
         else h.hours
    end as reg_hours,
    case when coalesce(s.overtime_enabled, false) and not coalesce(p.overtime_exempt, false)
         then greatest(0, h.hours - coalesce(s.overtime_daily_threshold_hours, 8))
         else 0
    end as ot_hours,
    case when coalesce(s.overtime_enabled, false) and not coalesce(p.overtime_exempt, false)
         then coalesce(s.overtime_multiplier, 1.5)
         else 1
    end as ot_mult,
    case when coalesce(s.extra_day_enabled, false)
          and ( extract(isodow from (a.clocked_in_at at time zone 'Africa/Tripoli'))::smallint
                  = any (coalesce(s.weekend_days, '{}'::smallint[]))
             or extract(isodow from (a.clocked_in_at at time zone 'Africa/Tripoli'))::smallint
                  = any (coalesce(p.days_off, '{}'::smallint[])) )
         then coalesce(s.extra_day_multiplier, 2.0)
         else 1
    end as day_mult
  from (
    select greatest(0, extract(epoch from
      (coalesce(a.clocked_out_at, now()) - a.clocked_in_at)
    ) / 3600.0) as hours
  ) h
) calc;

grant select on shift_labor_cost to authenticated;
