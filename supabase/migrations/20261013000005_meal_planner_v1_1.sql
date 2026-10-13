-- Meal planner 1.1.0: portions up to 3 servings and protein-aware portion scaling.
insert into public.algorithm_versions (key, version, description, documentation_url) values
  ('meal-planner', '1.1.0', 'As 1.0.0, but portions scale 0.5–3 servings and each 0.25-serving step is chosen to reduce the day''s deviation from all targets (energy, protein shortfall, carbohydrate, fat), not energy alone.', 'docs/ARCHITECTURE.md#meal-planner')
on conflict (key, version) do nothing;
