-- Project-specific team/vendor register with optional contract amount.
-- Existing labour transactions are backfilled into project team members and linked.

create table if not exists public.project_team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  trade text not null default 'Labour',
  contract_amount numeric(14,2) not null default 0,
  phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_team_members_project_idx on public.project_team_members(project_id);
create index if not exists project_team_members_user_idx on public.project_team_members(user_id);
create unique index if not exists project_team_members_identity_idx
  on public.project_team_members(project_id, lower(name), lower(trade));

alter table public.project_team_members enable row level security;
drop policy if exists "own project team members" on public.project_team_members;
create policy "own project team members" on public.project_team_members for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.project_team_members to authenticated;
grant all on public.project_team_members to service_role;

drop trigger if exists project_team_members_updated on public.project_team_members;
create trigger project_team_members_updated before update on public.project_team_members
  for each row execute function public.set_updated_at();

alter table public.transactions
  add column if not exists team_member_id uuid references public.project_team_members(id) on delete set null;

create index if not exists transactions_team_member_idx on public.transactions(team_member_id);

with labour_rows as (
  select distinct
    t.user_id,
    t.project_id,
    case
      when pc.name ~* '^labou?r$' and c.name ~ '^(.+)\s*\(([^)]+)\)\s*$'
        then trim(regexp_replace(c.name, '^(.+)\s*\(([^)]+)\)\s*$', '\1'))
      when pc.name ~* '^labou?r$' then trim(c.name)
      when c.name ~* '^labou?r$' and nullif(trim(t.vendor), '') is not null then trim(t.vendor)
      else null
    end as member_name,
    case
      when pc.name ~* '^labou?r$' and c.name ~ '^(.+)\s*\(([^)]+)\)\s*$'
        then trim(regexp_replace(c.name, '^(.+)\s*\(([^)]+)\)\s*$', '\2'))
      when pc.name ~* '^labou?r$' then 'Labour'
      when c.name ~* '^labou?r$' and nullif(trim(t.vendor), '') is not null then 'Labour'
      else null
    end as trade
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  left join public.categories pc on pc.id = c.parent_id
  where t.type = 'expense'
    and t.deleted_at is null
    and t.project_id is not null
)
insert into public.project_team_members (user_id, project_id, name, trade)
select user_id, project_id, member_name, trade
from labour_rows
where member_name is not null and trade is not null
on conflict do nothing;

with tx_identity as (
  select
    t.id as transaction_id,
    t.project_id,
    case
      when pc.name ~* '^labou?r$' and c.name ~ '^(.+)\s*\(([^)]+)\)\s*$'
        then trim(regexp_replace(c.name, '^(.+)\s*\(([^)]+)\)\s*$', '\1'))
      when pc.name ~* '^labou?r$' then trim(c.name)
      when c.name ~* '^labou?r$' and nullif(trim(t.vendor), '') is not null then trim(t.vendor)
      else null
    end as member_name,
    case
      when pc.name ~* '^labou?r$' and c.name ~ '^(.+)\s*\(([^)]+)\)\s*$'
        then trim(regexp_replace(c.name, '^(.+)\s*\(([^)]+)\)\s*$', '\2'))
      when pc.name ~* '^labou?r$' then 'Labour'
      when c.name ~* '^labou?r$' and nullif(trim(t.vendor), '') is not null then 'Labour'
      else null
    end as trade
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  left join public.categories pc on pc.id = c.parent_id
  where t.type = 'expense'
    and t.deleted_at is null
    and t.project_id is not null
    and t.team_member_id is null
)
update public.transactions t
set team_member_id = m.id
from tx_identity x
join public.project_team_members m
  on m.project_id = x.project_id
 and lower(m.name) = lower(x.member_name)
 and lower(m.trade) = lower(x.trade)
where t.id = x.transaction_id
  and x.member_name is not null
  and x.trade is not null;
