-- Core schema for Madro (Danish nutrition & grocery app).
-- Conventions:
--   * uuid primary keys, timestamptz created_at/updated_at
--   * money in øre (integer), weights in kg numeric, nutrients per 100 g
--   * user-owned rows carry user_id → auth.users(id) on delete cascade
--   * catalog tables are written only by the service role (see RLS migration)

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

create type public.calculation_sex as enum ('female', 'male', 'unspecified');
create type public.activity_level as enum ('sedentary', 'light', 'moderate', 'active', 'very_active');
create type public.primary_goal as enum ('fat_loss', 'maintenance', 'muscle_gain', 'recomposition');
create type public.diet_type as enum ('omnivore', 'pescetarian', 'vegetarian', 'vegan');
create type public.cooking_skill as enum ('beginner', 'intermediate', 'advanced');
create type public.food_state as enum ('raw', 'cooked', 'dried', 'canned_drained', 'as_sold');
create type public.data_confidence as enum ('high', 'medium', 'low');
create type public.quantity_unit as enum ('g', 'kg', 'ml', 'dl', 'l', 'tsk', 'spsk', 'stk');
create type public.meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type public.goal_source as enum ('estimate', 'user', 'adaptive');
create type public.price_type as enum ('shelf', 'online', 'promotional', 'manual');
create type public.price_status as enum ('live', 'stale', 'estimated', 'synthetic');
create type public.match_quality as enum ('exact', 'equivalent', 'substitute');
create type public.basket_mode as enum ('best_value', 'strict_budget');
create type public.recommendation_status as enum ('pending', 'accepted', 'rejected', 'superseded');
create type public.sync_status as enum ('queued', 'running', 'succeeded', 'failed', 'skipped');

-- ---------------------------------------------------------------------------
-- Algorithm registry
-- ---------------------------------------------------------------------------

create table public.algorithm_versions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  version text not null,
  description text not null,
  documentation_url text,
  created_at timestamptz not null default now(),
  unique (key, version)
);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  birth_year smallint check (birth_year between 1900 and 2100),
  sex_for_calculation public.calculation_sex,
  height_cm numeric(5, 1) check (height_cm between 120 and 230),
  activity_level public.activity_level,
  training_days_per_week smallint check (training_days_per_week between 0 and 14),
  primary_goal public.primary_goal,
  weekly_rate_percent numeric(4, 2) check (weekly_rate_percent between 0 and 1.5),
  goal_weight_kg numeric(5, 2) check (goal_weight_kg between 35 and 300),
  target_body_fat_percent numeric(4, 1) check (target_body_fat_percent between 3 and 60),
  diet public.diet_type not null default 'omnivore',
  allergens text[] not null default '{}',
  excluded_ingredients text[] not null default '{}',
  disliked_ingredients text[] not null default '{}',
  meals_per_day smallint not null default 3 check (meals_per_day between 2 and 5),
  max_cooking_minutes smallint check (max_cooking_minutes between 5 and 240),
  cooking_skill public.cooking_skill not null default 'intermediate',
  household_size smallint not null default 1 check (household_size between 1 and 12),
  weekly_budget_ore integer check (weekly_budget_ore between 0 and 10000000),
  postal_code text check (postal_code ~ '^[0-9]{4}$'),
  preferred_retailer_slugs text[] not null default '{}',
  allow_calorie_estimate boolean not null default true,
  timezone text not null default 'Europe/Copenhagen',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Admins are managed by the service role only, never via the profile.
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- Create the profile row when an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  energy_kcal integer not null check (energy_kcal between 800 and 6000),
  protein_g integer not null check (protein_g between 0 and 500),
  carbohydrate_g integer not null check (carbohydrate_g between 0 and 1000),
  fat_g integer not null check (fat_g between 0 and 400),
  source public.goal_source not null,
  bmr_kcal integer,
  tdee_kcal integer,
  tolerance_energy numeric(4, 3) not null default 0.07 check (tolerance_energy between 0.01 and 0.3),
  tolerance_protein_shortfall numeric(4, 3) not null default 0.1 check (tolerance_protein_shortfall between 0 and 0.5),
  tolerance_carbohydrate numeric(4, 3) not null default 0.25 check (tolerance_carbohydrate between 0.01 and 1),
  tolerance_fat numeric(4, 3) not null default 0.25 check (tolerance_fat between 0.01 and 1),
  algorithm_version_id uuid references public.algorithm_versions (id),
  calculation_notes jsonb not null default '[]',
  is_active boolean not null default true,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index nutrition_goals_one_active on public.nutrition_goals (user_id) where is_active;
create index nutrition_goals_user_idx on public.nutrition_goals (user_id, effective_from desc);
create trigger nutrition_goals_updated_at before update on public.nutrition_goals
  for each row execute function public.set_updated_at();

create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_at timestamptz not null,
  weight_kg numeric(5, 2) not null check (weight_kg between 30 and 350),
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index weight_entries_user_idx on public.weight_entries (user_id, measured_at desc);
create trigger weight_entries_updated_at before update on public.weight_entries
  for each row execute function public.set_updated_at();

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_at timestamptz not null,
  body_fat_percent numeric(4, 1) check (body_fat_percent between 2 and 70),
  waist_cm numeric(5, 1) check (waist_cm between 40 and 250),
  -- Path in the private "progress-photos" storage bucket, never a public URL.
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (body_fat_percent is not null or waist_cm is not null or photo_path is not null)
);
create index body_measurements_user_idx on public.body_measurements (user_id, measured_at desc);
create trigger body_measurements_updated_at before update on public.body_measurements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Nutrition catalog
-- ---------------------------------------------------------------------------

create table public.nutrition_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  url text,
  license text,
  attribution text,
  version text,
  retrieved_at timestamptz,
  -- 'verified' sources may be shown without a caveat; others carry a warning.
  verification_status text not null default 'unverified'
    check (verification_status in ('verified', 'unverified', 'development')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger nutrition_sources_updated_at before update on public.nutrition_sources
  for each row execute function public.set_updated_at();

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  canonical_name text not null,
  name_da text not null,
  synonyms text[] not null default '{}',
  category text not null,
  default_unit public.quantity_unit not null default 'g',
  density_g_per_ml numeric(6, 3) check (density_g_per_ml > 0),
  grams_per_piece numeric(7, 2) check (grams_per_piece > 0),
  cooked_yield_factor numeric(5, 2) check (cooked_yield_factor > 0),
  allergens text[] not null default '{}',
  diet_tags text[] not null default '{}',
  shelf_stable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ingredients_name_idx on public.ingredients using gin (to_tsvector('danish', name_da));
create trigger ingredients_updated_at before update on public.ingredients
  for each row execute function public.set_updated_at();

create table public.nutrition_facts (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  food_state public.food_state not null,
  source_id uuid not null references public.nutrition_sources (id),
  source_version text,
  source_food_code text,
  -- All values per 100 g edible portion. NULL = not provided by the source.
  energy_kcal numeric(7, 2) check (energy_kcal >= 0),
  protein_g numeric(6, 2) check (protein_g >= 0),
  carbohydrate_g numeric(6, 2) check (carbohydrate_g >= 0),
  fat_g numeric(6, 2) check (fat_g >= 0),
  fiber_g numeric(6, 2) check (fiber_g >= 0),
  sugars_g numeric(6, 2) check (sugars_g >= 0),
  saturated_fat_g numeric(6, 2) check (saturated_fat_g >= 0),
  salt_g numeric(6, 2) check (salt_g >= 0),
  confidence public.data_confidence not null,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ingredient_id, food_state, source_id)
);
create index nutrition_facts_ingredient_idx on public.nutrition_facts (ingredient_id);
create trigger nutrition_facts_updated_at before update on public.nutrition_facts
  for each row execute function public.set_updated_at();

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  -- NULL owner = shared catalog recipe; otherwise private to the owner.
  owner_id uuid references auth.users (id) on delete cascade,
  name_da text not null,
  description_da text not null default '',
  servings numeric(4, 1) not null check (servings > 0),
  prep_minutes smallint not null default 0 check (prep_minutes >= 0),
  cook_minutes smallint not null default 0 check (cook_minutes >= 0),
  meal_types public.meal_slot[] not null,
  instructions_da text[] not null default '{}',
  difficulty public.cooking_skill not null default 'beginner',
  origin text not null default 'curated' check (origin in ('curated', 'user', 'ai_suggested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(meal_types) > 0)
);
create index recipes_owner_idx on public.recipes (owner_id);
create trigger recipes_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  position smallint not null default 0,
  quantity numeric(8, 2) not null check (quantity > 0),
  unit public.quantity_unit not null,
  food_state public.food_state not null default 'raw',
  optional boolean not null default false,
  note_da text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);
create index recipe_ingredients_ingredient_idx on public.recipe_ingredients (ingredient_id);
create trigger recipe_ingredients_updated_at before update on public.recipe_ingredients
  for each row execute function public.set_updated_at();

create table public.recipe_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

-- ---------------------------------------------------------------------------
-- Meal planning
-- ---------------------------------------------------------------------------

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  seed integer not null,
  algorithm_version_id uuid references public.algorithm_versions (id),
  targets jsonb not null,
  validation jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index meal_plans_one_active_per_week on public.meal_plans (user_id, week_start) where status = 'active';
create trigger meal_plans_updated_at before update on public.meal_plans
  for each row execute function public.set_updated_at();

create table public.planned_meals (
  id uuid primary key default gen_random_uuid(),
  meal_plan_id uuid not null references public.meal_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  day_index smallint not null check (day_index between 0 and 6),
  slot public.meal_slot not null,
  slot_position smallint not null default 0,
  recipe_id uuid not null references public.recipes (id),
  servings numeric(4, 2) not null check (servings > 0),
  household_servings numeric(5, 2) not null check (household_servings > 0),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meal_plan_id, day_index, slot_position)
);
create index planned_meals_user_idx on public.planned_meals (user_id);
create trigger planned_meals_updated_at before update on public.planned_meals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Food diary
-- ---------------------------------------------------------------------------

create table public.food_diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  slot public.meal_slot,
  recipe_id uuid references public.recipes (id) on delete set null,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  planned_meal_id uuid references public.planned_meals (id) on delete set null,
  description text not null check (char_length(description) between 1 and 200),
  servings numeric(5, 2) check (servings > 0),
  grams numeric(7, 1) check (grams > 0),
  energy_kcal numeric(7, 1) not null check (energy_kcal >= 0),
  protein_g numeric(6, 1) not null default 0 check (protein_g >= 0),
  carbohydrate_g numeric(6, 1) not null default 0 check (carbohydrate_g >= 0),
  fat_g numeric(6, 1) not null default 0 check (fat_g >= 0),
  source text not null check (source in ('recipe', 'ingredient', 'manual', 'planned_meal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index food_diary_entries_user_date_idx on public.food_diary_entries (user_id, entry_date);
create trigger food_diary_entries_updated_at before update on public.food_diary_entries
  for each row execute function public.set_updated_at();

create table public.food_diary_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  marked_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);
create trigger food_diary_days_updated_at before update on public.food_diary_days
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Retail catalog and prices
-- ---------------------------------------------------------------------------

create table public.retailers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger retailers_updated_at before update on public.retailers
  for each row execute function public.set_updated_at();

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers (id) on delete cascade,
  name text not null,
  source_key text not null,
  external_id text not null,
  street text,
  postal_code text check (postal_code ~ '^[0-9]{4}$'),
  city text,
  latitude numeric(8, 5),
  longitude numeric(8, 5),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_key, external_id)
);
create index stores_retailer_idx on public.stores (retailer_id);
create index stores_postal_idx on public.stores (postal_code);
create trigger stores_updated_at before update on public.stores
  for each row execute function public.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers (id) on delete cascade,
  source_key text not null,
  external_id text not null,
  gtin text check (gtin ~ '^[0-9]{8,14}$'),
  name text not null,
  brand text,
  package_quantity numeric(9, 3) not null check (package_quantity > 0),
  package_unit public.quantity_unit not null,
  allergens text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (retailer_id, source_key, external_id)
);
create index products_retailer_idx on public.products (retailer_id);
create index products_gtin_idx on public.products (gtin);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.ingredient_product_matches (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quality public.match_quality not null,
  matched_by text not null check (matched_by in ('manual', 'rule', 'ai_reviewed')),
  confidence public.data_confidence not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ingredient_id, product_id)
);
create index ingredient_product_matches_product_idx on public.ingredient_product_matches (product_id);
create trigger ingredient_product_matches_updated_at before update on public.ingredient_product_matches
  for each row execute function public.set_updated_at();

create table public.data_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  job_type text not null,
  status public.sync_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  records_seen integer not null default 0,
  records_written integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index data_sync_jobs_provider_idx on public.data_sync_jobs (provider_key, created_at desc);
create trigger data_sync_jobs_updated_at before update on public.data_sync_jobs
  for each row execute function public.set_updated_at();

-- Price observations are append-only evidence. Corrections are new rows.
create table public.price_observations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  retailer_id uuid not null references public.retailers (id) on delete cascade,
  store_id uuid references public.stores (id) on delete cascade,
  price_ore integer not null check (price_ore > 0),
  price_type public.price_type not null,
  observed_at timestamptz not null,
  valid_from timestamptz,
  valid_to timestamptz,
  source_key text not null,
  confidence public.data_confidence not null,
  -- Development fixtures. Never shown as a real-world price.
  is_synthetic boolean not null default false,
  sync_job_id uuid references public.data_sync_jobs (id) on delete set null,
  -- Set for user-entered prices (price_type = 'manual'); private to that user.
  reported_by uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  check ((price_type = 'manual') = (reported_by is not null))
);
create index price_observations_lookup_idx on public.price_observations (product_id, retailer_id, observed_at desc);
create index price_observations_store_idx on public.price_observations (store_id);
create index price_observations_reporter_idx on public.price_observations (reported_by) where reported_by is not null;

create or replace function public.prevent_price_observation_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'price_observations are append-only; insert a new observation instead';
end;
$$;
create trigger price_observations_immutable before update on public.price_observations
  for each row execute function public.prevent_price_observation_update();

-- Offer-catalog entries that may not (yet) be resolved to a product.
create table public.promotional_offers (
  id uuid primary key default gen_random_uuid(),
  retailer_id uuid not null references public.retailers (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  source_key text not null,
  external_id text not null,
  title text not null,
  description text,
  price_ore integer not null check (price_ore > 0),
  regular_price_ore integer check (regular_price_ore > 0),
  package_quantity numeric(9, 3),
  package_unit public.quantity_unit,
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  store_ids uuid[],
  sync_job_id uuid references public.data_sync_jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_key, external_id),
  check (valid_to >= valid_from)
);
create index promotional_offers_valid_idx on public.promotional_offers (retailer_id, valid_to);
create trigger promotional_offers_updated_at before update on public.promotional_offers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Pantry, baskets and shopping lists
-- ---------------------------------------------------------------------------

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  quantity numeric(9, 2) not null check (quantity >= 0),
  unit public.quantity_unit not null,
  confirmed_at timestamptz not null default now(),
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ingredient_id, unit)
);
create trigger pantry_items_updated_at before update on public.pantry_items
  for each row execute function public.set_updated_at();

create table public.shopping_baskets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_plan_id uuid not null references public.meal_plans (id) on delete cascade,
  store_id uuid references public.stores (id) on delete set null,
  mode public.basket_mode not null,
  budget_ore integer,
  checkout_total_ore integer,
  algorithm_version_id uuid references public.algorithm_versions (id),
  -- Explanation, per-store comparison and data-status summary at calculation time.
  result jsonb not null,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index shopping_baskets_user_idx on public.shopping_baskets (user_id, calculated_at desc);

create table public.shopping_basket_items (
  id uuid primary key default gen_random_uuid(),
  basket_id uuid not null references public.shopping_baskets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  product_id uuid references public.products (id) on delete set null,
  required boolean not null,
  required_quantity numeric(10, 2) not null,
  quantity_dimension text not null check (quantity_dimension in ('mass', 'volume', 'count')),
  packages integer check (packages >= 0),
  unit_price_ore integer,
  line_cost_ore integer,
  price_observation_id uuid references public.price_observations (id) on delete set null,
  price_status public.price_status,
  match_quality public.match_quality,
  unmatched_reason text,
  created_at timestamptz not null default now()
);
create index shopping_basket_items_basket_idx on public.shopping_basket_items (basket_id);

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_plan_id uuid references public.meal_plans (id) on delete set null,
  basket_id uuid references public.shopping_baskets (id) on delete set null,
  store_id uuid references public.stores (id) on delete set null,
  title text not null,
  budget_ore integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shopping_lists_user_idx on public.shopping_lists (user_id, created_at desc);
create trigger shopping_lists_updated_at before update on public.shopping_lists
  for each row execute function public.set_updated_at();

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  label text not null,
  category text not null default 'andet',
  required_quantity_text text,
  packages integer not null default 1 check (packages >= 0),
  package_text text,
  unit_price_ore integer,
  price_status public.price_status,
  price_type public.price_type,
  price_observed_at timestamptz,
  offer_valid_to timestamptz,
  required boolean not null default true,
  unmatched boolean not null default false,
  checked boolean not null default false,
  removed boolean not null default false,
  added_manually boolean not null default false,
  -- What the user actually paid, if they confirm it. Never inferred from "checked".
  purchased_price_ore integer check (purchased_price_ore >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shopping_list_items_list_idx on public.shopping_list_items (list_id, position);
create trigger shopping_list_items_updated_at before update on public.shopping_list_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Adaptive recommendations
-- ---------------------------------------------------------------------------

create table public.calorie_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  algorithm_version_id uuid not null references public.algorithm_versions (id),
  decision text not null check (decision in ('adjust', 'keep')),
  previous_target_kcal integer not null,
  recommended_target_kcal integer not null,
  observed_tdee_kcal integer,
  blended_tdee_kcal integer,
  trend_kg_per_week numeric(5, 3),
  quality jsonb not null,
  explanation text[] not null,
  status public.recommendation_status not null default 'pending',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calorie_recommendations_user_idx on public.calorie_recommendations (user_id, created_at desc);
create trigger calorie_recommendations_updated_at before update on public.calorie_recommendations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window per user and action)
-- ---------------------------------------------------------------------------

create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_idx on public.rate_limit_events (user_id, action, created_at desc);

-- Returns true and records the event when the caller is under the limit.
create or replace function public.consume_rate_limit(p_action text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    return false;
  end if;
  select count(*) into v_count from public.rate_limit_events
   where user_id = v_user and action = p_action
     and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return false;
  end if;
  insert into public.rate_limit_events (user_id, action) values (v_user, p_action);
  delete from public.rate_limit_events
   where user_id = v_user and action = p_action and created_at < now() - interval '1 day';
  return true;
end;
$$;
