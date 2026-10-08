-- Avoid duplicate and empty HTTP work without changing delivery frequency.
-- Preserve the existing dispatcher command, including its authentication.
do $migration$
declare
  dispatcher record;
begin
  if exists (select 1 from cron.job where jobname = 'vestaboard-channels-every-15m' and active) then
    perform cron.alter_job(jobid, active := false)
    from cron.job where jobname = 'vestaboard-feed-every-10-min';
  end if;

  select jobid, command into dispatcher from cron.job
  where jobname = 'notification-outbox-every-5m';
  if found and position('noch_due_outbox_guard' in dispatcher.command) = 0 then
    perform cron.alter_job(dispatcher.jobid, command := format(
      'do $noch_due_outbox_guard$ begin
        if exists (select 1 from public.notification_outbox
          where status in (''queued'', ''scheduled'')
          and (scheduled_for is null or scheduled_for <= now())) then
          execute %L;
        end if;
      end $noch_due_outbox_guard$;', dispatcher.command));
  end if;
end $migration$;
