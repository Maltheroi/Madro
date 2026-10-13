-- Cuisine tags on recipes, dish wishes on profiles, and meal planner 1.2.0
-- (favourite dishes and their cuisines weigh more in the plan).

alter table public.recipes
  add column if not exists cuisines text[] not null default '{}'
  check (cuisines <@ array['fitness', 'thai', 'asiatisk', 'dansk', 'italiensk', 'mexicansk']::text[]);
create index if not exists recipes_cuisines_idx on public.recipes using gin (cuisines);

-- Dishes the user likes that are not in the catalogue yet (free text, private).
alter table public.profiles
  add column if not exists dish_wishes text[] not null default '{}'
  check (cardinality(dish_wishes) <= 10);

insert into public.algorithm_versions (key, version, description, documentation_url) values
  ('meal-planner', '1.2.0', 'As 1.1.0, plus a stronger preference for favourite recipes and a small preference for recipes that share a cuisine with them.', 'docs/ARCHITECTURE.md#meal-planner')
on conflict (key, version) do nothing;
