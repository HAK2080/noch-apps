update public.notification_templates
set
  body_template_ar = 'شكراً لزيارتك يا ${name}. رأيك يهم نوتشي. قيّمنا على جوجل: ${google_url} أو شاركنا على فيسبوك: ${facebook_url}',
  body_template_en = 'Thanks for visiting, ${name}. Your review helps Nochi grow. Google: ${google_url} Facebook: ${facebook_url}',
  notes = 'Review request copy with Google and Facebook links. Requires a Twilio template with {{1}} name, {{2}} Google URL, {{3}} Facebook URL.',
  updated_at = now()
where template_key in ('loyalty_thank_review', 'random_love');

update public.notification_templates
set
  body_template_ar = 'نوتشي زعلان لأنه ما شافك من فترة. تعال زوره قريباً.',
  body_template_en = 'Nochi is sad he has not seen you in some time. Please come and visit him soon.',
  notes = 'Needs a dedicated approved Twilio SID. Do not reuse loyalty_lapsed_checkin if unique copy is required.',
  updated_at = now()
where template_key = 'nochi_sad';

update public.notification_templates
set
  body_template_ar = 'نوتشي حزين جداً. ما شافك من وقت طويل، ويريد يعطيك طابع مجاني. تعال قريباً.',
  body_template_en = 'Nochi is very sad. He has not seen you in a really long time. He wants to give you a free stamp, but please come.',
  notes = 'Needs a dedicated approved Twilio SID. Do not reuse loyalty_lapsed_checkin if unique copy is required.',
  updated_at = now()
where template_key = 'nochi_tired';

update public.notification_templates
set
  body_template_ar = 'نوتشي مريض جداً. أمنيته يشوفك تزوره. حاول تمر عليه قريباً.',
  body_template_en = 'Nochi is really sick. His last wish is to see you come. Please try to visit him.',
  notes = 'Needs a dedicated approved Twilio SID. Do not reuse loyalty_lapsed_checkin if unique copy is required.',
  updated_at = now()
where template_key = 'nochi_deathbed';

update public.notification_templates
set
  body_template_ar = 'عيد ميلاد سعيد يا ${name}. نوتشي مشتاق يحتفل معك.',
  body_template_en = 'Happy birthday, ${name}. Nochi wants to celebrate with you.',
  notes = 'Manual birthday copy. Delivery depends on the approved birthday Twilio SID.',
  updated_at = now()
where template_key in ('birthday', 'loyalty_marketing_birthday');
