-- Optional Twilio Content API template SID for the stamp-grant WhatsApp.
-- When set, the notification sends via an approved template (proactive-safe);
-- otherwise it falls back to the free-form message (24h window only).

alter table loyalty_settings
  add column if not exists stamp_notify_template_sid text;
