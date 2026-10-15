-- Feature 08 only: private brand conversations, confirmed memory and provenance.
-- Apply once after feature 07. Earlier migrations are unchanged.
begin;
create table public.assistant_conversations (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,brand_id uuid not null,
 user_id uuid not null references auth.users(id) on delete restrict,
 context_revision integer not null default 1,context_after timestamptz not null default 'epoch',
 revision integer not null default 1,created_at timestamptz not null default now(),
 unique(workspace_id,brand_id,user_id),unique(workspace_id,brand_id,user_id,id),
 foreign key(workspace_id,brand_id)references public.brands(workspace_id,id)on delete restrict
);
create table public.assistant_messages (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,brand_id uuid not null,user_id uuid not null,
 conversation_id uuid not null,turn_id uuid not null,role text not null check(role in ('user','assistant')),
 body text check(char_length(body)<=24000),status text not null check(status in ('pending','complete','failed')),
 context_revision integer not null,revision integer not null default 1,
 proposals jsonb not null default '[]' check(jsonb_typeof(proposals)='array' and jsonb_array_length(proposals)<=4 and pg_column_size(proposals)<=16384),
 confirmed integer[] not null default '{}',created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,lease_until timestamptz not null,forgotten_at timestamptz,
 search_document tsvector generated always as(to_tsvector('simple'::regconfig,coalesce(body,'')))stored,
 unique(conversation_id,turn_id,role),
 foreign key(workspace_id,brand_id,user_id,conversation_id)references public.assistant_conversations(workspace_id,brand_id,user_id,id)on delete restrict
);
create index assistant_messages_history on public.assistant_messages(conversation_id,created_at desc,id desc);
create index assistant_messages_user_admission on public.assistant_messages(workspace_id,user_id,created_at desc)where role='user';
create index assistant_messages_retained on public.assistant_messages(conversation_id,expires_at,created_at desc,id desc);
create index assistant_messages_search on public.assistant_messages using gin(search_document);
create index assistant_messages_expiry on public.assistant_messages(expires_at)where forgotten_at is null;
create table public.assistant_memories (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,user_id uuid not null references auth.users(id)on delete restrict,
 brand_id uuid,scope text not null check(scope in ('personal','brand')),key text not null check(key~'^[a-z][a-z0-9_-]{0,63}$'),
 value text check(char_length(value)between 1 and 2000),revision integer not null default 1,
 source_message_id uuid references public.assistant_messages(id)on delete restrict,
 updated_at timestamptz not null default clock_timestamp(),forgotten_at timestamptz,
 check((scope='personal'and brand_id is null)or(scope='brand'and brand_id is not null)),
 unique nulls not distinct(workspace_id,user_id,brand_id,key),
 foreign key(workspace_id)references public.workspaces(id)on delete restrict,
 foreign key(workspace_id,brand_id)references public.brands(workspace_id,id)on delete restrict
);
create index assistant_memories_scope on public.assistant_memories(workspace_id,user_id,brand_id)where forgotten_at is null;
create table public.assistant_summaries (
 conversation_id uuid primary key references public.assistant_conversations(id)on delete restrict,
 context_revision integer not null,body text not null check(char_length(body)<=4000),source_ids uuid[] not null,
 updated_at timestamptz not null default clock_timestamp()
);
create index content_items_assistant_search on public.content_items using gin(to_tsvector('simple'::regconfig,title));
create index content_items_assistant_stats on public.content_items(workspace_id,brand_id,format,production_stage)where archived_at is null;
create function public.assistant_assert_scope(p_user uuid,p_workspace uuid,p_brand uuid,p_active boolean default true)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_user is null or not exists(select 1 from public.account_access a join public.workspace_members m on m.user_id=a.user_id
 join public.workspaces w on w.id=m.workspace_id join public.brands b on b.workspace_id=w.id
 where a.user_id=p_user and a.status='approved'and m.workspace_id=p_workspace and m.revoked_at is null
 and w.archived_at is null and b.id=p_brand and(not p_active or b.archived_at is null))then
 raise exception 'assistant_scope_not_found'using errcode='P0002';end if;
end;$$;
create function public.assistant_can_read(p_user uuid,p_workspace uuid,p_brand uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if p_user is distinct from auth.uid()then return false;end if;
 return exists(select 1 from public.account_access a join public.workspace_members m on m.user_id=a.user_id
 join public.workspaces w on w.id=m.workspace_id where a.user_id=p_user and a.status='approved'
 and m.workspace_id=p_workspace and m.revoked_at is null and w.archived_at is null)
 and(p_brand is null or exists(select 1 from public.brands b where b.id=p_brand and b.workspace_id=p_workspace));
end;$$;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_memories enable row level security;
alter table public.assistant_summaries enable row level security;
revoke all on public.assistant_conversations,public.assistant_messages,public.assistant_memories,public.assistant_summaries from public,anon,authenticated,service_role;
grant select on public.assistant_conversations,public.assistant_messages,public.assistant_memories,public.assistant_summaries to authenticated;
create policy assistant_conversations_read on public.assistant_conversations for select to authenticated using(public.assistant_can_read(user_id,workspace_id,brand_id));
create policy assistant_messages_read on public.assistant_messages for select to authenticated using(public.assistant_can_read(user_id,workspace_id,brand_id)and expires_at>now());
create policy assistant_memories_read on public.assistant_memories for select to authenticated using(public.assistant_can_read(user_id,workspace_id,brand_id)and forgotten_at is null);
create policy assistant_summaries_read on public.assistant_summaries for select to authenticated using(exists(select 1 from public.assistant_conversations c where c.id=conversation_id and public.assistant_can_read(c.user_id,c.workspace_id,c.brand_id)and c.context_revision=assistant_summaries.context_revision)and not exists(select 1 from unnest(source_ids)s where not exists(select 1 from public.assistant_messages m where m.id=s and m.forgotten_at is null and m.expires_at>now())));
create function public.assistant_invalidate(p_user uuid,p_workspace uuid,p_brand uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.assistant_conversations set context_revision=context_revision+1,context_after=clock_timestamp(),revision=revision+1
 where user_id=p_user and workspace_id=p_workspace and(p_brand is null or brand_id=p_brand);
 update public.assistant_summaries s set body='',source_ids='{}',context_revision=c.context_revision,updated_at=clock_timestamp()
 from public.assistant_conversations c where s.conversation_id=c.id and c.user_id=p_user and c.workspace_id=p_workspace and(p_brand is null or c.brand_id=p_brand);
end;$$;
create function public.assistant_settings_changed()returns trigger language plpgsql security definer set search_path='' as $$
declare c record;
begin
 if tg_table_name='creator_preferences'then
  for c in select distinct user_id,workspace_id from public.assistant_conversations where user_id=new.user_id loop
   perform public.assistant_invalidate(c.user_id,c.workspace_id,null);end loop;
 else
  if new.profile is distinct from old.profile or new.targets is distinct from old.targets or new.archived_at is distinct from old.archived_at then
   for c in select user_id,workspace_id,brand_id from public.assistant_conversations where workspace_id=new.workspace_id and brand_id=new.id loop
    perform public.assistant_invalidate(c.user_id,c.workspace_id,c.brand_id);end loop;
  end if;
 end if;return new;
end;$$;
create trigger assistant_creator_preferences_changed after insert or update on public.creator_preferences for each row execute function public.assistant_settings_changed();
create trigger assistant_brand_settings_changed after update on public.brands for each row execute function public.assistant_settings_changed();

create function public.assistant_read(p_workspace uuid,p_brand uuid,p_kind text,p_args jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();c public.assistant_conversations;l integer;v jsonb;q text;cur timestamptz;cid uuid;
begin
 perform public.assistant_assert_scope(u,p_workspace,p_brand,false);
 select * into c from public.assistant_conversations where workspace_id=p_workspace and brand_id=p_brand and user_id=u;
 l:=least(greatest(coalesce((p_args->>'limit')::integer,20),1),100);
 if p_kind in ('snapshot','export')then
  if nullif(p_args->>'cursor','')is not null then cur:=split_part(p_args->>'cursor','|',1)::timestamptz;cid:=split_part(p_args->>'cursor','|',2)::uuid;end if;
  select coalesce(jsonb_agg(to_jsonb(t)order by t.created_at desc,t.id desc),'[]')into v from
   (select id,conversation_id,turn_id,role,body,status,created_at,revision,proposals,confirmed,forgotten_at from public.assistant_messages
    where conversation_id=c.id and expires_at>clock_timestamp()and(cur is null or(created_at,id)<(cur,cid))
    order by created_at desc,id desc limit l+1)t;
  return jsonb_build_object('conversation',case when c.id is null then null else jsonb_build_object('id',c.id,'context_revision',c.context_revision,'context_after',c.context_after,'revision',c.revision)end,
   'messages',v,'memories',coalesce((select jsonb_agg(to_jsonb(t))from(select id,scope,key,value,revision,source_message_id,updated_at from public.assistant_memories where user_id=u and workspace_id=p_workspace and(brand_id is null or brand_id=p_brand)and forgotten_at is null order by scope,key limit 100)t),'[]'));
 elsif p_kind='message'then
  select to_jsonb(t)into v from(select id,conversation_id,turn_id,role,body,status,created_at,revision,proposals,confirmed,forgotten_at from public.assistant_messages where id=(p_args->>'id')::uuid and conversation_id=c.id and expires_at>clock_timestamp())t;return v;
 elsif p_kind='stats'then
  select jsonb_build_object('originals_created',(count(*)filter(where kind='original'))::text,'derivatives_created',(count(*)filter(where kind='derivative'))::text,
   'videos_ready',(count(*)filter(where format='video'and production_stage='ready'))::text,'shorts_ready',(count(*)filter(where format='short'and production_stage='ready'))::text,
   'posts_ready',(count(*)filter(where format='post'and production_stage='ready'))::text,'videos_recorded',(count(*)filter(where format='video'and production_stage in('recorded','edited','ready')))::text)
   into v from public.content_items where workspace_id=p_workspace and brand_id=p_brand and archived_at is null;
  return v||jsonb_build_object('publications',(select count(*)::text from public.publications p join public.content_items i on i.id=p.content_id where p.workspace_id=p_workspace and p.brand_id=p_brand and p.published_at is not null and i.archived_at is null));
 elsif p_kind='history'then
  q:=left(coalesce(p_args->>'query',''),200);l:=least(l,20);
  return coalesce((select jsonb_agg(to_jsonb(t))from(select id,role,body,created_at from public.assistant_messages
   where conversation_id=c.id and status='complete'and forgotten_at is null and expires_at>clock_timestamp()and created_at>c.context_after
   and(q=''or search_document@@websearch_to_tsquery('simple'::regconfig,q))order by created_at desc,id desc limit l)t),'[]');
 elsif p_kind='content_history'then
  q:=left(coalesce(p_args->>'query',''),200);l:=least(l,20);
  return coalesce((select jsonb_agg(to_jsonb(t))from(select id,title,format,production_stage as stage from public.content_items where workspace_id=p_workspace and brand_id=p_brand and archived_at is null
   and(q=''or to_tsvector('simple'::regconfig,title)@@websearch_to_tsquery('simple'::regconfig,q))order by created_at desc,id desc limit l)t),'[]');
 end if;raise exception 'invalid_assistant_read'using errcode='22023';
end;$$;

create function public.assistant_mutate(p_user uuid,p_workspace uuid,p_brand uuid,p_operation text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.assistant_conversations;m public.assistant_messages;src public.assistant_messages;mem public.assistant_memories;
 t uuid;mid uuid;uid uuid;rev integer;k text;v text;sc text;b uuid;prop jsonb;v_settings jsonb;item record;ids uuid[];summary text;idx integer;
begin
 perform public.assistant_assert_scope(p_user,p_workspace,p_brand,p_operation not in('forget','memory','cleanup'));
 -- Serialize per-user workspace mutations before row locks, including cross-brand personal-memory invalidation.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('assistant_user_'||p_user::text||p_workspace::text));
 select * into c from public.assistant_conversations where workspace_id=p_workspace and brand_id=p_brand and user_id=p_user for update;
 if p_operation='cleanup'then
  update public.assistant_messages set body=null,proposals='[]',confirmed='{}',forgotten_at=clock_timestamp(),revision=revision+1,status=case when status='pending'then 'failed'else status end where conversation_id=c.id and expires_at<=clock_timestamp()and forgotten_at is null;
  update public.assistant_summaries set body='',source_ids='{}',updated_at=clock_timestamp()where conversation_id=c.id and exists(select 1 from unnest(source_ids)i where not exists(select 1 from public.assistant_messages retained_source where retained_source.id=i and retained_source.forgotten_at is null and retained_source.expires_at>clock_timestamp()));return '{}';
 elsif p_operation='begin'then
  if c.id is null then insert into public.assistant_conversations(workspace_id,brand_id,user_id)values(p_workspace,p_brand,p_user)returning * into c;end if;
  if char_length(p_data->>'text')not between 1 and 8000 or(p_data->>'leaseSeconds')::integer not between 10 and 600 or(p_data->>'retentionDays')::integer not between 1 and 3650 then raise exception 'invalid_assistant_input'using errcode='22023';end if;
  t:=(p_data->>'requestId')::uuid;
  select * into m from public.assistant_messages where conversation_id=c.id and turn_id=t and role='user';
  if m.id is not null then
   if m.body is distinct from p_data->>'text'then raise exception 'stale_revision'using errcode='40001';end if;
   select id into mid from public.assistant_messages where conversation_id=c.id and turn_id=t and role='assistant';
   return jsonb_build_object('conversation_id',c.id,'turn_id',t,'user_message_id',m.id,'assistant_message_id',mid,'context_revision',m.context_revision,'status',m.status,'replay',true);
  end if;
  if coalesce((p_data->'admission'->>'minute')::integer,0)not between 1 and 60 or coalesce((p_data->'admission'->>'day')::integer,0)not between 1 and 10000 then raise exception 'invalid_admission'using errcode='22023';end if;
  if(select count(*)from public.assistant_messages where workspace_id=p_workspace and user_id=p_user and role='user'and created_at>clock_timestamp()-interval '1 minute')>=(p_data->'admission'->>'minute')::integer
   or(select count(*)from public.assistant_messages where workspace_id=p_workspace and user_id=p_user and role='user'and created_at>=(date_trunc('day',clock_timestamp()at time zone 'UTC')at time zone 'UTC'))>=(p_data->'admission'->>'day')::integer then raise exception 'assistant_rate_limited'using errcode='P0001';end if;
  update public.assistant_messages set status='failed',proposals='[]' where conversation_id=c.id and status='pending'and lease_until<=clock_timestamp();
  if exists(select 1 from public.assistant_messages where conversation_id=c.id and status='pending')then raise exception 'stale_revision'using errcode='40001';end if;
  insert into public.assistant_messages(workspace_id,brand_id,user_id,conversation_id,turn_id,role,body,status,context_revision,expires_at,lease_until)
   values(p_workspace,p_brand,p_user,c.id,t,'user',p_data->>'text','pending',c.context_revision,clock_timestamp()+make_interval(days=>(p_data->>'retentionDays')::integer),clock_timestamp()+make_interval(secs=>(p_data->>'leaseSeconds')::integer))returning id into uid;
  insert into public.assistant_messages(workspace_id,brand_id,user_id,conversation_id,turn_id,role,status,context_revision,expires_at,lease_until)
   values(p_workspace,p_brand,p_user,c.id,t,'assistant','pending',c.context_revision,clock_timestamp()+make_interval(days=>(p_data->>'retentionDays')::integer),clock_timestamp()+make_interval(secs=>(p_data->>'leaseSeconds')::integer))returning id into mid;
  update public.assistant_conversations set revision=revision+1 where id=c.id;
  return jsonb_build_object('conversation_id',c.id,'turn_id',t,'user_message_id',uid,'assistant_message_id',mid,'context_revision',c.context_revision,'status','pending','replay',false);
 elsif p_operation in('guard','finish','fail')then
  select * into m from public.assistant_messages where id=(p_data->>'assistantMessageId')::uuid and conversation_id=c.id and role='assistant'and turn_id=(p_data->>'turnId')::uuid for update;
  if m.id is null then raise exception 'assistant_not_found'using errcode='P0002';end if;
  if p_operation='fail'then
   update public.assistant_messages set status='failed',body=case when role='assistant'then null else body end,proposals='[]'where conversation_id=c.id and turn_id=m.turn_id and status='pending';return '{}';end if;
  if m.status<>'pending'or m.lease_until<=clock_timestamp()or m.context_revision<>c.context_revision or m.forgotten_at is not null then raise exception 'stale_revision'using errcode='40001';end if;
  if p_operation='guard'then return '{}';end if;
  if char_length(p_data->>'text')not between 1 and 24000 or jsonb_typeof(p_data->'proposals')<>'array'then raise exception 'invalid_assistant_output'using errcode='22023';end if;
  update public.assistant_messages set body=p_data->>'text',proposals=p_data->'proposals',status='complete',revision=revision+1 where id=m.id;
  update public.assistant_messages set status='complete',revision=revision+1 where conversation_id=c.id and turn_id=m.turn_id and role='user';
  update public.assistant_conversations set revision=revision+1 where id=c.id;return '{}';
 elsif p_operation='summary'then
  if c.id is null or c.context_revision<>(p_data->>'contextRevision')::integer then raise exception 'stale_revision'using errcode='40001';end if;
  select array_agg(x::uuid)into ids from jsonb_array_elements_text(p_data->'ids')x;
  ids:=coalesce(ids,'{}');
  if cardinality(ids)>20 or(p_data->>'excerpt')::integer not between 1 and 500 then raise exception 'invalid_summary'using errcode='22023';end if;
  if exists(select 1 from unnest(ids)i where not exists(select 1 from public.assistant_messages x where x.id=i and x.conversation_id=c.id and x.status='complete'and x.forgotten_at is null and x.created_at>c.context_after and x.expires_at>clock_timestamp()))then raise exception 'assistant_not_found'using errcode='P0002';end if;
  select left(coalesce(string_agg(role||': '||left(body,(p_data->>'excerpt')::integer),E'\n'order by created_at,id),''),4000)into summary from public.assistant_messages where id=any(ids);
  insert into public.assistant_summaries(conversation_id,context_revision,body,source_ids)values(c.id,c.context_revision,summary,ids)
   on conflict(conversation_id)do update set context_revision=excluded.context_revision,body=excluded.body,source_ids=excluded.source_ids,updated_at=clock_timestamp();
  return jsonb_build_object('text',summary,'source_ids',ids,'context_revision',c.context_revision);
 elsif p_operation='memory'then
  sc:=p_data->>'scope';b:=case when sc='brand'then p_brand else null end;k:=p_data->>'key';v:=p_data->>'value';rev:=(p_data->>'revision')::integer;
  if sc not in('personal','brand')or k!~'^[a-z][a-z0-9_-]{0,63}$'or char_length(v)not between 1 and 2000 then raise exception 'invalid_memory'using errcode='22023';end if;
  if nullif(p_data->>'id','')is not null then select * into mem from public.assistant_memories where id=(p_data->>'id')::uuid and user_id=p_user and workspace_id=p_workspace and brand_id is not distinct from b and scope=sc for update;
   if mem.id is null then raise exception 'assistant_not_found'using errcode='P0002';end if;
   if mem.revision<>rev then raise exception 'stale_revision'using errcode='40001';end if;
   if mem.key<>k then raise exception 'invalid_memory_key'using errcode='22023';end if;
  else
   select * into mem from public.assistant_memories where user_id=p_user and workspace_id=p_workspace and brand_id is not distinct from b and key=k for update;
   if mem.id is not null and mem.forgotten_at is null then raise exception 'stale_revision'using errcode='40001';end if;
  end if;
  if mem.id is null and(select count(*)from public.assistant_memories where user_id=p_user and workspace_id=p_workspace and brand_id is not distinct from b )>=50 then raise exception 'invalid_memory_limit'using errcode='22023';end if;
  if mem.id is null then insert into public.assistant_memories(workspace_id,user_id,brand_id,scope,key,value)values(p_workspace,p_user,b,sc,k,v);
  else update public.assistant_memories set value=case when(p_data->>'forget')::boolean then null else v end,forgotten_at=case when(p_data->>'forget')::boolean then clock_timestamp()else null end,source_message_id=null,revision=revision+1,updated_at=clock_timestamp()where id=mem.id;end if;
  perform public.assistant_invalidate(p_user,p_workspace,b);return '{}';
 elsif p_operation='confirm'then
  select * into m from public.assistant_messages where id=(p_data->>'messageId')::uuid and conversation_id=c.id and role='assistant'and status='complete'and forgotten_at is null and expires_at>clock_timestamp()for update;
  idx:=(p_data->>'index')::integer;
  if m.id is null or idx is null or idx<0 or idx>=jsonb_array_length(m.proposals)then raise exception 'assistant_not_found'using errcode='P0002';end if;
  if idx=any(m.confirmed)then return '{}';end if;
  prop:=m.proposals->idx;
  select * into src from public.assistant_messages where conversation_id=c.id and turn_id=m.turn_id and role='user'and forgotten_at is null and expires_at>clock_timestamp();
  if src.id is null then raise exception 'assistant_not_found'using errcode='P0002';end if;
  if prop->>'kind'='memory'then
   sc:=prop->>'scope';b:=case when sc='brand'then p_brand else null end;k:=prop->>'key';v:=prop->>'value';
   if sc not in('personal','brand')or k!~'^[a-z][a-z0-9_-]{0,63}$'or char_length(v)not between 1 and 2000 then raise exception 'invalid_memory'using errcode='22023';end if;
   select * into mem from public.assistant_memories where workspace_id=p_workspace and user_id=p_user and brand_id is not distinct from b and key=k for update;
   -- An older proposal cannot replace a later edit, confirmation or forgetting action.
   if mem.id is not null and mem.updated_at>m.created_at then raise exception 'stale_revision'using errcode='40001';end if;
   if mem.id is null and(select count(*)from public.assistant_memories where user_id=p_user and workspace_id=p_workspace and brand_id is not distinct from b )>=50 then raise exception 'invalid_memory_limit'using errcode='22023';end if;
   insert into public.assistant_memories(workspace_id,user_id,brand_id,scope,key,value,source_message_id)values(p_workspace,p_user,b,sc,k,v,src.id)
    on conflict(workspace_id,user_id,brand_id,key)do update set value=excluded.value,source_message_id=excluded.source_message_id,revision=assistant_memories.revision+1,forgotten_at=null,updated_at=clock_timestamp();
   perform public.assistant_invalidate(p_user,p_workspace,b);
  elsif prop->>'kind'='preference'then
   v_settings:=p_data->'settings';rev:=(p_data->>'revision')::integer;
   if jsonb_typeof(v_settings)<>'object'then raise exception 'invalid_settings'using errcode='22023';end if;
   if prop->>'field'in('timezone','availability')then
    if rev=0 then insert into public.creator_preferences(user_id,settings)values(p_user,v_settings);
    else update public.creator_preferences set settings=v_settings where user_id=p_user and revision=rev;
     if not found then raise exception 'stale_revision'using errcode='40001';end if;end if;
   else
    update public.brands set profile=jsonb_set(profile,'{onboarding}',v_settings-'targets'-'weeklyTargets'),targets=jsonb_set(jsonb_set(targets,'{onboarding}',v_settings->'targets'),'{weeklyOverrides}',v_settings->'weeklyTargets')where id=p_brand and workspace_id=p_workspace and revision=rev;
    if not found then raise exception 'stale_revision'using errcode='40001';end if;
   end if;
  else raise exception 'invalid_proposal'using errcode='22023';end if;
  update public.assistant_messages set confirmed=array_append(confirmed,idx),revision=revision+1 where id=m.id;return '{}';
 elsif p_operation='forget'then
  if c.id is null then return '{}';end if;
  if nullif(p_data->>'messageId','')is not null then
   select * into m from public.assistant_messages where id=(p_data->>'messageId')::uuid and conversation_id=c.id for update;
   if m.id is null then raise exception 'assistant_not_found'using errcode='P0002';end if;
   if m.revision<>(p_data->>'revision')::integer then raise exception 'stale_revision'using errcode='40001';end if;
   -- Forget the pair: the response may repeat the user's private source text.
   select array_agg(id)into ids from public.assistant_messages where conversation_id=c.id and turn_id=m.turn_id;
  else
   if c.revision<>(p_data->>'revision')::integer then raise exception 'stale_revision'using errcode='40001';end if;
   select array_agg(id)into ids from public.assistant_messages where conversation_id=c.id;
  end if;
  update public.assistant_messages set body=null,proposals='[]',confirmed='{}',forgotten_at=clock_timestamp(),revision=revision+1,status=case when status='pending'then 'failed'else status end where id=any(ids);
  update public.assistant_memories set value=null,forgotten_at=clock_timestamp(),revision=revision+1,source_message_id=null,updated_at=clock_timestamp() where source_message_id=any(ids)and user_id=p_user;
  perform public.assistant_invalidate(p_user,p_workspace,null);return '{}';
 end if;
 raise exception 'invalid_assistant_operation'using errcode='22023';
end;$$;
revoke all on function public.assistant_assert_scope(uuid,uuid,uuid,boolean),public.assistant_can_read(uuid,uuid,uuid),public.assistant_invalidate(uuid,uuid,uuid),public.assistant_settings_changed(),public.assistant_read(uuid,uuid,text,jsonb),public.assistant_mutate(uuid,uuid,uuid,text,jsonb)from public,anon,authenticated,service_role;
grant execute on function public.assistant_can_read(uuid,uuid,uuid),public.assistant_read(uuid,uuid,text,jsonb)to authenticated;
grant execute on function public.assistant_mutate(uuid,uuid,uuid,text,jsonb)to service_role;
commit;
