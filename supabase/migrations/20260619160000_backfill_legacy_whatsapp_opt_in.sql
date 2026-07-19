-- ============================================================
-- Backfill legacy WhatsApp opt-in rows.
--
-- Passport Phase 1 originally added whatsapp_opt_in with default false.
-- Later registration changed the expected store-counter default to true,
-- but existing customers were intentionally left untouched. That made old
-- customers look like delivery failures while new customers sent normally.
--
-- Keep this narrow: only rows with no recorded consent timestamp/source are
-- treated as legacy defaults. Explicit passport/self-service opt-outs keep
-- their false value.
-- ============================================================

update public.loyalty_customers
set whatsapp_opt_in = true,
    whatsapp_opt_in_at = coalesce(updated_at, now()),
    consent_source = coalesce(consent_source, 'legacy_default_backfill'),
    updated_at = now()
where whatsapp_opt_in is false
  and whatsapp_opt_in_at is null
  and consent_source is null
  and coalesce(nullif(phone, ''), nullif(phone_normalised, '')) is not null;

notify pgrst, 'reload schema';
