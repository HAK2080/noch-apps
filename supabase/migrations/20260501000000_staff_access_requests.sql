-- Staff access request flow: anonymous can submit; owner reviews and approves.

create table if not exists public.staff_access_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  phone text,
  note text,
  ip_address inet,
  user_agent text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  reject_reason text
);

-- One open (pending) request per email at a time. Rejected/approved rows kept for audit.
create unique index if not exists staff_access_requests_one_pending_per_email
  on public.staff_access_requests (lower(email)) where status = 'pending';

create index if not exists staff_access_requests_status_idx
  on public.staff_access_requests (status, created_at desc);

create index if not exists staff_access_requests_ip_recent_idx
  on public.staff_access_requests (ip_address, created_at desc);

alter table public.staff_access_requests enable row level security;

-- Anyone (including anon role) may submit a request.
drop policy if exists "anon can submit access request" on public.staff_access_requests;
create policy "anon can submit access request"
  on public.staff_access_requests
  for insert
  to anon, authenticated
  with check (true);

-- Only owners can read or update requests.
drop policy if exists "owners can read requests" on public.staff_access_requests;
create policy "owners can read requests"
  on public.staff_access_requests
  for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

drop policy if exists "owners can update requests" on public.staff_access_requests;
create policy "owners can update requests"
  on public.staff_access_requests
  for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner')
  );

-- Rate limit: max 3 requests per IP per hour.
-- Capture x-forwarded-for from PostgREST request headers if not provided.
create or replace function public.staff_access_requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hdr_ip text;
  hdr_ua text;
  recent_count int;
begin
  if new.ip_address is null then
    begin
      hdr_ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
      if hdr_ip is not null and hdr_ip <> '' then
        new.ip_address := hdr_ip::inet;
      end if;
    exception when others then
      -- header missing or malformed; leave null
      null;
    end;
  end if;

  if new.user_agent is null then
    begin
      hdr_ua := current_setting('request.headers', true)::json->>'user-agent';
      if hdr_ua is not null then
        new.user_agent := left(hdr_ua, 500);
      end if;
    exception when others then
      null;
    end;
  end if;

  if new.ip_address is not null then
    select count(*) into recent_count
      from public.staff_access_requests
     where ip_address = new.ip_address
       and created_at > now() - interval '1 hour';
    if recent_count >= 3 then
      raise exception 'rate_limited' using errcode = '23P01', hint = 'Too many requests from this address. Try again later.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists staff_access_requests_before_insert_trg on public.staff_access_requests;
create trigger staff_access_requests_before_insert_trg
  before insert on public.staff_access_requests
  for each row execute function public.staff_access_requests_before_insert();

grant insert on public.staff_access_requests to anon, authenticated;
grant select, update on public.staff_access_requests to authenticated;
