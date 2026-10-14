-- Weekly food cost: long-lasting goods count for the share used.
insert into public.algorithm_versions (key, version, description, documentation_url) values
  ('meal-planner', '1.4.0', 'As 1.3.0, but the budget is compared with the weekly food cost (long-lasting goods count for the share used, perishables as whole packages), candidates are ranked by price per kcal against the budget, the budget search can also shift quarter servings between meals, and an out-of-reach budget restarts from fixed seeds so the cheapest plan is stable.', 'docs/ARCHITECTURE.md#meal-planner'),
  ('basket-optimizer', '1.1.0', 'As 1.0.0, but each basket reports a weekly cost (what the plan uses plus likely waste of perishables), and the budget is compared with it instead of the checkout total.', 'docs/ARCHITECTURE.md#basket-optimizer')
on conflict (key, version) do nothing;
