-- Automatic Vestaboard feed scheduler.
--
-- The edge function enforces:
--   - cafe operating hours
--   - minimum send interval
--   - sports/news feed fallback to jokes and profound quotes
--
-- Cron can therefore tick frequently without spamming the board.

do $$
declare
  job_exists int;
begin
  select count(*) into job_exists from cron.job where jobname = 'vestaboard-feed-every-10-min';
  if job_exists > 0 then
    perform cron.unschedule('vestaboard-feed-every-10-min');
  end if;
end $$;

select cron.schedule(
  'vestaboard-feed-every-10-min',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := 'https://kxqjasdvoohiexedtfqw.supabase.co/functions/v1/vestaboard-cron',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);
