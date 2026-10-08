-- Feature 03: private workspaces, memberships and brands.
-- Brand descendants added later must reference (workspace_id, brand_id) against
-- brands_workspace_id_key so a child can never point at a brand in another workspace.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  -- One private workspace per customer in the first release (team invitations are deferred).
  -- restrict: deleting an auth user must go through an explicit export/deletion flow.
  owner_user_id uuid not null unique references auth.users (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  profile jsonb not null default '{}'::jsonb
    check (jsonb_typeof(profile) = 'object' and pg_column_size(profile) <= 16384),
  targets jsonb not null default '{}'::jsonb
    check (jsonb_typeof(targets) = 'object' and pg_column_size(targets) <= 16384),
  revision integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brands_workspace_id_key unique (workspace_id, id)
);
create unique index brands_active_name_key
  on public.brands (workspace_id, lower(name)) where archived_at is null;
create index brands_workspace_created_idx on public.brands (workspace_id, created_at, id);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.brands enable row level security;

revoke all on public.workspaces, public.workspace_members, public.brands from anon, authenticated;
grant select on public.workspaces, public.workspace_members to authenticated;
-- No DELETE grant on brands: brands are archived, never deleted, without separate approval.
grant select on public.brands to authenticated;
grant insert (workspace_id, name, profile, targets) on public.brands to authenticated;
grant update (name, profile, targets, archived_at) on public.brands to authenticated;

-- Access requires an approved account AND an unrevoked membership, so suspension and revoked
-- membership cut off database access immediately.
create function public.is_active_workspace_member(p_workspace uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select public.is_approved_account() and exists (
    select 1
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace
      and m.user_id = auth.uid()
      and m.revoked_at is null
      and w.archived_at is null
  );
$$;

revoke all on function public.is_active_workspace_member(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_active_workspace_member(uuid) to authenticated, service_role;

create policy workspaces_select_member on public.workspaces
  for select to authenticated using (public.is_active_workspace_member(id));
create policy workspace_members_select_member on public.workspace_members
  for select to authenticated using (public.is_active_workspace_member(workspace_id));
create policy brands_select_member on public.brands
  for select to authenticated using (public.is_active_workspace_member(workspace_id));
create policy brands_insert_member on public.brands
  for insert to authenticated with check (public.is_active_workspace_member(workspace_id));
create policy brands_update_member on public.brands
  for update to authenticated
  using (public.is_active_workspace_member(workspace_id))
  with check (public.is_active_workspace_member(workspace_id));

-- A brand never changes workspace; every update bumps the revision used for conditional writes.
create function public.brands_before_update() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if new.id <> old.id or new.workspace_id <> old.workspace_id then
    raise exception 'brand_workspace_immutable' using errcode = '42501';
  end if;
  new.revision = old.revision + 1;
  new.updated_at = now();
  return new;
end;
$$;

create trigger brands_before_update before update on public.brands
  for each row execute function public.brands_before_update();

-- Idempotent initial workspace for the signed-in, approved customer. One function call is one
-- transaction: workspace and owner membership are created together or not at all.
create function public.create_initial_workspace(p_name text) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(p_name);
  v_id uuid;
begin
  if v_user is null or not public.is_approved_account() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('workspace:' || v_user::text, 0));
  select w.id into v_id from public.workspaces w where w.owner_user_id = v_user;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.workspaces (owner_user_id, name) values (v_user, v_name) returning id into v_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_id, v_user, 'owner');
  insert into public.audit_events (actor_id, action, target_user_id, details)
  values (v_user, 'workspace_created', v_user, jsonb_build_object('workspace_id', v_id));
  return v_id;
end;
$$;

revoke all on function public.create_initial_workspace(text), public.brands_before_update()
  from public, anon, authenticated, service_role;
grant execute on function public.create_initial_workspace(text) to authenticated;
