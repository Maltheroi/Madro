import "server-only";
import type { Tx } from "@/lib/database/db";
import {
  calculateRecipeNutrition,
  type DataConfidence,
  type FoodState,
  type IngredientNutritionData,
  type NutritionFacts,
  type RecipeNutrition,
} from "@/features/nutrition/domain/recipe-nutrition";
import { convert, dimensionOf, type Unit } from "@/features/nutrition/domain/units";
import type { Cuisine, MealSlot, PlannerRecipe } from "@/features/meal-planning/domain/planner";
import {
  effectivePrice,
  type PriceObservation,
  type PriceStatus,
} from "@/features/grocery-pricing/domain/prices";
import type {
  IngredientProductMatch,
  Product,
  Store,
} from "@/features/basket-optimization/domain/optimizer";

export interface CatalogIngredient extends IngredientNutritionData {
  slug: string;
  nameDa: string;
  synonyms: string[];
  category: string;
  defaultUnit: Unit;
  allergens: string[];
  dietTags: string[];
  shelfStable: boolean;
  sources: { key: string; name: string; verification: string }[];
}

export interface RecipeLineView {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: Unit;
  state: FoodState;
  optional: boolean;
}

export interface CatalogRecipe {
  id: string;
  slug: string;
  ownerId: string | null;
  name: string;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  mealTypes: MealSlot[];
  instructions: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  cuisines: Cuisine[];
  lines: RecipeLineView[];
  nutrition: RecipeNutrition;
  allergens: string[];
  dietTags: string[];
  cost: {
    perServingOre: number | null;
    statuses: PriceStatus[];
    pricedLines: number;
    totalLines: number;
  };
}

export interface PriceData {
  stores: Store[];
  products: Product[];
  matches: IngredientProductMatch[];
  observations: PriceObservation[];
}

export interface Catalog {
  ingredients: Map<string, CatalogIngredient>;
  recipes: CatalogRecipe[];
  recipeById: Map<string, CatalogRecipe>;
  prices: PriceData;
}

const DIET_ORDER = ["vegan", "vegetarian", "pescetarian"] as const;

export async function loadPriceData(tx: Tx, now: Date): Promise<PriceData> {
  const [stores, products, matches, observations] = await Promise.all([
    tx`select s.id, s.retailer_id, s.name, r.name as retailer_name, s.postal_code
       from public.stores s join public.retailers r on r.id = s.retailer_id where s.is_active`,
    tx`select id, retailer_id, name, brand, package_quantity, package_unit, allergens from public.products where is_active`,
    tx`select m.ingredient_id, m.product_id, m.quality, p.allergens
       from public.ingredient_product_matches m join public.products p on p.id = m.product_id`,
    // Latest observation per product/store/type/reporter, plus anything currently valid.
    tx`select distinct on (product_id, coalesce(store_id::text, ''), price_type, coalesce(reported_by::text, ''))
         id, product_id, retailer_id, store_id, price_ore, price_type, observed_at, valid_from, valid_to,
         source_key, confidence, is_synthetic
       from public.price_observations
       where observed_at <= ${now} and (valid_to is null or valid_to >= ${now})
       order by product_id, coalesce(store_id::text, ''), price_type, coalesce(reported_by::text, ''), observed_at desc`,
  ]);
  return {
    stores: stores.map((s) => ({
      id: s.id,
      retailerId: s.retailer_id,
      name: s.name,
      retailerName: s.retailer_name,
    })),
    products: products.map((p) => ({
      id: p.id,
      retailerId: p.retailer_id,
      name: p.name,
      brand: p.brand,
      packageQuantity: p.package_quantity,
      packageUnit: p.package_unit,
    })),
    matches: matches.map((m) => ({
      ingredientId: m.ingredient_id,
      productId: m.product_id,
      quality: m.quality,
      allergens: m.allergens,
    })),
    observations: observations.map((o) => ({
      id: o.id,
      productId: o.product_id,
      retailerId: o.retailer_id,
      storeId: o.store_id,
      priceOre: o.price_ore,
      priceType: o.price_type,
      observedAt: new Date(o.observed_at).toISOString(),
      validFrom: o.valid_from ? new Date(o.valid_from).toISOString() : null,
      validTo: o.valid_to ? new Date(o.valid_to).toISOString() : null,
      sourceKey: o.source_key,
      confidence: o.confidence,
      isSynthetic: o.is_synthetic,
    })),
  };
}

/**
 * Cheapest known price per gram/ml/stk for an ingredient across all stores,
 * used only for rough recipe cost estimates (the basket optimizer does the real work).
 */
function cheapestUnitPrice(
  ingredient: CatalogIngredient,
  baseUnit: Unit,
  prices: PriceData,
  now: Date,
): { orePerUnit: number; status: PriceStatus } | null {
  let best: { orePerUnit: number; status: PriceStatus } | null = null;
  const productMap = new Map(prices.products.map((p) => [p.id, p]));
  for (const m of prices.matches) {
    if (m.ingredientId !== ingredient.ingredientId || m.quality === "substitute") continue;
    const product = productMap.get(m.productId);
    if (!product) continue;
    const size = convert(product.packageQuantity, product.packageUnit, baseUnit, ingredient);
    if (!size) continue;
    for (const store of prices.stores
      .filter((s) => s.retailerId === product.retailerId)
      .slice(0, 1)) {
      const p = effectivePrice(prices.observations, product.id, store.id, store.retailerId, now);
      if (!p || p.status === "stale") continue;
      const perUnit = p.observation.priceOre / size;
      if (!best || perUnit < best.orePerUnit) best = { orePerUnit: perUnit, status: p.status };
    }
  }
  return best;
}

export async function loadCatalog(tx: Tx, now = new Date()): Promise<Catalog> {
  const [ingRows, factRows, recipeRows, lineRows, prices] = await Promise.all([
    tx`select * from public.ingredients`,
    tx`select f.*, s.key as source_key, s.name as source_name, s.verification_status
       from public.nutrition_facts f join public.nutrition_sources s on s.id = f.source_id`,
    tx`select * from public.recipes order by name_da`,
    tx`select * from public.recipe_ingredients order by recipe_id, position`,
    loadPriceData(tx, now),
  ]);

  const ingredients = new Map<string, CatalogIngredient>();
  for (const r of ingRows) {
    ingredients.set(r.id, {
      ingredientId: r.id,
      name: r.name_da,
      slug: r.slug,
      nameDa: r.name_da,
      synonyms: r.synonyms,
      category: r.category,
      defaultUnit: r.default_unit,
      densityGPerMl: r.density_g_per_ml,
      gramsPerPiece: r.grams_per_piece,
      cookedYieldFactor: r.cooked_yield_factor,
      allergens: r.allergens,
      dietTags: r.diet_tags,
      shelfStable: r.shelf_stable,
      facts: [],
      sources: [],
    });
  }
  for (const f of factRows) {
    const ing = ingredients.get(f.ingredient_id);
    if (!ing) continue;
    const facts: NutritionFacts = {
      state: f.food_state,
      sourceId: f.source_key,
      confidence: f.confidence as DataConfidence,
      per100g: {
        energyKcal: f.energy_kcal,
        proteinG: f.protein_g,
        carbohydrateG: f.carbohydrate_g,
        fatG: f.fat_g,
        fiberG: f.fiber_g,
        sugarsG: f.sugars_g,
        saturatedFatG: f.saturated_fat_g,
        saltG: f.salt_g,
      },
    };
    ing.facts.push(facts);
    if (!ing.sources.some((s) => s.key === f.source_key)) {
      ing.sources.push({
        key: f.source_key,
        name: f.source_name,
        verification: f.verification_status,
      });
    }
  }

  const linesByRecipe = new Map<string, (typeof lineRows)[number][]>();
  for (const l of lineRows) {
    const arr = linesByRecipe.get(l.recipe_id) ?? [];
    arr.push(l);
    linesByRecipe.set(l.recipe_id, arr);
  }

  const unitPriceCache = new Map<string, ReturnType<typeof cheapestUnitPrice>>();
  const recipes: CatalogRecipe[] = recipeRows.map((r) => {
    const rows = linesByRecipe.get(r.id) ?? [];
    const lines: RecipeLineView[] = rows.map((l) => ({
      ingredientId: l.ingredient_id,
      ingredientName: ingredients.get(l.ingredient_id)?.nameDa ?? "Ukendt ingrediens",
      quantity: l.quantity,
      unit: l.unit,
      state: l.food_state,
      optional: l.optional,
    }));
    const nutrition = calculateRecipeNutrition(
      lines.map((l) => ({
        ingredientId: l.ingredientId,
        quantity: l.quantity,
        unit: l.unit,
        state: l.state,
      })),
      r.servings,
      ingredients,
    );
    const lineIngredients = lines
      .map((l) => ingredients.get(l.ingredientId))
      .filter((x): x is CatalogIngredient => !!x);
    const allergens = [...new Set(lineIngredients.flatMap((i) => i.allergens))].sort();
    const dietTags = DIET_ORDER.filter((tag) =>
      lineIngredients.every((i) => i.dietTags.includes(tag)),
    );

    let costOre = 0;
    let priced = 0;
    const statuses = new Set<PriceStatus>();
    for (const l of lines) {
      const ing = ingredients.get(l.ingredientId);
      if (!ing) continue;
      const dim = dimensionOf(l.unit);
      const baseUnit: Unit =
        dim === "count" && !ing.gramsPerPiece
          ? "stk"
          : dim === "volume" && !ing.densityGPerMl
            ? "ml"
            : "g";
      const qty = convert(l.quantity, l.unit, baseUnit, ing);
      const key = `${ing.ingredientId}:${baseUnit}`;
      if (!unitPriceCache.has(key))
        unitPriceCache.set(key, cheapestUnitPrice(ing, baseUnit, prices, now));
      const up = unitPriceCache.get(key);
      if (qty !== null && up) {
        costOre += qty * up.orePerUnit;
        priced++;
        statuses.add(up.status);
      }
    }
    return {
      id: r.id,
      slug: r.slug,
      ownerId: r.owner_id,
      name: r.name_da,
      description: r.description_da,
      servings: r.servings,
      prepMinutes: r.prep_minutes,
      cookMinutes: r.cook_minutes,
      mealTypes: r.meal_types,
      instructions: r.instructions_da,
      difficulty: r.difficulty,
      cuisines: r.cuisines ?? [],
      lines,
      nutrition,
      allergens,
      dietTags,
      cost: {
        perServingOre:
          priced === lines.length && lines.length > 0 ? Math.round(costOre / r.servings) : null,
        statuses: [...statuses],
        pricedLines: priced,
        totalLines: lines.length,
      },
    };
  });

  return { ingredients, recipes, recipeById: new Map(recipes.map((r) => [r.id, r])), prices };
}

export function toPlannerRecipe(r: CatalogRecipe): PlannerRecipe {
  return {
    id: r.id,
    name: r.name,
    mealTypes: r.mealTypes,
    perServing: {
      energyKcal: r.nutrition.perServing.energyKcal,
      proteinG: r.nutrition.perServing.proteinG,
      carbohydrateG: r.nutrition.perServing.carbohydrateG,
      fatG: r.nutrition.perServing.fatG,
    },
    allergens: r.allergens,
    ingredientIds: r.lines.map((l) => l.ingredientId),
    dietTags: r.dietTags,
    cuisines: r.cuisines,
    totalTimeMinutes: r.prepMinutes + r.cookMinutes,
    estimatedCostPerServingOre: r.cost.perServingOre,
    nutritionCompleteness: r.nutrition.completeness,
  };
}

const norm = (s: string) => s.trim().toLowerCase();

/** Resolve free-text exclusions ("rejer, svinekød") to catalog ingredients. */
export function resolveIngredientTerms(
  terms: string[],
  ingredients: Map<string, CatalogIngredient>,
): { ids: string[]; unmatched: string[] } {
  const ids = new Set<string>();
  const unmatched: string[] = [];
  for (const raw of terms) {
    const term = norm(raw);
    if (!term) continue;
    let hit = false;
    for (const ing of ingredients.values()) {
      const names = [ing.slug.replaceAll("-", " "), norm(ing.nameDa), ...ing.synonyms.map(norm)];
      if (
        names.some(
          (n) =>
            n === term || n.includes(term) || (term.length >= 4 && term.includes(n.split(",")[0])),
        )
      ) {
        ids.add(ing.ingredientId);
        hit = true;
      }
    }
    if (!hit) unmatched.push(raw);
  }
  return { ids: [...ids], unmatched };
}
