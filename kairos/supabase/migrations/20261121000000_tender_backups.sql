-- Tender backup: one sealed blob per Apple account.
--
-- Names are prefixed `tender_` because this may share a Supabase project with other apps; nothing here touches their
-- tables, and nothing of theirs is reachable from here.
--
-- The blob is encrypted on the phone with a key that exists only on the person's own devices (and on a piece of
-- paper, if they wrote down the recovery code). The server cannot read it. The account is a keyed hash of the Apple
-- identifier, not the identifier itself, and there is no name, email, date or cycle anywhere in this table.
--
-- Access: Row Level Security is enabled with NO policies and the API roles have no privileges, so the only way in is
-- the `backup` Edge Function, which uses the service role after verifying a Sign in with Apple token.

create table if not exists public.tender_backups (
  user_hash   text primary key check (char_length(user_hash) = 43),
  blob        text not null check (char_length(blob) between 40 and 262144),
  version     integer not null default 1 check (version >= 1),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.tender_backups enable row level security;
revoke all on public.tender_backups from anon, authenticated;

-- The pepper that keys the hash of Apple identifiers lives in Supabase Vault, encrypted with a key that is not in this
-- database, so a copy of the tables (or even of the whole database) cannot be used to match a row to an Apple id.
-- It is made here, once, and read only by the Edge Function (service role) through the function below.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tender_backup_pepper') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(48), 'hex'),
      'tender_backup_pepper',
      'Keys the hash of Apple account ids in public.tender_backups'
    );
  end if;
end $$;

create or replace function public.tender_backup_pepper() returns text
language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'tender_backup_pepper' limit 1
$$;

revoke all on function public.tender_backup_pepper() from public, anon, authenticated;
grant execute on function public.tender_backup_pepper() to service_role;
