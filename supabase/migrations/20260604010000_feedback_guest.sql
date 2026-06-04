-- Customer feedback mini-site support (2026-06-04)
-- Lets anonymous customers submit feedback from the QR mini-site, writing into
-- the existing loyalty_feedback table (owner inbox + negative escalation reused).
--
-- Guests have no loyalty_customers row, so customer_id becomes nullable and we
-- attribute feedback by branch / order / table instead. Submitting goes through
-- a SECURITY DEFINER RPC (anon-callable), mirroring submit_guest_order.

-- 1. Make feedback guest-capable -------------------------------------------------
alter table loyalty_feedback alter column customer_id drop not null;

alter table loyalty_feedback
  add column if not exists branch_id    uuid references pos_branches(id) on delete set null,
  add column if not exists order_id     uuid references pos_orders(id)   on delete set null,
  add column if not exists table_number text,
  add column if not exists source       text default 'qr',
  add column if not exists emoji        text,
  add column if not exists reason_tags  text[] default '{}';

create index if not exists loyalty_feedback_branch_idx on loyalty_feedback(branch_id);

-- 2. Per-branch public-review destination links --------------------------------
alter table pos_branches
  add column if not exists review_facebook_url  text,
  add column if not exists review_google_url    text,
  add column if not exists review_instagram_url text;

-- 3. Anon-callable submit RPC --------------------------------------------------
create or replace function public.submit_feedback(
  p_branch_id    uuid,
  p_rating       int,
  p_comment      text  default null,
  p_table_number text  default null,
  p_order_id     uuid  default null,
  p_source       text  default 'qr',
  p_emoji        text  default null,
  p_reason_tags  text[] default '{}'
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
begin
  -- Validate rating.
  v_rating := p_rating;
  if v_rating is null or v_rating < 1 or v_rating > 5 then
    return jsonb_build_object('ok', false, 'error', 'invalid_rating');
  end if;

  -- Trim + cap comment to a sane length.
  v_comment := nullif(left(trim(coalesce(p_comment, '')), 1000), '');

  -- One feedback per order (dedupe) when an order is supplied.
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

  insert into loyalty_feedback (
    customer_id, rating, comment, sentiment, actioned,
    branch_id, order_id, table_number, source, emoji, reason_tags
  ) values (
    null, v_rating, v_comment, v_sentiment, false,
    p_branch_id, p_order_id, nullif(trim(coalesce(p_table_number,'')),''),
    coalesce(nullif(trim(p_source),''),'qr'), nullif(trim(coalesce(p_emoji,'')),''),
    coalesce(p_reason_tags, '{}')
  )
  returning id into v_id;

  -- Negative feedback → auto-create an owner task so it gets fixed before it
  -- becomes a public post. tasks has no branch_id column; embed context in body.
  if v_sentiment = 'negative' then
    select name into v_branch from pos_branches where id = p_branch_id;
    insert into tasks (title, description, status, priority)
    values (
      '⚠️ Negative feedback (' || v_rating || '★)',
      concat_ws(E'\n',
        'A customer left ' || v_rating || '★ feedback.',
        case when v_branch is not null then 'Branch: ' || v_branch end,
        case when nullif(trim(coalesce(p_table_number,'')),'') is not null then 'Table: ' || p_table_number end,
        case when array_length(coalesce(p_reason_tags,'{}'),1) is not null
             then 'Areas: ' || array_to_string(p_reason_tags, ', ') end,
        case when v_comment is not null then 'Comment: "' || v_comment || '"' end
      ),
      'pending', 'high'
    )
    returning id into v_task_id;

    update loyalty_feedback set task_id = v_task_id where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'sentiment', v_sentiment);
end;
$$;

grant execute on function public.submit_feedback(uuid, int, text, text, uuid, text, text, text[])
  to anon, authenticated, service_role;
