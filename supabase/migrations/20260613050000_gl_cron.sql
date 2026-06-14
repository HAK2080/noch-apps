-- Schedule gl-nightly-sync hourly via pg_cron (pattern from ops cron).
-- The edge function no-ops while gl_settings.auto_post_enabled = false, so
-- this tick is inert until an owner turns auto-posting on. Idempotent.

do $$
declare job_exists int;
begin
  select count(*) into job_exists from cron.job where jobname = 'gl-nightly-sync-hourly';
  if job_exists > 0 then perform cron.unschedule('gl-nightly-sync-hourly'); end if;
end $$;

select cron.schedule(
  'gl-nightly-sync-hourly',
  '15 * * * *',   -- minute 15 of every hour
  $cron$
  select net.http_post(
    url := 'https://kxqjasdvoohiexedtfqw.supabase.co/functions/v1/gl-nightly-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);
