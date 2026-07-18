-- Notification outbox + template registry.
-- Goal: one auditable delivery path for customer messaging, with WhatsApp-first
-- delivery and no Telegram sends in customer/loyalty flows.

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  channel text not null check (channel in ('whatsapp', 'telegram', 'sms', 'email', 'manual')),
  audience text not null default 'customer' check (audience in ('customer', 'staff')),
  provider text not null default 'twilio',
  proactive boolean not null default true,
  enabled boolean not null default true,
  twilio_content_sid text,
  body_template_ar text,
  body_template_en text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scheduled_for timestamptz,
  requested_by uuid references public.profiles(id) on delete set null,
  source_module text,
  audience text not null default 'customer' check (audience in ('customer', 'staff')),
  channel text not null check (channel in ('whatsapp', 'telegram', 'sms', 'email', 'manual')),
  provider text not null default 'twilio',
  event_key text,
  template_key text references public.notification_templates(template_key) on delete set null,
  customer_id uuid references public.loyalty_customers(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  feedback_id uuid references public.loyalty_feedback(id) on delete set null,
  reward_id uuid references public.loyalty_rewards(id) on delete set null,
  recipient_name text,
  recipient_phone text,
  recipient_chat_id text,
  language text not null default 'ar' check (language in ('ar', 'en')),
  message_body text,
  template_variables jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (
    status in ('draft', 'scheduled', 'queued', 'processing', 'sent', 'failed', 'skipped', 'cancelled')
  ),
  requires_template boolean not null default false,
  allow_freeform_session boolean not null default false,
  provider_message_id text,
  provider_status text,
  attempts int not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  error_text text,
  dedupe_key text
);

create unique index if not exists notification_outbox_dedupe_key_idx
  on public.notification_outbox (dedupe_key)
  where dedupe_key is not null;

create index if not exists notification_outbox_status_idx
  on public.notification_outbox (status, scheduled_for, created_at desc);

create index if not exists notification_outbox_customer_idx
  on public.notification_outbox (customer_id, created_at desc);

create index if not exists notification_outbox_campaign_idx
  on public.notification_outbox (campaign_id, created_at desc);

alter table public.notification_templates enable row level security;
drop policy if exists "notification_templates_owner" on public.notification_templates;
create policy "notification_templates_owner" on public.notification_templates
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

alter table public.notification_outbox enable row level security;
drop policy if exists "notification_outbox_owner" on public.notification_outbox;
create policy "notification_outbox_owner" on public.notification_outbox
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner'));

create or replace function public.queue_notification(
  p_channel text,
  p_audience text default 'customer',
  p_event_key text default null,
  p_customer_id uuid default null,
  p_campaign_id uuid default null,
  p_feedback_id uuid default null,
  p_reward_id uuid default null,
  p_recipient_name text default null,
  p_recipient_phone text default null,
  p_recipient_chat_id text default null,
  p_language text default 'ar',
  p_message_body text default null,
  p_template_key text default null,
  p_template_variables jsonb default '{}'::jsonb,
  p_context jsonb default '{}'::jsonb,
  p_source_module text default null,
  p_requested_by uuid default null,
  p_status text default null,
  p_scheduled_for timestamptz default null,
  p_requires_template boolean default false,
  p_allow_freeform_session boolean default false,
  p_dedupe_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notification_outbox (
    channel, audience, event_key, customer_id, campaign_id, feedback_id, reward_id,
    recipient_name, recipient_phone, recipient_chat_id, language, message_body,
    template_key, template_variables, context, source_module, requested_by,
    status, scheduled_for, requires_template, allow_freeform_session, dedupe_key
  ) values (
    p_channel, p_audience, p_event_key, p_customer_id, p_campaign_id, p_feedback_id, p_reward_id,
    p_recipient_name, p_recipient_phone, p_recipient_chat_id, coalesce(p_language, 'ar'), p_message_body,
    p_template_key, coalesce(p_template_variables, '{}'::jsonb), coalesce(p_context, '{}'::jsonb),
    p_source_module, p_requested_by,
    case
      when p_status is not null then p_status
      when p_scheduled_for is not null and p_scheduled_for > now() then 'scheduled'
      else 'queued'
    end,
    p_scheduled_for,
    coalesce(p_requires_template, false),
    coalesce(p_allow_freeform_session, false),
    p_dedupe_key
  )
  on conflict (dedupe_key) where dedupe_key is not null
  do update set
    updated_at = now(),
    scheduled_for = excluded.scheduled_for,
    status = excluded.status,
    template_variables = excluded.template_variables,
    context = excluded.context,
    message_body = excluded.message_body
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.queue_notification(
  text, text, text, uuid, uuid, uuid, uuid, text, text, text, text, text, text, jsonb, jsonb, text, uuid, text, timestamptz, boolean, boolean, text
) to authenticated, service_role, anon;

create or replace function public.claim_notification_outbox(p_limit int default 25)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select n.id
    from public.notification_outbox n
    where n.status in ('queued', 'scheduled')
      and (n.scheduled_for is null or n.scheduled_for <= now())
    order by coalesce(n.scheduled_for, n.created_at), n.created_at
    limit greatest(coalesce(p_limit, 25), 1)
    for update skip locked
  ), updated as (
    update public.notification_outbox n
       set status = 'processing',
           attempts = n.attempts + 1,
           last_attempt_at = now(),
           updated_at = now()
     where n.id in (select id from candidate)
     returning n.*
  )
  select * from updated;
end;
$$;

grant execute on function public.claim_notification_outbox(int) to service_role;

insert into public.notification_templates (
  template_key, channel, audience, provider, proactive, enabled, twilio_content_sid,
  body_template_ar, body_template_en, notes
) values
  (
    'marketing_anniversary', 'whatsapp', 'customer', 'twilio', true, true,
    'HX0ed864bf6d201c75b435358efa9ebbd6',
    'نوتشي يحتفل معك اليوم. شكراً على سنة القهوة معنا.',
    'Nochi is celebrating with you today. Thanks for another year with us.',
    'Approved Twilio template.'
  ),
  (
    'marketing_streak_save', 'whatsapp', 'customer', 'twilio', true, true,
    'HXf13e53d06f67f28309bd4b1ad29f0eaf',
    'سلسلتك تحتاج زيارة اليوم.',
    'Your streak needs a visit today.',
    'Approved Twilio template.'
  ),
  (
    'marketing_back_in_stock', 'whatsapp', 'customer', 'twilio', true, true,
    'HX16c84ac97be895be6c153b3414e92976',
    'رجع الشي اللي تحبه.',
    'The thing you like is back.',
    'Approved Twilio template.'
  ),
  (
    'marketing_weather_iced', 'whatsapp', 'customer', 'twilio', true, true,
    'HX20bba1bda93bfd0291b1f2428bd8d6f2',
    'جو اليوم يطلب مشروب بارد.',
    'Today calls for something iced.',
    'Approved Twilio template.'
  ),
  (
    'loyalty_marketing_birthday', 'whatsapp', 'customer', 'twilio', true, true,
    'HX2d934c0762f0b623e080b1d382f7c5b1',
    'عيد ميلاد سعيد من نوتشي.',
    'Happy birthday from Nochi.',
    'Approved Twilio template.'
  ),
  (
    'loyalty_lapsed_checkin', 'whatsapp', 'customer', 'twilio', true, true,
    'HX1bcf158d960d649731d8026e86c70aa5',
    'وحشتنا. نوتشي ينتظرك.',
    'We miss you. Nochi is waiting for you.',
    'Approved Twilio template.'
  ),
  (
    'loyalty_reward_ready', 'whatsapp', 'customer', 'twilio', true, true,
    'HXd1df8cc058afd9e1812ad2881ee9de1e',
    'مكافأتك جاهزة.',
    'Your reward is ready.',
    'Approved Twilio template.'
  ),
  (
    'loyalty_phoenix_revival', 'whatsapp', 'customer', 'twilio', true, true,
    null,
    'نوتشي يريد فرصة جديدة.',
    'Nochi wants another chance.',
    'Needs an approved Twilio template SID before proactive delivery can succeed.'
  ),
  (
    'reward_earned', 'whatsapp', 'customer', 'twilio', true, true,
    'HXd1df8cc058afd9e1812ad2881ee9de1e',
    'مبروك. مشروبك المجاني جاهز.',
    'Congrats. Your free drink is ready.',
    'Reuses the reward-ready template.'
  ),
  (
    'nochi_sad', 'whatsapp', 'customer', 'twilio', true, true,
    'HX1bcf158d960d649731d8026e86c70aa5',
    'نوتشي زعلان ويشتاق لك.',
    'Nochi is sad and misses you.',
    'Reuses the lapsed check-in template.'
  ),
  (
    'nochi_tired', 'whatsapp', 'customer', 'twilio', true, true,
    'HX1bcf158d960d649731d8026e86c70aa5',
    'نوتشي تعبان من الغياب.',
    'Nochi is tired of waiting.',
    'Reuses the lapsed check-in template.'
  ),
  (
    'nochi_deathbed', 'whatsapp', 'customer', 'twilio', true, true,
    'HX1bcf158d960d649731d8026e86c70aa5',
    'نوتشي مريض ويحتاج زيارتك.',
    'Nochi is sick and needs your visit.',
    'Reuses the lapsed check-in template.'
  ),
  (
    'birthday', 'whatsapp', 'customer', 'twilio', true, true,
    'HX2d934c0762f0b623e080b1d382f7c5b1',
    'عيد ميلاد سعيد من نوتشي.',
    'Happy birthday from Nochi.',
    'Alias for manual birthday sends.'
  ),
  (
    'random_love', 'whatsapp', 'customer', 'twilio', true, true,
    null,
    'نوتشي يفكر فيك اليوم.',
    'Nochi is thinking of you today.',
    'Needs an approved Twilio template SID before proactive delivery can succeed.'
  ),
  (
    'feedback_thank_you', 'whatsapp', 'customer', 'twilio', true, true,
    null,
    'شكراً على رأيك. نوتشي قرأ رسالتك.',
    'Thanks for your feedback. Nochi read your note.',
    'Needs an approved Twilio template SID before proactive delivery can succeed.'
  ),
  (
    'feedback_followup', 'whatsapp', 'customer', 'twilio', true, true,
    null,
    'نوتشي يعتذر. سنراجع ملاحظتك ونتابع معك.',
    'Nochi is sorry. We will review your feedback and follow up.',
    'Needs an approved Twilio template SID before proactive delivery can succeed.'
  ),
  (
    'stamp_grant', 'whatsapp', 'customer', 'twilio', true, true,
    null,
    'شكراً على ${activity}. نوتشي منحك طابعاً.',
    'Thanks for your ${activity}. Nochi gave you a stamp.',
    'Can use a loyalty_settings override SID until a shared default is approved.'
  )
on conflict (template_key) do update set
  channel = excluded.channel,
  audience = excluded.audience,
  provider = excluded.provider,
  proactive = excluded.proactive,
  enabled = excluded.enabled,
  twilio_content_sid = coalesce(public.notification_templates.twilio_content_sid, excluded.twilio_content_sid),
  body_template_ar = excluded.body_template_ar,
  body_template_en = excluded.body_template_en,
  notes = excluded.notes,
  updated_at = now();

create or replace function public.submit_feedback(
  p_branch_id    uuid,
  p_rating       int,
  p_comment      text   default null,
  p_table_number text   default null,
  p_order_id     uuid   default null,
  p_source       text   default 'qr',
  p_emoji        text   default null,
  p_reason_tags  text[] default '{}',
  p_phone        text   default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rating    int;
  v_comment   text;
  v_sentiment text;
  v_id        uuid;
  v_task_id   uuid;
  v_branch    text;
  v_norm          text;
  v_cust_id       uuid;
  v_enabled       boolean;
  v_pts           int;
  v_goal          int;
  v_points_added  int := 0;
  v_total_points  int := null;
  v_reward_code   text := null;
  v_customer      loyalty_customers%rowtype;
  v_lang          text := 'ar';
begin
  v_rating := p_rating;
  if v_rating is null or v_rating < 1 or v_rating > 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid_rating');
  end if;

  v_comment := nullif(left(trim(coalesce(p_comment, '')), 1000), '');

  if p_order_id is not null then
    if exists (select 1 from loyalty_feedback where order_id = p_order_id) then
      return jsonb_build_object('ok', true, 'duplicate', true);
    end if;
  end if;

  v_sentiment := case
    when v_rating >= 4 then 'positive'
    when v_rating = 3  then 'neutral'
    else 'negative'
  end;

  v_norm := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  if v_norm is not null and length(v_norm) >= 7 then
    select id into v_cust_id
      from loyalty_customers
      where regexp_replace(coalesce(phone_normalised, phone, ''), '\D', '', 'g') = v_norm
      limit 1;
    if v_cust_id is null then
      insert into loyalty_customers (phone, phone_normalised, full_name, consent_source, marketing_opt_in)
        values (p_phone, v_norm, 'ضيف نوتشي', 'feedback', false)
        returning id into v_cust_id;
    end if;
  end if;

  insert into loyalty_feedback (
    customer_id, rating, comment, sentiment, actioned,
    branch_id, order_id, table_number, source, emoji, reason_tags
  ) values (
    v_cust_id, v_rating, v_comment, v_sentiment, false,
    p_branch_id, p_order_id, nullif(trim(coalesce(p_table_number,'')), ''),
    coalesce(nullif(trim(p_source),''), 'qr'), nullif(trim(coalesce(p_emoji,'')), ''),
    coalesce(p_reason_tags, '{}')
  )
  returning id into v_id;

  if v_sentiment = 'negative' then
    select name into v_branch from pos_branches where id = p_branch_id;
    insert into tasks (title, description, status, priority)
    values (
      '⚠️ Negative feedback (' || v_rating || '★)',
      concat_ws(E'\n',
        'A customer left ' || v_rating || '★ feedback.',
        case when v_branch is not null then 'Branch: ' || v_branch end,
        case when nullif(trim(coalesce(p_table_number,'')), '') is not null then 'Table: ' || p_table_number end,
        case when array_length(coalesce(p_reason_tags, '{}'), 1) is not null
             then 'Areas: ' || array_to_string(p_reason_tags, ', ') end,
        case when v_comment is not null then 'Comment: "' || v_comment || '"' end
      ),
      'pending', 'high'
    )
    returning id into v_task_id;
    update loyalty_feedback set task_id = v_task_id where id = v_id;
  end if;

  if v_cust_id is not null then
    select feedback_reward_enabled, points_for_feedback, free_drink_points_goal
      into v_enabled, v_pts, v_goal
      from loyalty_settings limit 1;

    if coalesce(v_enabled, true) then
      if not exists (
        select 1 from loyalty_feedback
        where customer_id = v_cust_id and id <> v_id and created_at::date = current_date
      ) then
        v_points_added := greatest(coalesce(v_pts, 10), 0);
        update loyalty_customers
          set points = coalesce(points, 0) + v_points_added, updated_at = now()
          where id = v_cust_id
          returning points into v_total_points;

        if v_total_points >= coalesce(v_goal, 50) and coalesce(v_goal, 50) > 0 then
          v_reward_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
          insert into loyalty_rewards (customer_id, reward_type, description, status, code, expires_at)
            values (v_cust_id, 'free_drink', 'Free drink — Nochi points', 'pending',
                    v_reward_code, now() + interval '30 days');
          update loyalty_customers set points = points - coalesce(v_goal, 50)
            where id = v_cust_id returning points into v_total_points;
        end if;
      else
        select points into v_total_points from loyalty_customers where id = v_cust_id;
      end if;
    else
      select points into v_total_points from loyalty_customers where id = v_cust_id;
    end if;

    select * into v_customer from loyalty_customers where id = v_cust_id;
    v_lang := case when coalesce(v_customer.preferred_language, 'ar') = 'en' then 'en' else 'ar' end;

    if coalesce(v_customer.whatsapp_opt_in, false)
       and coalesce(nullif(v_customer.phone, ''), nullif(v_customer.phone_normalised, '')) is not null then
      perform public.queue_notification(
        p_channel => 'whatsapp',
        p_audience => 'customer',
        p_event_key => 'feedback_thank_you',
        p_customer_id => v_cust_id,
        p_feedback_id => v_id,
        p_recipient_name => v_customer.full_name,
        p_recipient_phone => coalesce(v_customer.phone, v_customer.phone_normalised),
        p_language => v_lang,
        p_template_key => 'feedback_thank_you',
        p_template_variables => jsonb_build_object(
          'name', coalesce(v_customer.full_name, 'Nochi guest'),
          'rating', v_rating::text,
          'sentiment', v_sentiment
        ),
        p_context => jsonb_build_object('feedback_id', v_id, 'rating', v_rating),
        p_source_module => 'feedback',
        p_status => 'queued',
        p_requires_template => true,
        p_dedupe_key => 'feedback_thank_you:' || v_id::text
      );

      if v_sentiment = 'negative' then
        perform public.queue_notification(
          p_channel => 'whatsapp',
          p_audience => 'customer',
          p_event_key => 'feedback_followup',
          p_customer_id => v_cust_id,
          p_feedback_id => v_id,
          p_recipient_name => v_customer.full_name,
          p_recipient_phone => coalesce(v_customer.phone, v_customer.phone_normalised),
          p_language => v_lang,
          p_template_key => 'feedback_followup',
          p_template_variables => jsonb_build_object(
            'name', coalesce(v_customer.full_name, 'Nochi guest'),
            'rating', v_rating::text
          ),
          p_context => jsonb_build_object('feedback_id', v_id, 'rating', v_rating),
          p_source_module => 'feedback',
          p_status => 'queued',
          p_requires_template => true,
          p_dedupe_key => 'feedback_followup:' || v_id::text
        );
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'sentiment', v_sentiment,
    'points_awarded', v_points_added,
    'total_points', v_total_points,
    'reward_code', v_reward_code
  );
end;
$$;

grant execute on function public.submit_feedback(uuid, int, text, text, uuid, text, text, text[], text)
  to anon, authenticated, service_role;

do $$
declare job_exists int;
begin
  select count(*) into job_exists from cron.job where jobname = 'notification-outbox-every-5m';
  if job_exists > 0 then perform cron.unschedule('notification-outbox-every-5m'); end if;
end $$;

select cron.schedule(
  'notification-outbox-every-5m',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://kxqjasdvoohiexedtfqw.supabase.co/functions/v1/process-notification-outbox',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);

notify pgrst, 'reload schema';
