-- Meal planner 1.3.0: aims the week at the weekly budget.
insert into public.algorithm_versions (key, version, description, documentation_url) values
  ('meal-planner', '1.3.0', 'As 1.2.0, plus a week-level swap search that moves the cost of the shopping basket (whole packages, pantry subtracted) as close to the weekly budget as possible without going over, as long as no day gets worse on nutrition. Unknown recipe prices count as expensive.', 'docs/ARCHITECTURE.md#meal-planner')
on conflict (key, version) do nothing;
