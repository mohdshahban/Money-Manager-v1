-- Project material inventory and room/furniture usage tracking.
-- Finance transactions remain unchanged; purchases may reference them read-only.

create table if not exists public.material_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit text not null default 'pcs',
  category text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_material_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  material_item_id uuid not null references public.material_items(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  purchased_at timestamptz not null default now(),
  source_transaction_id uuid references public.transactions(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_material_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_material_work_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  area_id uuid not null references public.project_material_areas(id) on delete cascade,
  name text not null,
  dimensions text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_material_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  area_id uuid not null references public.project_material_areas(id) on delete cascade,
  work_item_id uuid references public.project_material_work_items(id) on delete set null,
  material_item_id uuid not null references public.material_items(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  used_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists material_items_user_idx on public.material_items(user_id);
create index if not exists project_material_purchases_project_idx on public.project_material_purchases(project_id);
create index if not exists project_material_purchases_item_idx on public.project_material_purchases(material_item_id);
create index if not exists project_material_areas_project_idx on public.project_material_areas(project_id);
create index if not exists project_material_work_items_project_idx on public.project_material_work_items(project_id);
create index if not exists project_material_work_items_area_idx on public.project_material_work_items(area_id);
create index if not exists project_material_usage_project_idx on public.project_material_usage(project_id);
create index if not exists project_material_usage_item_idx on public.project_material_usage(material_item_id);
create index if not exists project_material_usage_area_idx on public.project_material_usage(area_id);

alter table public.material_items enable row level security;
alter table public.project_material_purchases enable row level security;
alter table public.project_material_areas enable row level security;
alter table public.project_material_work_items enable row level security;
alter table public.project_material_usage enable row level security;

drop policy if exists "own material items" on public.material_items;
create policy "own material items" on public.material_items for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own project material purchases" on public.project_material_purchases;
create policy "own project material purchases" on public.project_material_purchases for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own project material areas" on public.project_material_areas;
create policy "own project material areas" on public.project_material_areas for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own project material work items" on public.project_material_work_items;
create policy "own project material work items" on public.project_material_work_items for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own project material usage" on public.project_material_usage;
create policy "own project material usage" on public.project_material_usage for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.material_items, public.project_material_purchases,
  public.project_material_areas, public.project_material_work_items, public.project_material_usage to authenticated;
grant all on public.material_items, public.project_material_purchases,
  public.project_material_areas, public.project_material_work_items, public.project_material_usage to service_role;

drop trigger if exists material_items_updated on public.material_items;
create trigger material_items_updated before update on public.material_items
  for each row execute function public.set_updated_at();
drop trigger if exists project_material_purchases_updated on public.project_material_purchases;
create trigger project_material_purchases_updated before update on public.project_material_purchases
  for each row execute function public.set_updated_at();
drop trigger if exists project_material_areas_updated on public.project_material_areas;
create trigger project_material_areas_updated before update on public.project_material_areas
  for each row execute function public.set_updated_at();
drop trigger if exists project_material_work_items_updated on public.project_material_work_items;
create trigger project_material_work_items_updated before update on public.project_material_work_items
  for each row execute function public.set_updated_at();
drop trigger if exists project_material_usage_updated on public.project_material_usage;
create trigger project_material_usage_updated before update on public.project_material_usage
  for each row execute function public.set_updated_at();
