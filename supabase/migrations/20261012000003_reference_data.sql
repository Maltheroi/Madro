-- Reference data that every environment needs (not development fixtures).

insert into public.algorithm_versions (key, version, description, documentation_url) values
  ('initial-targets', '1.0.0', 'Mifflin-St Jeor BMR × activity factor, goal adjustment from weekly rate (7 700 kcal/kg) with deficit/surplus caps and a calorie floor; protein from g/kg of a BMI-27-capped reference weight, fat 27 % of energy (≥ 0.6 g/kg), carbohydrate remainder.', 'docs/ARCHITECTURE.md#nutrition-engine'),
  ('meal-planner', '1.0.0', 'Deterministic seeded candidate ranking with portion scaling (0.5–2 servings) and bounded swap search; hard allergy/diet filters; tolerance validation.', 'docs/ARCHITECTURE.md#meal-planner'),
  ('basket-optimizer', '1.0.0', 'Per-store exhaustive choice among matched products with ceil(q/p) packages; single-store comparison; best-value (cost + 0.5 × perishable waste + substitution penalty) or strict-budget mode.', 'docs/ARCHITECTURE.md#basket-optimizer'),
  ('adaptive-energy', '1.0.0', 'Energy balance over a 21-day window: intake − slope × 7 700; requires ≥ 14-day span, ≥ 8 weigh-in days, ≥ 80 % complete logs; blended with prior; ±150 kcal cap; 7-day minimum interval.', 'docs/ARCHITECTURE.md#adaptive-calorie-algorithm')
on conflict (key, version) do nothing;

insert into public.retailers (slug, name) values
  ('rema-1000', 'REMA 1000'),
  ('netto', 'Netto'),
  ('foetex', 'føtex'),
  ('bilka', 'Bilka'),
  ('lidl', 'Lidl'),
  ('coop-365', 'Coop 365discount'),
  ('superbrugsen', 'SuperBrugsen'),
  ('kvickly', 'Kvickly')
on conflict (slug) do nothing;

insert into public.nutrition_sources (key, name, url, license, attribution, version, verification_status, notes) values
  ('frida', 'Frida – DTU Fødevareinstituttet', 'https://frida.fooddata.dk/', 'Unverified – written confirmation requested from DTU', 'Fødevaredatabanken Frida, DTU Fødevareinstituttet', '5.5', 'unverified',
   'Not imported yet. License and commercial-use terms must be confirmed before import (docs/DATA_SOURCES.md).'),
  ('open-food-facts', 'Open Food Facts', 'https://world.openfoodfacts.org/', 'ODbL 1.0 (database), DbCL (contents), CC BY-SA (images)', 'Data from Open Food Facts (openfoodfacts.org), ODbL', null, 'unverified',
   'Crowdsourced branded-product data. Stored separately from proprietary data to avoid ODbL derivative-database obligations.'),
  ('user-entered', 'Indtastet af bruger', null, null, null, null, 'unverified', 'Values typed in by a user for their own food diary.')
on conflict (key) do nothing;
