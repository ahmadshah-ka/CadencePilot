-- Feature 07: additive, private AI admission/usage ledger. Apply once after earlier migrations.
begin;
create table public.ai_budget_windows (
 scope text not null, period text not null check(period in ('day','minute')),
 starts_at timestamptz not null, tokens bigint not null default 0 check(tokens>=0),
 requests bigint not null default 0 check(requests>=0), primary key(scope,period,starts_at)
);
create table public.ai_reservations (
 id uuid primary key, workspace_id uuid not null, brand_id uuid not null,
 user_id uuid not null references auth.users(id) on delete restrict,
 trace_id uuid not null, provider text not null check(char_length(provider)<=80),
 model text not null check(char_length(model)<=200), prompt_version text not null check(char_length(prompt_version)<=120),
 reserved_tokens bigint not null check(reserved_tokens>0), charged_tokens bigint not null check(charged_tokens>=0),
 input_tokens bigint check(input_tokens>=0), output_tokens bigint check(output_tokens>=0),
 status text not null default 'reserved' check(status in ('reserved','success','failed','unknown')),
 day_start timestamptz not null, minute_start timestamptz not null,
 created_at timestamptz not null default now(), settled_at timestamptz,
 latency_ms bigint check(latency_ms>=0), estimated_cost numeric check(estimated_cost>=0),
 foreign key(workspace_id,brand_id) references public.brands(workspace_id,id) on delete restrict
);
create index ai_reservations_workspace_created on public.ai_reservations(workspace_id,created_at desc,id);
create index ai_reservations_unsettled on public.ai_reservations(created_at) where status='reserved';
alter table public.ai_budget_windows enable row level security;
alter table public.ai_reservations enable row level security;
-- No public/tenant read of global usage, prompts or other tenants; mutations only through service RPCs.
revoke all on public.ai_budget_windows,public.ai_reservations from public,anon,authenticated,service_role;
create function public.reserve_ai_budget(p_id uuid,p_workspace uuid,p_brand uuid,p_user uuid,p_trace uuid,
 p_provider text,p_model text,p_prompt text,p_tokens bigint,p_global_day_tokens bigint,p_workspace_day_tokens bigint,
 p_global_day_requests bigint,p_workspace_day_requests bigint,p_minute_tokens bigint,p_minute_requests bigint,p_workspace_minute_requests bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=clock_timestamp(); v_day timestamptz; v_minute timestamptz; v_scope text; v_row record;
begin
 if p_id is null or p_tokens is null or p_tokens<=0 or p_global_day_tokens is null or p_workspace_day_tokens is null
 or p_global_day_requests is null or p_workspace_day_requests is null or p_minute_tokens is null or p_minute_requests is null or p_workspace_minute_requests is null
 or least(p_global_day_tokens,p_workspace_day_tokens,p_global_day_requests,p_workspace_day_requests,p_minute_tokens,p_minute_requests,p_workspace_minute_requests)<=0
 or p_workspace_day_tokens>p_global_day_tokens or p_workspace_day_requests>p_global_day_requests then
  raise exception 'invalid_ai_budget' using errcode='22023'; end if;
 if not exists(select 1 from public.account_access a join public.workspace_members m on m.user_id=a.user_id
 join public.workspaces w on w.id=m.workspace_id
 join public.brands b on b.workspace_id=m.workspace_id where a.user_id=p_user and a.status='approved'
 and m.workspace_id=p_workspace and m.revoked_at is null and w.archived_at is null and b.id=p_brand and b.archived_at is null) then
  raise exception 'ai_scope_denied' using errcode='42501'; end if;
 -- Short critical section serializes global and tenant admission across all application instances.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('cadencepilot_ai_budget_v1'));
 if exists(select 1 from public.ai_reservations where id=p_id) then return false; end if;
 v_now:=clock_timestamp();
 v_day:=date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC';
 v_minute:=date_trunc('minute',v_now);v_scope:=p_workspace::text;
 insert into public.ai_budget_windows(scope,period,starts_at) values
 ('global','day',v_day),(v_scope,'day',v_day),('global','minute',v_minute),(v_scope,'minute',v_minute) on conflict do nothing;
 for v_row in select * from public.ai_budget_windows where scope in ('global',v_scope)
 and ((period='day' and starts_at=v_day)or(period='minute' and starts_at=v_minute)) loop
  if v_row.tokens+p_tokens>(case when v_row.period='minute' then p_minute_tokens when v_row.scope='global' then p_global_day_tokens else p_workspace_day_tokens end)
   or v_row.requests+1>(case when v_row.period='minute' then case when v_row.scope='global' then p_minute_requests else p_workspace_minute_requests end
   when v_row.scope='global' then p_global_day_requests else p_workspace_day_requests end) then return false;end if;
 end loop;
 update public.ai_budget_windows set tokens=tokens+p_tokens,requests=requests+1 where scope in ('global',v_scope)
 and ((period='day' and starts_at=v_day)or(period='minute' and starts_at=v_minute));
 insert into public.ai_reservations(id,workspace_id,brand_id,user_id,trace_id,provider,model,prompt_version,reserved_tokens,charged_tokens,day_start,minute_start)
 values(p_id,p_workspace,p_brand,p_user,p_trace,p_provider,p_model,p_prompt,p_tokens,p_tokens,v_day,v_minute);
 return true;
end;$$;
create function public.settle_ai_budget(p_id uuid,p_input bigint,p_output bigint,p_status text,p_latency bigint,p_cost numeric)
returns void language plpgsql security definer set search_path='' as $$
declare v public.ai_reservations; v_charge bigint;v_status text;
begin
 if p_status is null or p_status not in ('success','failed','unknown') or p_latency is null or p_latency<0 or p_input<0 or p_output<0
 or ((p_input is null)<>(p_output is null)) or p_cost<0 then raise exception 'invalid_ai_settlement' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('cadencepilot_ai_budget_v1'));
 select * into v from public.ai_reservations where id=p_id for update;
 if not found then raise exception 'ai_reservation_missing' using errcode='22023';end if;
 -- Settlements are idempotent. Unknown charges are never automatically released or expired.
 if v.settled_at is not null then return;end if;
 v_charge:=coalesce(p_input+p_output,v.reserved_tokens);
 v_status:=case when p_input is null then 'unknown' else p_status end;
 update public.ai_budget_windows set tokens=tokens-v.charged_tokens+v_charge
 where scope in ('global',v.workspace_id::text) and ((period='day' and starts_at=v.day_start)or(period='minute' and starts_at=v.minute_start));
 update public.ai_reservations set charged_tokens=v_charge,input_tokens=p_input,output_tokens=p_output,status=v_status,
 settled_at=clock_timestamp(),latency_ms=p_latency,estimated_cost=p_cost where id=p_id;
end;$$;
revoke all on function public.reserve_ai_budget(uuid,uuid,uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint) from public,anon,authenticated,service_role;
revoke all on function public.settle_ai_budget(uuid,bigint,bigint,text,bigint,numeric) from public,anon,authenticated,service_role;
grant execute on function public.reserve_ai_budget(uuid,uuid,uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint) to service_role;
grant execute on function public.settle_ai_budget(uuid,bigint,bigint,text,bigint,numeric) to service_role;
commit;
