-- Founders Club: the first 100 customers to reach Legend tier are stamped
-- as founders, permanently. Once 100 seats are filled, no new founders
-- can be created — scarcity is the value.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Columns
-- ──────────────────────────────────────────────────────────────────────────
alter table public.loyalty_customers
  add column if not exists is_founder         boolean not null default false,
  add column if not exists founder_seat       int,
  add column if not exists legend_promoted_at timestamptz;

create unique index if not exists loyalty_customers_founder_seat_idx
  on public.loyalty_customers (founder_seat) where founder_seat is not null;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Trigger: when a customer's tier becomes 'legend', stamp the promotion
--    timestamp and (if any of the first 100 seats remain) award founder
--    status with the next available seat number.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.fn_loyalty_check_founder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filled int;
  v_seat int;
begin
  -- Only act when tier flips to 'legend' (not already legend).
  if NEW.tier <> 'legend' then return NEW; end if;
  if OLD.tier = 'legend' then return NEW; end if;

  -- Stamp promotion time
  if NEW.legend_promoted_at is null then
    NEW.legend_promoted_at := now();
  end if;

  -- If already a founder (manual override?), skip
  if NEW.is_founder = true then return NEW; end if;

  -- Count current founders
  select count(*) into v_filled
    from public.loyalty_customers
    where is_founder = true;

  if v_filled >= 100 then
    return NEW;  -- club is full forever
  end if;

  v_seat := v_filled + 1;
  NEW.is_founder := true;
  NEW.founder_seat := v_seat;

  -- Earn the Founder badge
  insert into public.loyalty_customer_badges (customer_id, badge_key, earned_at)
  values (NEW.id, 'founder', now())
  on conflict (customer_id, badge_key) do nothing;

  return NEW;
end;
$$;

drop trigger if exists trg_loyalty_check_founder on public.loyalty_customers;
create trigger trg_loyalty_check_founder
  before update of tier on public.loyalty_customers
  for each row execute function public.fn_loyalty_check_founder();

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Public counter view (no PII) — anyone can see "X of 100 founder seats
--    filled" but not who.
-- ──────────────────────────────────────────────────────────────────────────
create or replace view public.founders_club_status as
  select
    coalesce(count(*) filter (where is_founder = true), 0)::int as filled,
    100 as total,
    100 - coalesce(count(*) filter (where is_founder = true), 0)::int as seats_left
  from public.loyalty_customers;

grant select on public.founders_club_status to anon, authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Backfill: stamp existing legend-tier customers in the order they
--    reached legend, awarding founder seats up to 100.
-- ──────────────────────────────────────────────────────────────────────────
with ranked as (
  select id, row_number() over (order by created_at) as rn
    from public.loyalty_customers
    where tier = 'legend' and is_founder = false
)
update public.loyalty_customers c
   set is_founder = true,
       founder_seat = ranked.rn,
       legend_promoted_at = coalesce(legend_promoted_at, now())
  from ranked
  where c.id = ranked.id and ranked.rn <= 100;

-- Earn founder badges for any backfilled
insert into public.loyalty_customer_badges (customer_id, badge_key, earned_at)
  select id, 'founder', coalesce(legend_promoted_at, now())
  from public.loyalty_customers
  where is_founder = true
on conflict (customer_id, badge_key) do nothing;
