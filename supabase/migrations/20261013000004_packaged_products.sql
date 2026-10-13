-- Packaged products looked up by barcode or name (food logging).
--
-- Rows from Open Food Facts (source_key 'open-food-facts') are kept in this
-- separate table so the ODbL-licensed data stays separable from the internal
-- catalogue and from any licensed price data (see docs/DATA_SOURCES.md). They
-- are written only by the service role (lookup cache and import job).
-- Users can add their own products (source_key 'user'), visible only to them.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
grant usage on schema extensions to authenticated, service_role;

create table public.packaged_products (
  id uuid primary key default gen_random_uuid(),
  source_key text not null check (source_key in ('open-food-facts', 'user')),
  code text not null check (char_length(code) between 1 and 40),
  gtin text check (gtin ~ '^\d{8,14}$'),
  name text not null check (char_length(name) between 1 and 200),
  brand text check (char_length(brand) <= 120),
  package_quantity numeric(9, 2) check (package_quantity > 0),
  package_unit public.quantity_unit,
  allergens text[] not null default '{}',
  traces text[] not null default '{}',
  -- Nutrition per 100 g (or 100 ml) as sold. Null means unknown, never zero.
  energy_kcal numeric(7, 1) check (energy_kcal >= 0),
  protein_g numeric(6, 2) check (protein_g >= 0),
  carbohydrate_g numeric(6, 2) check (carbohydrate_g >= 0),
  sugars_g numeric(6, 2) check (sugars_g >= 0),
  fat_g numeric(6, 2) check (fat_g >= 0),
  saturated_fat_g numeric(6, 2) check (saturated_fat_g >= 0),
  fiber_g numeric(6, 2) check (fiber_g >= 0),
  salt_g numeric(6, 2) check (salt_g >= 0),
  data_quality text not null check (data_quality in ('complete', 'partial', 'minimal')),
  licence text,
  source_url text,
  created_by uuid references auth.users (id) on delete cascade,
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Provider rows are shared; user rows belong to exactly one user.
  check ((source_key = 'user') = (created_by is not null))
);

create unique index packaged_products_provider_code on public.packaged_products (source_key, code)
  where created_by is null;
create unique index packaged_products_user_code on public.packaged_products (created_by, code)
  where created_by is not null;
create index packaged_products_gtin_idx on public.packaged_products (gtin);
create index packaged_products_search_idx on public.packaged_products
  using gin ((lower(name || ' ' || coalesce(brand, ''))) extensions.gin_trgm_ops);
create trigger packaged_products_updated_at before update on public.packaged_products
  for each row execute function public.set_updated_at();

alter table public.packaged_products enable row level security;
revoke all on public.packaged_products from anon;

create policy packaged_products_select on public.packaged_products for select to authenticated
  using (created_by is null or created_by = (select auth.uid()));
create policy packaged_products_insert_own on public.packaged_products for insert to authenticated
  with check (source_key = 'user' and created_by = (select auth.uid()));
create policy packaged_products_update_own on public.packaged_products for update to authenticated
  using (created_by = (select auth.uid()))
  with check (source_key = 'user' and created_by = (select auth.uid()));
create policy packaged_products_delete_own on public.packaged_products for delete to authenticated
  using (created_by = (select auth.uid()));

-- Diary entries can reference a packaged product.
alter table public.food_diary_entries
  add column product_id uuid references public.packaged_products (id) on delete set null;
alter table public.food_diary_entries drop constraint food_diary_entries_source_check;
alter table public.food_diary_entries add constraint food_diary_entries_source_check
  check (source in ('recipe', 'ingredient', 'manual', 'planned_meal', 'product'));
