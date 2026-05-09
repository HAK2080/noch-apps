-- ============================================================
-- BUSINESS EVENTS + SUGGESTED ACTIONS
-- Event bus + Command-Center actionable cards consumed by
-- Dashboard.jsx (Suggested Actions panel) and ActionCard.jsx.
-- Schema derived from the runtime expectations in
-- apps/pos/src/lib/businessEvents.js.
-- Re-runnable via IF NOT EXISTS guards.
-- ============================================================

create table if not exists business_events (
  id              uuid primary key default gen_random_uuid(),
  event_type      text not null,
  source_module   text not null,                          -- 'pos' | 'loyalty' | 'inventory' | 'content' | 'staff' | 'analytics' | 'tasks'
  source_id       uuid,                                    -- free-form: links back to the originating row in its own table
  branch_id       uuid references pos_branches(id) on delete set null,
  customer_id     uuid references loyalty_customers(id) on delete set null,
  product_id      uuid references pos_products(id) on delete set null,
  severity        text not null default 'info',           -- 'info' | 'warning' | 'urgent'
  summary         text not null,
  payload         jsonb not null default '{}'::jsonb,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists business_events_open_idx
  on business_events (created_at desc)
  where resolved_at is null;
create index if not exists business_events_event_type_source_idx
  on business_events (event_type, source_id);
create index if not exists business_events_source_module_idx
  on business_events (source_module);

create table if not exists suggested_actions (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid references business_events(id) on delete set null,
  action_type     text not null,                          -- 'create_task' | 'create_brief' | 'create_campaign' | 'message_customer' | etc.
  title           text not null,
  reason          text,
  target_module   text not null,                          -- routes the "Open" button: tasks/pos/loyalty/inventory/content/staff/analytics
  status          text not null default 'suggested',      -- 'suggested' | 'accepted' | 'dismissed' | 'completed'
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists suggested_actions_status_idx
  on suggested_actions (status, created_at desc);
create index if not exists suggested_actions_event_idx
  on suggested_actions (event_id);

-- RLS — authenticated users full access (mirrors loyalty / pos pattern;
-- producers run on the client behind owner login).
alter table business_events     enable row level security;
alter table suggested_actions   enable row level security;

drop policy if exists "business_events_all"   on business_events;
create policy "business_events_all"   on business_events
  for all to authenticated using (true) with check (true);

drop policy if exists "suggested_actions_all" on suggested_actions;
create policy "suggested_actions_all" on suggested_actions
  for all to authenticated using (true) with check (true);
