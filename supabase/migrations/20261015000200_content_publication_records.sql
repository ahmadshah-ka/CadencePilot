-- Feature 06 only. Apply once AFTER existing feature-02/03/05 migrations.
-- Does not modify or recreate creator_preferences or any earlier object.
begin;
create table public.series (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  brand_id uuid not null,
  title text not null check(char_length(btrim(title)) between 1 and 500),
  request_id uuid not null,
  request_payload jsonb not null,
  revision integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workspace_id,brand_id,id), unique(workspace_id,request_id),
  foreign key(workspace_id,brand_id) references public.brands(workspace_id,id) on delete restrict
);
create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  brand_id uuid not null,
  parent_id uuid,
  series_id uuid,
  kind text generated always as (case when parent_id is null then 'original' else 'derivative' end) stored,
  format text not null check(format in ('video','short','post')),
  title text not null check(char_length(btrim(title)) between 1 and 500),
  source_url text not null default '' check(char_length(source_url)<=4096),
  source_transcript text not null default '' check(char_length(source_transcript)<=100000),
  notes text not null default '' check(char_length(notes)<=100000),
  production_stage text not null default 'planned' check(production_stage in ('planned','recorded','edited','ready')),
  request_id uuid not null,
  request_payload jsonb not null,
  revision integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,brand_id,id), unique(workspace_id,request_id),
  foreign key(workspace_id,brand_id) references public.brands(workspace_id,id) on delete restrict,
  foreign key(workspace_id,brand_id,parent_id) references public.content_items(workspace_id,brand_id,id) on delete restrict,
  foreign key(workspace_id,brand_id,series_id) references public.series(workspace_id,brand_id,id) on delete restrict,
  check(parent_id is null or parent_id<>id)
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  brand_id uuid not null,
  content_id uuid not null,
  stage text not null check(stage in ('record','edit','ready')),
  position integer not null check(position between 1 and 3),
  completed_at timestamptz,
  revision integer not null default 1,
  unique(content_id,stage), unique(content_id,position),
  foreign key(workspace_id,brand_id,content_id) references public.content_items(workspace_id,brand_id,id) on delete restrict
);
create table public.publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  brand_id uuid not null,
  content_id uuid not null,
  platform text not null check(char_length(platform) between 1 and 80),
  published_at timestamptz,
  url text not null default '' check(char_length(url)<=4096),
  revision integer not null default 1,
  unique(content_id,platform),
  foreign key(workspace_id,brand_id,content_id) references public.content_items(workspace_id,brand_id,id) on delete restrict
);
create index series_scope_created_idx on public.series(workspace_id,brand_id,created_at,id);
create index content_scope_created_idx on public.content_items(workspace_id,brand_id,created_at,id);
create index content_parent_idx on public.content_items(workspace_id,brand_id,parent_id,created_at,id);
create index tasks_scope_content_idx on public.tasks(workspace_id,brand_id,content_id);
create index publications_scope_content_idx on public.publications(workspace_id,brand_id,content_id);

alter table public.series enable row level security;
alter table public.content_items enable row level security;
alter table public.tasks enable row level security;
alter table public.publications enable row level security;
revoke all on public.series,public.content_items,public.tasks,public.publications from public,anon,authenticated;
-- No direct client writes: use the narrowly-scoped functions below.
grant select(id,workspace_id,brand_id,title,revision,archived_at,created_at) on public.series to authenticated;
grant select(id,workspace_id,brand_id,parent_id,series_id,kind,format,title,source_url,source_transcript,notes,production_stage,revision,archived_at,created_at,updated_at) on public.content_items to authenticated;
grant select on public.tasks,public.publications to authenticated;
create policy series_read on public.series for select to authenticated using(public.is_active_workspace_member(workspace_id));
create policy content_read on public.content_items for select to authenticated using(public.is_active_workspace_member(workspace_id));
create policy tasks_read on public.tasks for select to authenticated using(public.is_active_workspace_member(workspace_id));
create policy publications_read on public.publications for select to authenticated using(public.is_active_workspace_member(workspace_id));

-- Locks the brand so archiving cannot race a content mutation. Runs with empty search_path.
create function public.content_assert_brand(p_workspace uuid,p_brand uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_active_workspace_member(p_workspace) then raise exception 'not_found' using errcode='P0002'; end if;
  perform 1 from public.brands b where b.id=p_brand and b.workspace_id=p_workspace and b.archived_at is null for share;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
end;
$$;
create function public.content_locked_item(p_workspace uuid,p_brand uuid,p_id uuid,p_revision integer,p_allow_archived boolean default false)
returns public.content_items language plpgsql security definer set search_path='' as $$
declare v public.content_items;
begin
  perform public.content_assert_brand(p_workspace,p_brand);
  select * into v from public.content_items where workspace_id=p_workspace and brand_id=p_brand and id=p_id for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  if p_revision is null or v.revision<>p_revision then raise exception 'stale_revision' using errcode='CP001'; end if;
  if not p_allow_archived and v.archived_at is not null then raise exception 'invalid_transition' using errcode='CP002'; end if;
  return v;
end;
$$;
create function public.content_safe_url(p_url text) returns boolean language sql immutable set search_path='' as $$
 select p_url='' or (p_url ~ '^https?://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$' and char_length(p_url)<=4096);
$$;

create function public.create_manual_series(p_workspace uuid,p_brand uuid,p_request uuid,p_title text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v public.series; v_payload jsonb;
begin
  perform public.content_assert_brand(p_workspace,p_brand);
  if p_request is null or p_title is null or char_length(btrim(p_title)) not between 1 and 500 then raise exception 'invalid_name' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('series:'||p_workspace::text||p_request::text,0));
  v_payload:=jsonb_build_object('brand',p_brand,'title',btrim(p_title));
  select * into v from public.series where workspace_id=p_workspace and request_id=p_request;
  if found then
    if v.request_payload<>v_payload then raise exception 'stale_revision' using errcode='CP001'; end if;
    return v.id;
  end if;
  insert into public.series(workspace_id,brand_id,request_id,request_payload,title)
    values(p_workspace,p_brand,p_request,v_payload,btrim(p_title)) returning * into v;
  return v.id;
end;
$$;
create function public.edit_manual_series(p_workspace uuid,p_brand uuid,p_id uuid,p_revision integer,p_title text,p_archived boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v public.series;
begin
  perform public.content_assert_brand(p_workspace,p_brand);
  select * into v from public.series where workspace_id=p_workspace and brand_id=p_brand and id=p_id for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  if p_revision is null or v.revision<>p_revision then raise exception 'stale_revision' using errcode='CP001'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 500 or p_archived is null then raise exception 'invalid_name' using errcode='22023'; end if;
  update public.series set title=btrim(p_title),archived_at=case when p_archived then coalesce(archived_at,now()) else null end,revision=revision+1 where id=p_id;
end;
$$;
create function public.create_manual_content(p_workspace uuid,p_brand uuid,p_request uuid,p_title text,p_format text,p_parent uuid default null,p_series uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v public.content_items; v_payload jsonb; v_stages text[]; v_stage text; v_position integer:=0;
begin
  perform public.content_assert_brand(p_workspace,p_brand);
  if p_request is null or p_title is null or char_length(btrim(p_title)) not between 1 and 500 or p_format is null or p_format not in ('video','short','post') then raise exception 'invalid_name' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('content:'||p_workspace::text||p_request::text,0));
  v_payload:=jsonb_build_object('brand',p_brand,'title',btrim(p_title),'format',p_format,'parent',p_parent,'series',p_series);
  select * into v from public.content_items where workspace_id=p_workspace and request_id=p_request;
  if found then
    if v.request_payload<>v_payload then raise exception 'stale_revision' using errcode='CP001'; end if;
    return v.id;
  end if;
  if p_parent is not null then
    perform 1 from public.content_items where id=p_parent and workspace_id=p_workspace and brand_id=p_brand and parent_id is null and archived_at is null for share;
    if not found then raise exception 'not_found' using errcode='P0002'; end if;
  end if;
  if p_series is not null then
    perform 1 from public.series where id=p_series and workspace_id=p_workspace and brand_id=p_brand and archived_at is null for share;
    if not found then raise exception 'not_found' using errcode='P0002'; end if;
  end if;
  insert into public.content_items(workspace_id,brand_id,request_id,request_payload,title,format,parent_id,series_id)
    values(p_workspace,p_brand,p_request,v_payload,btrim(p_title),p_format,p_parent,p_series) returning * into v;
  v_stages:=case when p_format='post' then array['edit','ready'] else array['record','edit','ready'] end;
  foreach v_stage in array v_stages loop
    v_position:=v_position+1;
    insert into public.tasks(workspace_id,brand_id,content_id,stage,position) values(p_workspace,p_brand,v.id,v_stage,v_position);
  end loop;
  return v.id;
end;
$$;
create function public.edit_manual_content(p_workspace uuid,p_brand uuid,p_id uuid,p_revision integer,p_title text,p_url text,p_transcript text,p_notes text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.content_locked_item(p_workspace,p_brand,p_id,p_revision);
  if p_title is null or char_length(btrim(p_title)) not between 1 and 500 or p_url is null or not public.content_safe_url(p_url) or p_transcript is null or char_length(p_transcript)>100000 or p_notes is null or char_length(p_notes)>100000 then raise exception 'invalid_name' using errcode='22023'; end if;
  update public.content_items set title=btrim(p_title),source_url=p_url,source_transcript=p_transcript,notes=p_notes,revision=revision+1,updated_at=now() where id=p_id;
end;
$$;
create function public.archive_manual_content(p_workspace uuid,p_brand uuid,p_id uuid,p_revision integer,p_archived boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.content_locked_item(p_workspace,p_brand,p_id,p_revision,true);
  if p_archived is null then raise exception 'invalid_decision' using errcode='22023'; end if;
  update public.content_items set archived_at=case when p_archived then coalesce(archived_at,now()) else null end,revision=revision+1,updated_at=now() where id=p_id;
end;
$$;
create function public.set_manual_content_task(p_workspace uuid,p_brand uuid,p_id uuid,p_revision integer,p_stage text,p_completed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v public.content_items; v_task public.tasks; v_state text;
begin
  v:=public.content_locked_item(p_workspace,p_brand,p_id,p_revision);
  select * into v_task from public.tasks where content_id=p_id and stage=p_stage;
  if not found or p_completed is null then raise exception 'invalid_decision' using errcode='22023'; end if;
  if p_completed then
    if exists(select 1 from public.tasks where content_id=p_id and position<v_task.position and completed_at is null) then raise exception 'invalid_transition' using errcode='CP002'; end if;
    update public.tasks set completed_at=coalesce(completed_at,now()),revision=revision+1 where id=v_task.id;
  else
    -- Reopening an earlier step reopens dependent steps; publication history stays factual.
    update public.tasks set completed_at=null,revision=revision+1 where content_id=p_id and position>=v_task.position and completed_at is not null;
  end if;
  select case stage when 'record' then 'recorded' when 'edit' then 'edited' else 'ready' end into v_state from public.tasks where content_id=p_id and completed_at is not null order by position desc limit 1;
  update public.content_items set production_stage=coalesce(v_state,'planned'),revision=revision+1,updated_at=now() where id=p_id;
end;
$$;
create function public.save_manual_publication(p_workspace uuid,p_brand uuid,p_id uuid,p_revision integer,p_platform text,p_published_at timestamptz,p_url text) returns void
language plpgsql security definer set search_path='' as $$
declare v public.content_items; v_pub public.publications;
begin
  perform public.content_assert_brand(p_workspace,p_brand);
  select * into v from public.content_items where id=p_id and workspace_id=p_workspace and brand_id=p_brand for update;
  if not found then raise exception 'not_found' using errcode='P0002'; end if;
  if v.archived_at is not null then raise exception 'invalid_transition' using errcode='CP002'; end if;
  if p_platform is null or char_length(p_platform) not between 1 and 80 or p_url is null or not public.content_safe_url(p_url) or p_published_at>now() or p_revision is null or p_revision<0 then raise exception 'invalid_decision' using errcode='22023'; end if;
  select * into v_pub from public.publications where content_id=p_id and platform=p_platform for update;
  if found then
    if p_revision=0 and v_pub.published_at is not distinct from p_published_at and v_pub.url=p_url then return; end if;
    if v_pub.revision<>p_revision then raise exception 'stale_revision' using errcode='CP001'; end if;
    update public.publications set published_at=p_published_at,url=p_url,revision=revision+1 where id=v_pub.id;
  else
    if p_revision<>0 then raise exception 'stale_revision' using errcode='CP001'; end if;
    if (select count(*) from public.publications where content_id=p_id)>=100 then raise exception 'invalid_decision' using errcode='22023'; end if;
    insert into public.publications(workspace_id,brand_id,content_id,platform,published_at,url) values(p_workspace,p_brand,p_id,p_platform,p_published_at,p_url);
  end if;
  update public.content_items set revision=revision+1,updated_at=now() where id=p_id;
end;
$$;

revoke all on function public.content_assert_brand(uuid,uuid),public.content_locked_item(uuid,uuid,uuid,integer,boolean),public.content_safe_url(text),
public.create_manual_series(uuid,uuid,uuid,text),public.edit_manual_series(uuid,uuid,uuid,integer,text,boolean),
public.create_manual_content(uuid,uuid,uuid,text,text,uuid,uuid),public.edit_manual_content(uuid,uuid,uuid,integer,text,text,text,text),
public.archive_manual_content(uuid,uuid,uuid,integer,boolean),public.set_manual_content_task(uuid,uuid,uuid,integer,text,boolean),
public.save_manual_publication(uuid,uuid,uuid,integer,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.create_manual_series(uuid,uuid,uuid,text),public.edit_manual_series(uuid,uuid,uuid,integer,text,boolean),
public.create_manual_content(uuid,uuid,uuid,text,text,uuid,uuid),public.edit_manual_content(uuid,uuid,uuid,integer,text,text,text,text),
public.archive_manual_content(uuid,uuid,uuid,integer,boolean),public.set_manual_content_task(uuid,uuid,uuid,integer,text,boolean),
public.save_manual_publication(uuid,uuid,uuid,integer,text,timestamptz,text) to authenticated;
commit;
