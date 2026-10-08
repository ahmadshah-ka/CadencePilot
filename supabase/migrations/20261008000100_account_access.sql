-- Feature 02: account access, platform owners, profiles, audit and notification intents.
-- Default deny: RLS is enabled on every table and privileges are granted explicitly.
-- Authority never comes from user-editable data (raw_user_meta_data is display-only).

create table public.account_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index account_access_status_created_idx on public.account_access (status, created_at, user_id);

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete restrict,
  role text not null check (role in ('owner')),
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text,
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_created_idx on public.audit_events (created_at desc, id desc);

-- Outbox rows consumed by feature 13. Nothing is sent by this feature.
create table public.notification_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

alter table public.account_access enable row level security;
alter table public.platform_admins enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_events enable row level security;
alter table public.notification_intents enable row level security;

revoke all on public.account_access, public.platform_admins, public.profiles,
  public.audit_events, public.notification_intents from anon, authenticated;

grant select on public.account_access to authenticated;
grant select on public.platform_admins to authenticated;
grant select on public.profiles to authenticated;
grant update (timezone, preferences) on public.profiles to authenticated;
grant select on public.audit_events to authenticated;

-- Identity helpers. SECURITY DEFINER with an empty search_path; they read only the caller's own id.
create function public.is_platform_owner() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid() and pa.role = 'owner'
  );
$$;

create function public.is_approved_account() returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.account_access aa where aa.user_id = auth.uid() and aa.status = 'approved'
  );
$$;

revoke all on function public.is_platform_owner(), public.is_approved_account()
  from public, anon, authenticated, service_role;
grant execute on function public.is_platform_owner(), public.is_approved_account()
  to authenticated, service_role;

create policy account_access_select_own on public.account_access
  for select to authenticated using (user_id = auth.uid());
create policy account_access_select_owner on public.account_access
  for select to authenticated using (public.is_platform_owner());

create policy platform_admins_select_own on public.platform_admins
  for select to authenticated using (user_id = auth.uid());

create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid());
create policy profiles_update_own_approved on public.profiles
  for update to authenticated
  using (user_id = auth.uid() and public.is_approved_account())
  with check (user_id = auth.uid() and public.is_approved_account());

create policy audit_events_select_owner on public.audit_events
  for select to authenticated using (public.is_platform_owner());

-- notification_intents: RLS on with no policies = no access except service_role.

create function public.set_updated_at() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Every new auth user starts pending. Display fields are copied for owner review only.
create function public.handle_new_auth_user() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.account_access (user_id, email, display_name)
  values (
    new.id,
    left(new.email, 320),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 120)
  )
  on conflict (user_id) do nothing;
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Fallback for users who existed before the trigger. Reads auth.users, never caller-supplied data.
create function public.ensure_account_access(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.account_access (user_id, email, display_name)
  select u.id, left(u.email, 320),
    left(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'), 120)
  from auth.users u where u.id = p_user
  on conflict (user_id) do nothing;
  insert into public.profiles (user_id)
  select u.id from auth.users u where u.id = p_user
  on conflict (user_id) do nothing;
end;
$$;

-- One-time owner provisioning by stable user id. Run manually as the database owner (SQL editor);
-- not callable by anon, authenticated or service_role. Refuses if an owner already exists.
create function public.bootstrap_platform_owner(p_user uuid) returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.platform_admins where role = 'owner') then
    raise exception 'owner_already_exists' using errcode = 'CP003';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null
  ) then
    raise exception 'user_not_found_or_unverified' using errcode = 'P0002';
  end if;
  perform public.ensure_account_access(p_user);
  insert into public.platform_admins (user_id, role) values (p_user, 'owner');
  update public.account_access
    set status = 'approved', reviewed_at = now(), revision = revision + 1, updated_at = now()
    where user_id = p_user;
  insert into public.audit_events (actor_id, action, target_user_id, details)
  values (null, 'owner_bootstrap', p_user, '{}'::jsonb);
end;
$$;

-- Owner review. Only the server (service_role) calls this after its own policy and MFA checks;
-- the function independently re-verifies that the actor is an owner. FOR UPDATE plus the
-- expected-revision check makes concurrent reviews succeed exactly once.
create function public.review_account_access(
  p_actor uuid,
  p_target uuid,
  p_decision text,
  p_expected_revision integer,
  p_note text default null
) returns table (user_id uuid, status text, revision integer)
  language plpgsql security definer set search_path = ''
as $$
declare
  v_current text;
  v_revision integer;
  v_new text;
begin
  if not exists (
    select 1 from public.platform_admins pa where pa.user_id = p_actor and pa.role = 'owner'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_actor = p_target then
    raise exception 'self_review_not_allowed' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject', 'suspend', 'reinstate') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  select aa.status, aa.revision into v_current, v_revision
    from public.account_access aa where aa.user_id = p_target for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_revision <> p_expected_revision then
    raise exception 'stale_revision' using errcode = 'CP001';
  end if;

  v_new := case
    when p_decision = 'approve' and v_current in ('pending', 'rejected') then 'approved'
    when p_decision = 'reject' and v_current = 'pending' then 'rejected'
    when p_decision = 'suspend' and v_current = 'approved' then 'suspended'
    when p_decision = 'reinstate' and v_current = 'suspended' then 'approved'
  end;
  if v_new is null then
    raise exception 'invalid_transition' using errcode = 'CP002';
  end if;

  update public.account_access aa
    set status = v_new, reviewed_by = p_actor, reviewed_at = now(),
        review_note = p_note, revision = aa.revision + 1, updated_at = now()
    where aa.user_id = p_target;

  insert into public.audit_events (actor_id, action, target_user_id, details)
  values (p_actor, 'account_' || p_decision, p_target,
    jsonb_build_object('from', v_current, 'to', v_new, 'revision', v_revision + 1));

  if v_new in ('approved', 'rejected') then
    insert into public.notification_intents (user_id, kind, payload, dedupe_key)
    values (p_target, 'account_' || v_new, jsonb_build_object('status', v_new),
      'account_review:' || p_target || ':' || (v_revision + 1))
    on conflict (dedupe_key) do nothing;
  end if;

  return query select p_target, v_new, v_revision + 1;
end;
$$;

revoke all on function public.handle_new_auth_user(), public.ensure_account_access(uuid),
  public.bootstrap_platform_owner(uuid), public.set_updated_at(),
  public.review_account_access(uuid, uuid, text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.ensure_account_access(uuid),
  public.review_account_access(uuid, uuid, text, integer, text) to service_role;
