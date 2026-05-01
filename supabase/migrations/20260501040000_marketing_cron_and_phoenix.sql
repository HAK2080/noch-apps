-- Phase-0 marketing engine activation:
-- 1. Schedule whatsapp-cron daily so anniversary/birthday/lapsed/streak/weather actually fire.
-- 2. Add a 'phoenix' branch to the marketing engine (recipient RPC) so revived Nochis
--    get a celebration message — wired but only sends once Twilio template is approved.
-- 3. Add phoenix_revived_at column so we know "recently revived" customers.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. phoenix_revived_at column + update the trigger to stamp it
-- ──────────────────────────────────────────────────────────────────────────
alter table public.loyalty_customers
  add column if not exists phoenix_revived_at timestamptz;

create or replace function public.fn_phoenix_revival()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_dead boolean;
begin
  select (nochi_state = 'dead') into v_was_dead
    from public.loyalty_customers where id = NEW.customer_id;
  if not v_was_dead then return NEW; end if;

  update public.loyalty_customers
    set is_phoenix         = true,
        revival_count      = revival_count + 1,
        phoenix_revived_at = now(),
        nochi_state        = 'happy'
    where id = NEW.customer_id;

  insert into public.loyalty_customer_badges (customer_id, badge_key, earned_at)
  values (NEW.customer_id, 'phoenix', now())
  on conflict (customer_id, badge_key) do nothing;

  return NEW;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Phoenix recipient RPC (consumed by whatsapp-cron)
--    Customers revived in the last 24h who haven't received a phoenix msg
--    in the past 365 days. Dedupe via whatsapp_sends.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.whatsapp_phoenix_recipients()
returns table (
  customer_id uuid,
  phone text,
  full_name text,
  revival_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id           as customer_id,
    c.phone        as phone,
    c.full_name    as full_name,
    c.revival_count
  from public.loyalty_customers c
  where c.phone is not null
    and length(c.phone) >= 7
    and c.is_phoenix = true
    and c.phoenix_revived_at is not null
    and c.phoenix_revived_at > now() - interval '24 hours'
    and not public._wa_recently_sent(c.id, 'phoenix', interval '365 days');
$$;
grant execute on function public.whatsapp_phoenix_recipients() to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Schedule whatsapp-cron daily at 09:00 Tripoli (06:00 UTC).
--    Idempotent: replaces existing schedule with the same name.
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare
  job_exists int;
begin
  select count(*) into job_exists from cron.job where jobname = 'whatsapp-cron-daily';
  if job_exists > 0 then
    perform cron.unschedule('whatsapp-cron-daily');
  end if;
end $$;

select cron.schedule(
  'whatsapp-cron-daily',
  '0 6 * * *',  -- 06:00 UTC = 09:00 Africa/Tripoli
  $cron$
  select net.http_post(
    url := 'https://kxqjasdvoohiexedtfqw.supabase.co/functions/v1/whatsapp-cron',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);
