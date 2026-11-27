-- Keep the previous backup, so an overwrite can always be undone.
--
-- A bug once backed up an emptied phone over a good backup. Each write now moves the backup it replaces into
-- `previous_blob`, and all writes go through one function so that happens atomically with the version check.

alter table public.tender_backups
  add column if not exists previous_blob text check (previous_blob is null or char_length(previous_blob) <= 262144),
  add column if not exists previous_at timestamptz;

create or replace function public.tender_backup_put(p_user text, p_blob text, p_expected integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.tender_backups;
begin
  if p_expected = 0 then
    insert into public.tender_backups (user_hash, blob, version)
    values (p_user, p_blob, 1)
    on conflict (user_hash) do nothing
    returning * into r;
  else
    -- Each write keeps the one before it, so a bad overwrite can always be undone.
    update public.tender_backups t
       set previous_blob = t.blob,
           previous_at   = t.updated_at,
           blob          = p_blob,
           version       = t.version + 1,
           updated_at    = now()
     where t.user_hash = p_user and t.version = p_expected
    returning t.* into r;
  end if;
  if r.user_hash is null then
    return null;
  end if;
  return jsonb_build_object('blob', r.blob, 'version', r.version, 'updated_at', r.updated_at);
end;
$$;

revoke all on function public.tender_backup_put(text, text, integer) from public, anon, authenticated;
grant execute on function public.tender_backup_put(text, text, integer) to service_role;
