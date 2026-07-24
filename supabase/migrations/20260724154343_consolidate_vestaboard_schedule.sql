-- Keep one canonical Vestaboard scheduler after the June automation feed
-- and July channel scheduler were consolidated into the same Edge Function.
do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'vestaboard-feed-every-10-min'
  ) then
    perform cron.unschedule('vestaboard-feed-every-10-min');
  end if;
end $$;
