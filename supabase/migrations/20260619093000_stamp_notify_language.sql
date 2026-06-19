alter table public.loyalty_settings
  add column if not exists stamp_notify_language text not null default 'ar'
  check (stamp_notify_language in ('ar', 'en', 'customer'));
