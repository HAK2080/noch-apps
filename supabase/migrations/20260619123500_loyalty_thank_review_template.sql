insert into public.notification_templates (
  template_key, channel, audience, provider, proactive, enabled, twilio_content_sid,
  body_template_ar, body_template_en, notes
) values (
  'random_love',
  'whatsapp',
  'customer',
  'twilio',
  true,
  true,
  'HX2aca2aa8615519ad8881eda0dc0791b8',
  'شكراً لزيارتك يا ${name}. رأيك يهم نوتشي. إذا عجبتك التجربة، شاركنا تقييمك على جوجل أو فيسبوك.',
  'Thanks for visiting, ${name}. Your review helps Nochi grow.',
  'Approved Twilio template for Thank customer / ask for review. Legacy key kept for compatibility.'
)
on conflict (template_key) do update set
  twilio_content_sid = excluded.twilio_content_sid,
  body_template_ar = excluded.body_template_ar,
  body_template_en = excluded.body_template_en,
  notes = excluded.notes,
  enabled = true,
  updated_at = now();
