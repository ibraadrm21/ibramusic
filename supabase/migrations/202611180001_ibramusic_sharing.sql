-- Existing app tables and auth.users are provided by the IbraMusic project.
alter table public.user_sync enable row level security;
create policy ibramusic_sync_owner_guard on public.user_sync as restrictive for all to public
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy ibramusic_sync_owner_access on public.user_sync for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

alter table public.public_playlists enable row level security;
create policy ibramusic_legacy_playlist_read on public.public_playlists for select to anon, authenticated using (true);
create policy ibramusic_legacy_playlist_create on public.public_playlists as restrictive for insert to public
  with check ((select auth.uid()) = user_id);
create policy ibramusic_legacy_playlist_edit on public.public_playlists as restrictive for update to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ibramusic_legacy_playlist_delete on public.public_playlists as restrictive for delete to public
  using ((select auth.uid()) = user_id);
create policy ibramusic_legacy_playlist_owner on public.public_playlists for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.user_monthly_stats enable row level security;
create policy ibramusic_ranking_read on public.user_monthly_stats for select to anon, authenticated using (true);
create policy ibramusic_ranking_create on public.user_monthly_stats as restrictive for insert to public
  with check ((select auth.uid()) = user_id);
create policy ibramusic_ranking_edit on public.user_monthly_stats as restrictive for update to public
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ibramusic_ranking_delete on public.user_monthly_stats as restrictive for delete to public
  using ((select auth.uid()) = user_id);
create policy ibramusic_ranking_owner on public.user_monthly_stats for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.featured_content enable row level security;
create policy ibramusic_featured_read on public.featured_content for select to anon, authenticated using (true);
create policy ibramusic_featured_insert_guard on public.featured_content as restrictive for insert to public
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'ibramusic_admin') = 'true');
create policy ibramusic_featured_update_guard on public.featured_content as restrictive for update to public
  using (((select auth.jwt()) -> 'app_metadata' ->> 'ibramusic_admin') = 'true')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'ibramusic_admin') = 'true');
create policy ibramusic_featured_delete_guard on public.featured_content as restrictive for delete to public
  using (((select auth.jwt()) -> 'app_metadata' ->> 'ibramusic_admin') = 'true');
create policy ibramusic_featured_admin on public.featured_content for all to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'ibramusic_admin') = 'true')
  with check (((select auth.jwt()) -> 'app_metadata' ->> 'ibramusic_admin') = 'true');

create table public.ibramusic_playlist_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  playlist_id text not null check (length(playlist_id) between 1 and 300),
  name text not null check (length(name) between 1 and 200),
  tracks jsonb not null default '[]'::jsonb check (jsonb_typeof(tracks) = 'array' and octet_length(tracks::text) < 4 * 1024 * 1024),
  cover_url text not null default '',
  visibility text not null check (visibility in ('private', 'link', 'public')),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  modified_by uuid default auth.uid() references auth.users on delete set null,
  unique (owner_id, playlist_id)
);

create table public.ibramusic_playlist_editors (
  share_id uuid references public.ibramusic_playlist_shares on delete cascade,
  user_id uuid references auth.users on delete cascade,
  added_at timestamptz not null default now(),
  primary key (share_id, user_id)
);

alter table public.ibramusic_playlist_shares enable row level security;
alter table public.ibramusic_playlist_editors enable row level security;

create policy ibramusic_playlist_owner_access on public.ibramusic_playlist_shares for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create function public.ibramusic_search_shares(query_text text)
returns table (id uuid, name text, cover_url text, tracks jsonb)
language sql stable security definer set search_path = ''
as $$
  select share.id, share.name, share.cover_url, share.tracks
  from public.ibramusic_playlist_shares share
  where share.visibility = 'public' and length(trim(query_text)) > 0
    and strpos(lower(share.name), lower(trim(query_text))) > 0
  order by share.updated_at desc
  limit 20
$$;
revoke all on function public.ibramusic_search_shares(text) from public;
grant execute on function public.ibramusic_search_shares(text) to anon, authenticated;

create function public.ibramusic_read_share(token uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', share.id, 'name', share.name, 'tracks', share.tracks, 'cover_url', share.cover_url, 'revision', share.revision,
    'is_owner', share.owner_id = auth.uid(),
    'can_edit', share.owner_id = auth.uid() or editor.user_id is not null,
    'modified_by', case when share.owner_id = auth.uid() or editor.user_id is not null then share.modified_by else null end
  )
  from public.ibramusic_playlist_shares share
  left join public.ibramusic_playlist_editors editor on editor.share_id = share.id and editor.user_id = auth.uid()
  where share.id = token and (share.visibility in ('link', 'public') or share.owner_id = auth.uid() or editor.user_id is not null)
$$;
revoke all on function public.ibramusic_read_share(uuid) from public;
grant execute on function public.ibramusic_read_share(uuid) to anon, authenticated;

create function public.ibramusic_edit_share(token uuid, expected_revision integer, next_name text, next_tracks jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare next_revision integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.ibramusic_playlist_shares share
  set name = trim(next_name), tracks = next_tracks, revision = share.revision + 1, modified_by = auth.uid(), updated_at = now()
  where share.id = token and share.revision = expected_revision and (
    share.owner_id = auth.uid() or exists (
      select 1 from public.ibramusic_playlist_editors editor where editor.share_id = token and editor.user_id = auth.uid()
    )
  )
  returning revision into next_revision;
  if next_revision is null then raise exception 'Unable to edit this revision'; end if;
  return next_revision;
end
$$;
revoke all on function public.ibramusic_edit_share(uuid, integer, text, jsonb) from public;
grant execute on function public.ibramusic_edit_share(uuid, integer, text, jsonb) to authenticated;

create function public.ibramusic_manage_editor(token uuid, email_address text, allow_access boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare member uuid;
begin
  if not exists (select 1 from public.ibramusic_playlist_shares where id = token and owner_id = auth.uid()) then
    raise exception 'Only the owner manages editors';
  end if;
  select id into member from auth.users where lower(email) = lower(trim(email_address)) and email_confirmed_at is not null;
  if member is null then raise exception 'No verified account for that email'; end if;
  if allow_access then
    insert into public.ibramusic_playlist_editors (share_id, user_id) values (token, member) on conflict do nothing;
  else
    delete from public.ibramusic_playlist_editors where share_id = token and user_id = member;
  end if;
end
$$;
revoke all on function public.ibramusic_manage_editor(uuid, text, boolean) from public;
grant execute on function public.ibramusic_manage_editor(uuid, text, boolean) to authenticated;

create function public.ibramusic_delete_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare account_id uuid := auth.uid();
begin
  if account_id is null then raise exception 'Authentication required'; end if;
  delete from public.user_sync where id = account_id;
  delete from public.user_monthly_stats where user_id = account_id;
  delete from public.public_playlists where user_id = account_id;
  delete from auth.users where id = account_id;
end
$$;
revoke all on function public.ibramusic_delete_account() from public;
grant execute on function public.ibramusic_delete_account() to authenticated;
