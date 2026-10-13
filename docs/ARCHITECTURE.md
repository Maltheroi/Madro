# Architecture

Madro is a mobile-first Danish nutrition and grocery app. Users get calorie and macro targets, a 7-day meal plan that respects allergies and diet, a shopping list priced per store, weight tracking, and an adaptive calorie target.

## Stack

| Layer | Choice |
|---|---|
| Web | Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, shadcn-style components on Radix |
| Forms and validation | React Hook Form + Zod (the same schema runs on client and server) |
| Charts | Recharts |
| Auth | Supabase Auth (GoTrue) through `@supabase/ssr`; sessions are verified with `getClaims()` |
| Database | Postgres (Supabase) with row level security on every table; migrations in `supabase/migrations` |
| Tests | Vitest (domain + provider parsing), Vitest against a throwaway Postgres (RLS), Playwright (mobile + desktop) |

Next.js 16 notes: middleware is now `src/proxy.ts` (exported `proxy`). `cacheComponents` is off on purpose because almost every page is per-user.

## Layout

```
src/
  app/                    routes (Danish URLs); (app)/ is the signed-in group
  components/             UI primitives and shared widgets (data-badges shows price/data status)
  features/<feature>/
    domain/               pure, deterministic, unit-tested logic (no I/O)
    actions.ts            server actions: auth check → Zod parse → service call
    *.tsx                 client components for that feature
  server/
    auth.ts               getSessionUser / requireUser
    repositories/         small typed queries
    services/             use cases (meal plan, diary, weight, shopping, account, catalog)
    providers/            external data source contracts and adapters
    ai/                   optional AI with deterministic fallback
  lib/                    env, database, supabase client, formatting, validation, logging
supabase/                 migrations, seed generator output, config
scripts/                  local stack, DB tests, E2E runner, seed generator
tests/                    db/ (RLS) and e2e/
```

## Data access and trust boundary

The browser never talks to the database. Pages and server actions call services, which use `withUser(userId, fn)` from `src/lib/database/db.ts`:

1. open a transaction,
2. set `request.jwt.claims` ({sub, role: 'authenticated'}) and the `authenticated` role in one statement,
3. run the queries, which also filter on `user_id` explicitly.

So every query is checked twice: by RLS in Postgres and by the explicit owner filter. The user id always comes from the verified session (`requireUser`), never from form input. `withService` (service role, bypasses RLS) is reserved for catalogue jobs. Account deletion uses the Supabase admin API with the service-role key on the server only.

### Latency

Without prepared statements (transaction pooler), every parameterised query costs two round trips to the database, and queries in one transaction run one after another. Page speed is therefore dominated by the distance between the server and the database: functions run in Vercel's `dub1` region (`vercel.json`), next to the Supabase project in eu-west-1. On top of that:

- the shared catalogue (ingredients, nutrition, shared recipes, shared prices) is cached in memory per server instance for 5 minutes (`loadCatalog` in `src/server/services/catalog.ts`). Users with their own recipes or reported prices get a fresh load under RLS;
- multi-row inserts are one statement (`tx(rows)`), not a loop.

## Nutrition engine

`src/features/nutrition/domain/`

- **Facts** are stored per 100 g per food state (`raw`, `cooked`, `dried`, `canned_drained`, `as_sold`) with source and confidence (`nutrition_facts`).
- **Units** (`units.ts`): g, kg, ml, dl, l, tsk (5 ml), spsk (15 ml), stk. Volume converts to mass only with a known density, pieces only with a known piece weight; otherwise conversion returns `null` and the line is flagged, never guessed.
- **Recipes** (`recipe-nutrition.ts`): each line is resolved to grams in a state that has facts. Cooked/raw conversion uses the ingredient's `cookedYieldFactor`. Missing nutrients are reported per nutrient (`incompleteNutrients`) and the total is labelled as a lower bound. `completeness` = share of grams with complete data × share of lines that resolved; confidence is the lowest confidence of any line.
- **Intake** (`intake.ts`): daily totals and averages over days that have entries (empty days are not counted as zero).

### Rounding

Calculations use unrounded values. Rounding happens only when showing or storing (`rounding.ts`): kcal to whole numbers, macros to 0.1 g, weight to 0.1 kg, prices in whole øre, calorie targets to the nearest 10 kcal, display grams whole up to 100 g then nearest 5 g. Half rounds away from zero.

### Safety guardrails

`energy.ts`, algorithm `initial-targets` v1:

- BMR by Mifflin-St Jeor. If sex is not given, the average of the two constants (−78) is used and the estimate is flagged as less certain.
- TDEE = BMR × activity factor (1.2 to 1.9).
- Rate limits: fat loss 0.1–1.0 % of body weight per week (default 0.5), muscle gain 0.1–0.5 % (default 0.25).
- Deficit at most 25 % of TDEE, surplus at most 15 %. Recomposition uses −5 %.
- Floor: max(1,200 kcal, BMR), but never above TDEE when the goal is to lose.
- Protein 2.0 g/kg for fat loss and recomposition, 1.8 for muscle gain, 1.6 for maintenance, using a reference weight capped at BMI 27. Fat 27 % of energy, never below 0.6 g/kg. Carbohydrate is the rest.
- Every applied guardrail adds a note that the UI explains in Danish (`describeNote`). Ages 18–100 only. The app says it is not medical advice.

## Meal planner

`src/features/meal-planning/domain/planner.ts`, algorithm `meal-planner` v1.2.

1. **Hard filters** (`isRecipeAllowed`): allergens, diet, excluded ingredients, meal type. Never relaxed. The server re-checks them when a user swaps a meal.
2. **Slots**: 2–5 meals a day with energy shares (breakfast 25 %, lunch 30 %, dinner 35 %, snack 10 %, rescaled to the chosen slots).
3. **Choice**: each candidate gets a score: closeness to the slot's energy, protein density, ingredient reuse (less waste), variety (at most two uses a week), favourites (+1), recipes sharing a cuisine with the user's favourites (small boost), disliked ingredients, cooking time above the user's limit, cost above the per-meal budget, and nutrition data completeness. A seeded FNV-1a hash breaks ties, so the same seed gives the same plan.
4. **Scaling**: servings quantised to 0.25 between 0.5 and 3. Each meal starts at its slot's energy share; then single 0.25 steps are taken while they reduce the day's deviation from all targets (energy, protein shortfall, carbohydrate, fat), so protein-dense meals grow first. Household portions = servings + household size − 1.
5. **Validation**: each day is checked against the targets with tolerances (energy ±7 %, protein at most 10 % short, carbohydrate and fat ±25 %, editable on `/profil/mal`). A bounded swap search tries to fix failing days; days that still fail are stored with their violations and shown.
6. Locked meals survive regeneration. Plans are archived, not overwritten.

## Basket optimizer

`src/features/basket-optimization/domain/optimizer.ts`, algorithm `basket-optimizer` v1. Single store per basket.

- **Consolidation** (`shopping-list/domain/consolidate.ts`): sum ingredient quantities across planned meals (scaled by household portions) in a common dimension (mass, volume or count), then subtract the pantry.
- **Effective price** (`grocery-pricing/domain/prices.ts`): best status first (live, estimated, synthetic, stale), store-specific before chain-wide, newest first. A promotion is used only within its validity and only if cheaper.
- **Packages** = ceil(quantity / package size), with a small epsilon for float noise. Leftovers of shelf-stable foods count as inventory; leftovers of perishables count as likely waste.
- **Product choice per item**: cheapest checkout cost in strict-budget mode; in best-value mode cost + 0.5 × likely waste + a match-quality penalty. Products that contain the user's allergens are never chosen; substitutes only when the user allows them.
- **Result**: one basket per store with checkout total, consumed value, leftover and waste value, unmatched items with a reason, and price status counts. An incomplete basket is never recommended. Strict-budget mode explains the shortfall with concrete suggestions. Savings are labelled unverified if any price is synthetic or estimated.

## Adaptive calorie algorithm

`src/features/weight-tracking/domain/adaptive.ts`, algorithm `adaptive-energy` v1.

- Weight trend for display: EWMA (α = 0.1, compounding across gaps). The slope used for decisions is a linear regression on raw daily weights (EWMA lag biased it).
- Window 21 days. Needs ≥ 14 days span, ≥ 8 weigh-in days and ≥ 80 % complete food-log days. A day is complete if the user marked it, or it has ≥ 2 entries and ≥ 50 % of the target.
- Observed TDEE = average intake − slope (kg/day) × 7,700 kcal/kg. Blended with the prior TDEE, reaching full weight after 28 complete days. Estimates outside 0.6–1.5 × prior are rejected as implausible.
- The new target follows the goal's planned deficit or surplus, capped at ±150 kcal per change, ignored below 50 kcal, at most every 7 days, and still subject to the safety floor.
- Every evaluation is stored (`calorie_recommendations`) with data quality and explanation. Adjustments wait for the user to accept or reject; accepting creates a new active goal and keeps history. Users can only change `status` on a recommendation (enforced with column grants).
- Goal timeline is a range (weeks low–high) from the observed trend and its standard error, or from the planned rate.

## Prices and data honesty

See `docs/DATA_SOURCES.md`. Observations are append-only (a trigger blocks updates). Development prices are synthetic and always labelled. Items without a price are counted separately rather than priced at zero. "Checked" on the shopping list means "in the cart"; what the user paid is a separate field.

## Security and privacy

See `docs/SECURITY_AND_PRIVACY.md`.

## Algorithm versions

`algorithm_versions` holds one row per algorithm version. Goals, plans, baskets and recommendations reference the version that produced them, so results can be explained later even after the algorithm changes.
