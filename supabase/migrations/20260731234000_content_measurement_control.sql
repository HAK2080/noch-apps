-- Content Studio publishing and measurement control.
-- Existing creative records and legacy performance values are preserved and
-- backfilled into one authoritative publication/snapshot spine.

create or replace function public.content_studio_is_owner_v2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where (profile.id = auth.uid() or profile.auth_user_id = auth.uid())
      and profile.role = 'owner'
  );
$$;

revoke all on function public.content_studio_is_owner_v2()
  from public, anon;
grant execute on function public.content_studio_is_owner_v2()
  to authenticated;

alter table public.cs_campaigns
  add column if not exists objective_type text,
  add column if not exists primary_metric text,
  add column if not exists target_value numeric,
  add column if not exists attribution_window_days integer,
  add column if not exists experiment_reference text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cs_campaigns_objective_type_check'
      and conrelid = 'public.cs_campaigns'::regclass
  ) then
    alter table public.cs_campaigns
      add constraint cs_campaigns_objective_type_check
      check (
        objective_type is null
        or objective_type in (
          'awareness',
          'engagement',
          'traffic',
          'sales',
          'retention',
          'ugc'
        )
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'cs_campaigns_attribution_window_check'
      and conrelid = 'public.cs_campaigns'::regclass
  ) then
    alter table public.cs_campaigns
      add constraint cs_campaigns_attribution_window_check
      check (
        attribution_window_days is null
        or attribution_window_days between 1 and 90
      );
  end if;
end;
$$;

create table if not exists public.cs_publications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null
    references public.cs_businesses(id) on delete restrict,
  bank_item_id uuid not null
    references public.cs_content_bank_items(id) on delete restrict,
  campaign_id uuid references public.cs_campaigns(id) on delete set null,
  platform text not null,
  format text,
  objective_type text not null default 'engagement'
    check (
      objective_type in (
        'awareness',
        'engagement',
        'traffic',
        'sales',
        'retention',
        'ugc'
      )
    ),
  publishing_mode text not null default 'organic'
    check (publishing_mode in ('organic', 'paid')),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'published', 'cancelled', 'archived')),
  planned_at timestamptz,
  published_at timestamptz,
  external_post_id text,
  post_url text,
  product_ids uuid[] not null default '{}',
  branch_ids uuid[] not null default '{}',
  spend_lyd numeric(12, 3) check (spend_lyd is null or spend_lyd >= 0),
  attribution_window_days integer not null default 7
    check (attribution_window_days between 1 and 90),
  experiment_reference text,
  notes text,
  idempotency_key text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status <> 'published'
    or (
      published_at is not null
      and (nullif(trim(external_post_id), '') is not null or nullif(trim(post_url), '') is not null)
    )
  ),
  check (
    objective_type <> 'sales'
    or cardinality(product_ids) > 0
  )
);

create index if not exists cs_publications_business_status_idx
  on public.cs_publications(business_id, status, planned_at desc);
create index if not exists cs_publications_bank_item_idx
  on public.cs_publications(bank_item_id);

create table if not exists public.cs_performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null
    references public.cs_publications(id) on delete restrict,
  horizon text not null check (horizon in ('24h', '7d', 'final')),
  observed_at timestamptz not null,
  reach integer check (reach is null or reach >= 0),
  impressions integer check (impressions is null or impressions >= 0),
  views integer check (views is null or views >= 0),
  likes integer check (likes is null or likes >= 0),
  comments integer check (comments is null or comments >= 0),
  shares integer check (shares is null or shares >= 0),
  saves integer check (saves is null or saves >= 0),
  profile_visits integer check (profile_visits is null or profile_visits >= 0),
  link_clicks integer check (link_clicks is null or link_clicks >= 0),
  associated_orders integer check (associated_orders is null or associated_orders >= 0),
  associated_revenue_lyd numeric(12, 3)
    check (associated_revenue_lyd is null or associated_revenue_lyd >= 0),
  source text not null default 'manual'
    check (source in ('manual', 'platform_api', 'pos_analysis')),
  evidence_note text,
  captured_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (publication_id, horizon)
);

create index if not exists cs_performance_snapshot_observed_idx
  on public.cs_performance_snapshots(publication_id, observed_at desc);

-- Preserve historical Content Bank performance as explicit legacy evidence.
insert into public.cs_publications (
  business_id,
  bank_item_id,
  platform,
  format,
  objective_type,
  publishing_mode,
  status,
  planned_at,
  published_at,
  post_url,
  idempotency_key,
  created_at,
  updated_at,
  notes
)
select
  item.business_id,
  item.id,
  coalesce(nullif(item.perf_platform, ''), nullif(item.platform, ''), 'unknown'),
  coalesce(nullif(item.perf_format, ''), item.format),
  'engagement',
  'organic',
  'published',
  item.posted_at,
  item.posted_at,
  item.perf_post_url,
  'legacy-bank:' || item.id::text,
  coalesce(item.posted_at, item.approved_at, item.created_at),
  now(),
  'Backfilled from legacy Content Bank performance fields; causal attribution not claimed.'
from public.cs_content_bank_items item
where item.posted_at is not null
  and (nullif(trim(item.perf_post_url), '') is not null)
on conflict (idempotency_key) do nothing;

insert into public.cs_performance_snapshots (
  publication_id,
  horizon,
  observed_at,
  reach,
  impressions,
  views,
  likes,
  comments,
  shares,
  saves,
  profile_visits,
  link_clicks,
  associated_orders,
  source,
  evidence_note
)
select
  publication.id,
  'final',
  coalesce(item.perf_evaluated_at, publication.published_at, now()),
  item.perf_reach,
  item.perf_impressions,
  item.perf_views,
  item.perf_likes,
  item.perf_comments,
  item.perf_shares,
  item.perf_saves,
  item.perf_profile_visits,
  item.perf_link_clicks,
  item.perf_orders_after,
  'manual',
  concat_ws(
    ' ',
    'Legacy snapshot.',
    nullif(item.perf_notes, ''),
    'Associated orders are observational and not incremental lift.'
  )
from public.cs_publications publication
join public.cs_content_bank_items item
  on item.id = publication.bank_item_id
where publication.idempotency_key = 'legacy-bank:' || item.id::text
  and (
    item.perf_reach is not null
    or item.perf_impressions is not null
    or item.perf_views is not null
    or item.perf_likes is not null
    or item.perf_orders_after is not null
  )
on conflict (publication_id, horizon) do nothing;

create or replace function public.touch_content_measurement_v2()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cs_publications_touch_v2 on public.cs_publications;
create trigger cs_publications_touch_v2
before update on public.cs_publications
for each row execute function public.touch_content_measurement_v2();

create or replace function public.content_measurement_summary_v2(
  p_business_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  approved_total bigint;
  matured_approved bigint;
  matured_used bigint;
  published_total bigint;
  complete_evidence bigint;
begin
  if auth.uid() is null or not public.content_studio_is_owner_v2() then
    raise exception 'Owner sign-in required';
  end if;

  select
    count(*),
    count(*) filter (where approved_at <= now() - interval '30 days')
  into approved_total, matured_approved
  from public.cs_content_bank_items item
  where item.status = 'approved'
    and (p_business_id is null or item.business_id = p_business_id);

  select count(distinct item.id)
  into matured_used
  from public.cs_content_bank_items item
  join public.cs_publications publication
    on publication.bank_item_id = item.id
   and publication.status = 'published'
  where item.status = 'approved'
    and item.approved_at <= now() - interval '30 days'
    and (p_business_id is null or item.business_id = p_business_id);

  select
    count(*),
    count(*) filter (
      where publication.published_at is not null
        and (
          nullif(trim(publication.external_post_id), '') is not null
          or nullif(trim(publication.post_url), '') is not null
        )
        and (
          publication.objective_type <> 'sales'
          or cardinality(publication.product_ids) > 0
        )
        and exists (
          select 1 from public.cs_performance_snapshots snapshot
          where snapshot.publication_id = publication.id
            and snapshot.horizon = '24h'
        )
        and exists (
          select 1 from public.cs_performance_snapshots snapshot
          where snapshot.publication_id = publication.id
            and snapshot.horizon = '7d'
        )
    )
  into published_total, complete_evidence
  from public.cs_publications publication
  where publication.status = 'published'
    and (p_business_id is null or publication.business_id = p_business_id);

  return jsonb_build_object(
    'generated_at', now(),
    'source', 'cs_publications + cs_performance_snapshots',
    'business_id', p_business_id,
    'pipeline', jsonb_build_object(
      'inspirations', (
        select count(*) from public.cs_inspirations row
        where p_business_id is null or row.business_id = p_business_id
      ),
      'concepts', (
        select count(*)
        from public.cs_extracted_concepts concept
        join public.cs_inspirations inspiration
          on inspiration.id = concept.inspiration_id
        where p_business_id is null
          or inspiration.business_id = p_business_id
      ),
      'briefs', (
        select count(*) from public.cs_briefs row
        where p_business_id is null or row.business_id = p_business_id
      ),
      'drafts', (
        select count(*)
        from public.cs_draft_variants draft
        left join public.cs_briefs brief
          on brief.id = draft.brief_id
        left join public.cs_extracted_concepts concept
          on concept.id = draft.concept_id
        left join public.cs_inspirations inspiration
          on inspiration.id = concept.inspiration_id
        where p_business_id is null
          or brief.business_id = p_business_id
          or inspiration.business_id = p_business_id
      ),
      'approved_assets', approved_total,
      'scheduled', (
        select count(*) from public.cs_publications row
        where row.status = 'scheduled'
          and (p_business_id is null or row.business_id = p_business_id)
      ),
      'published', published_total
    ),
    'approved_use', jsonb_build_object(
      'matured_assets', matured_approved,
      'published_assets', matured_used,
      'rate_pct', round(100.0 * matured_used / nullif(matured_approved, 0), 1),
      'target_pct', 80
    ),
    'evidence', jsonb_build_object(
      'published', published_total,
      'complete', complete_evidence,
      'completeness_pct', round(
        100.0 * complete_evidence / nullif(published_total, 0),
        1
      ),
      'target_pct', 90,
      'missing', published_total - complete_evidence,
      'causal_claims_allowed', false,
      'note', 'Associated orders and revenue are observational unless an experiment reference and control are recorded.'
    ),
    'operations', jsonb_build_object(
      'overdue_scheduled', (
        select count(*) from public.cs_publications row
        where row.status = 'scheduled'
          and row.planned_at < now()
          and (p_business_id is null or row.business_id = p_business_id)
      ),
      'on_time_published', (
        select count(*) from public.cs_publications row
        where row.status = 'published'
          and row.planned_at is not null
          and row.published_at <= row.planned_at
          and (p_business_id is null or row.business_id = p_business_id)
      ),
      'scheduled_with_deadline', (
        select count(*) from public.cs_publications row
        where row.status = 'published'
          and row.planned_at is not null
          and (p_business_id is null or row.business_id = p_business_id)
      ),
      'on_time_rate_pct', (
        select round(
          100.0 * count(*) filter (where row.published_at <= row.planned_at)
          / nullif(count(*), 0),
          1
        )
        from public.cs_publications row
        where row.status = 'published'
          and row.planned_at is not null
          and (p_business_id is null or row.business_id = p_business_id)
      )
    ),
    'measurement', jsonb_build_object(
      'publications_with_snapshots', (
        select count(distinct snapshot.publication_id)
        from public.cs_performance_snapshots snapshot
        join public.cs_publications publication on publication.id = snapshot.publication_id
        where p_business_id is null or publication.business_id = p_business_id
      ),
      'stable_comparison_cells', (
        select count(*)
        from (
          select publication.platform, publication.format,
            publication.objective_type, publication.publishing_mode
          from public.cs_publications publication
          join public.cs_performance_snapshots snapshot
            on snapshot.publication_id = publication.id
           and snapshot.horizon = '7d'
          where p_business_id is null or publication.business_id = p_business_id
          group by publication.platform, publication.format,
            publication.objective_type, publication.publishing_mode
          having count(*) >= 30
        ) comparison_cell
      ),
      'latest_snapshot_at', (
        select max(snapshot.observed_at)
        from public.cs_performance_snapshots snapshot
        join public.cs_publications publication on publication.id = snapshot.publication_id
        where p_business_id is null or publication.business_id = p_business_id
      )
    ),
    'exceptions', coalesce((
      select jsonb_agg(to_jsonb(exception_row) order by exception_row.priority, exception_row.planned_at)
      from (
        select
          publication.id,
          publication.bank_item_id,
          publication.platform,
          publication.status,
          publication.planned_at,
          case
            when publication.status = 'scheduled' and publication.planned_at < now()
              then 'overdue_publish'
            when publication.status = 'published' and not exists (
              select 1 from public.cs_performance_snapshots snapshot
              where snapshot.publication_id = publication.id
            ) then 'missing_performance'
            else 'incomplete_evidence'
          end as exception_type,
          case
            when publication.status = 'scheduled' and publication.planned_at < now() then 1
            else 2
          end as priority
        from public.cs_publications publication
        where (p_business_id is null or publication.business_id = p_business_id)
          and (
            (publication.status = 'scheduled' and publication.planned_at < now())
            or (
              publication.status = 'published'
              and not exists (
                select 1 from public.cs_performance_snapshots snapshot
                where snapshot.publication_id = publication.id
              )
            )
          )
        limit 50
      ) exception_row
    ), '[]'::jsonb)
  );
end;
$$;

-- Content Studio is owner-only in the application; make the database agree.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'cs_businesses',
    'cs_inspirations',
    'cs_extracted_concepts',
    'cs_brand_voice_profiles',
    'cs_draft_variants',
    'cs_draft_evaluations',
    'cs_user_edits',
    'cs_content_bank_items',
    'cs_briefs',
    'cs_campaigns',
    'cs_learning_signals',
    'cs_dialect_training_items',
    'cs_publications',
    'cs_performance_snapshots'
  ]
  loop
    if to_regclass('public.' || table_name) is null then continue; end if;
    execute format('alter table public.%I enable row level security', table_name);
    for policy_name in
      select policy.policyname
      from pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.content_studio_is_owner_v2()) with check (public.content_studio_is_owner_v2())',
      table_name || '_owner_all_v2',
      table_name
    );
  end loop;
end;
$$;

grant select, insert, update, delete on public.cs_publications
  to authenticated;
grant select, insert, update, delete on public.cs_performance_snapshots
  to authenticated;
revoke all on function public.content_measurement_summary_v2(uuid)
  from public, anon;
grant execute on function public.content_measurement_summary_v2(uuid)
  to authenticated;

comment on table public.cs_publications is
  'Authoritative transition from approved asset to scheduled or published external content with campaign, product, cost, and evidence identity.';
comment on table public.cs_performance_snapshots is
  'Comparable 24-hour, 7-day, or final evidence. Associated commerce is observational unless a controlled experiment is recorded.';
comment on function public.content_measurement_summary_v2(uuid) is
  'Owner Content Studio health, throughput, evidence completeness, and exceptions from authoritative publication records.';

notify pgrst, 'reload schema';
