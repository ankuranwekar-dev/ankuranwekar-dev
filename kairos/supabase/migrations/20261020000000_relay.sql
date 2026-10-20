-- Kairos relay: a mailbox for ciphertext.
--
-- Nothing in these tables is readable without keys that exist only on the two
-- phones. The server stores: an opaque mailbox id, the SHA-256 of a bearer
-- token, encrypted envelopes, and (optionally) push tokens. It never stores a
-- name, an email, a date of birth or a cycle.
--
-- Access: Row Level Security is enabled with NO policies, so the anon and
-- authenticated roles can do nothing. Only the relay Edge Function, using the
-- service role, touches these tables, and it checks the mailbox token first.

create table if not exists public.mailboxes (
  pair_id     text primary key check (char_length(pair_id) between 16 and 64),
  token_hash  text not null check (char_length(token_hash) = 43),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create table if not exists public.envelopes (
  id          bigint generated always as identity primary key,
  pair_id     text not null references public.mailboxes (pair_id) on delete cascade,
  sender      text not null check (sender in ('her', 'him')),
  type        text not null check (type in ('join', 'snapshot', 'signal', 'heart', 'revoke')),
  envelope    jsonb not null check (pg_column_size(envelope) <= 65536),
  created_at  timestamptz not null default now()
);

create index if not exists envelopes_pair_id_id on public.envelopes (pair_id, id);

create table if not exists public.push_tokens (
  pair_id     text not null references public.mailboxes (pair_id) on delete cascade,
  role        text not null check (role in ('her', 'him')),
  token       text not null check (char_length(token) <= 256),
  updated_at  timestamptz not null default now(),
  primary key (pair_id, role, token)
);

alter table public.mailboxes   enable row level security;
alter table public.envelopes   enable row level security;
alter table public.push_tokens enable row level security;

-- Belt and braces: even if a policy is added by mistake later, these roles
-- have no table privileges.
revoke all on public.mailboxes, public.envelopes, public.push_tokens from anon, authenticated;

-- Snapshots supersede each other: keep only the latest few per sender, so the
-- relay holds as little ciphertext as possible.
create or replace function public.prune_snapshots() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'snapshot' then
    delete from public.envelopes
     where pair_id = new.pair_id and sender = new.sender and type = 'snapshot'
       and id < (select min(id) from (
         select id from public.envelopes
          where pair_id = new.pair_id and sender = new.sender and type = 'snapshot'
          order by id desc limit 3) keep);
  end if;
  return new;
end $$;

drop trigger if exists prune_snapshots on public.envelopes;
create trigger prune_snapshots after insert on public.envelopes
  for each row execute function public.prune_snapshots();

-- Retention: envelopes older than 30 days and mailboxes idle for 90 days are
-- deleted. Schedule with pg_cron:
--   select cron.schedule('kairos-retention', '17 3 * * *', $$select public.kairos_retention()$$);
create or replace function public.kairos_retention() returns void
language sql security definer set search_path = public as $$
  delete from public.envelopes where created_at < now() - interval '30 days';
  delete from public.mailboxes where last_seen < now() - interval '90 days';
$$;

revoke all on function public.kairos_retention() from public, anon, authenticated;
revoke all on function public.prune_snapshots() from public, anon, authenticated;
