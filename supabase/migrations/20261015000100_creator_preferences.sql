-- Feature 05: creator-level questionnaire drafts. Client writes cannot select another user.
create table public.creator_preferences (
  user_id uuid primary key references auth.users(id) on delete restrict,
  settings jsonb not null check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 16384),
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.creator_preferences enable row level security;
revoke all on public.creator_preferences from public,anon,authenticated;
grant select on public.creator_preferences to authenticated;
grant insert(user_id,settings) on public.creator_preferences to authenticated;
grant update(settings) on public.creator_preferences to authenticated;
create policy creator_preferences_select on public.creator_preferences for select to authenticated
  using(user_id=auth.uid() and public.is_approved_account());
create policy creator_preferences_insert on public.creator_preferences for insert to authenticated
  with check(user_id=auth.uid() and public.is_approved_account());
create policy creator_preferences_update on public.creator_preferences for update to authenticated
  using(user_id=auth.uid() and public.is_approved_account())
  with check(user_id=auth.uid() and public.is_approved_account());
create function public.creator_preferences_before_update() returns trigger
  language plpgsql set search_path='' as $$
begin
  if new.user_id<>old.user_id then raise exception 'preference_owner_immutable' using errcode='42501'; end if;
  new.revision=old.revision+1;
  new.updated_at=now();
  return new;
end;
$$;
create trigger creator_preferences_before_update before update on public.creator_preferences
  for each row execute function public.creator_preferences_before_update();
revoke all on function public.creator_preferences_before_update() from public,anon,authenticated,service_role;
