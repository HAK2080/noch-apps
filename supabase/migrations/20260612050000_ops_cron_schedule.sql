-- Schedule ops-generate-instances hourly via pg_cron (same pattern as
-- whatsapp-cron-daily). The edge function itself decides whether to act:
--   • ops_settings.module_enabled = false → no-op
--   • current local hour ≠ ops_settings.generate_at_hour → no-op
-- so an hourly tick keeps the generation hour configurable from the app
-- without ever touching this schedule. Idempotent: re-running replaces
-- the job.

do $$
declare
  job_exists int;
begin
  select count(*) into job_exists from cron.job where jobname = 'ops-generate-instances-hourly';
  if job_exists > 0 then
    perform cron.unschedule('ops-generate-instances-hourly');
  end if;
end $$;

select cron.schedule(
  'ops-generate-instances-hourly',
  '5 * * * *',  -- minute 5 of every hour
  $cron$
  select net.http_post(
    url := 'https://kxqjasdvoohiexedtfqw.supabase.co/functions/v1/ops-generate-instances',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);
