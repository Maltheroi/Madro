import "server-only";
import { withUser, type Tx } from "@/lib/database/db";
import type { SessionUser } from "@/server/auth";
import {
  consolidateIngredients,
  type RequiredItem,
} from "@/features/shopping-list/domain/consolidate";
import {
  BASKET_OPTIMIZER_ALGORITHM,
  optimizeBasket,
  type OptimizationMode,
  type OptimizeResult,
  type Store,
} from "@/features/basket-optimization/domain/optimizer";
import type { PriceStatus, PriceType } from "@/features/grocery-pricing/domain/prices";
import { UNIT_LABELS_DA, type Unit } from "@/features/nutrition/domain/units";
import { formatInt } from "@/lib/format";
import { getAlgorithmVersionId, getProfile } from "@/server/repositories/profile";
import { loadCatalog, type Catalog } from "./catalog";
import { currentWeekStart } from "./meal-plan";
import { enforceRateLimit, LIMITS } from "./rate-limit";

export interface PantryItemView {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: Unit;
  confirmedAt: string;
  expiresOn: string | null;
}

async function activePlan(tx: Tx, userId: string) {
  const [plan] =
    await tx`select id from public.meal_plans where user_id = ${userId} and week_start = ${currentWeekStart()} and status = 'active'`;
  if (!plan) return null;
  const meals =
    await tx`select recipe_id, household_servings from public.planned_meals where meal_plan_id = ${plan.id}`;
  return {
    id: plan.id as string,
    meals: meals.map((m) => ({
      recipeId: m.recipe_id as string,
      householdServings: m.household_servings as number,
    })),
  };
}

async function pantryFor(tx: Tx, userId: string) {
  return tx`select p.id, p.ingredient_id, i.name_da, p.quantity, p.unit, p.confirmed_at, p.expires_on
            from public.pantry_items p join public.ingredients i on i.id = p.ingredient_id
            where p.user_id = ${userId} order by i.name_da`;
}

function requiredItemsFor(
  plan: NonNullable<Awaited<ReturnType<typeof activePlan>>>,
  catalog: Catalog,
  pantry: Awaited<ReturnType<typeof pantryFor>>,
): RequiredItem[] {
  const recipes = new Map(
    catalog.recipes.map((r) => [
      r.id,
      {
        id: r.id,
        servings: r.servings,
        lines: r.lines.map((l) => ({
          ingredientId: l.ingredientId,
          quantity: l.quantity,
          unit: l.unit,
          optional: l.optional,
        })),
      },
    ]),
  );
  const infos = new Map(
    [...catalog.ingredients.values()].map((i) => [
      i.ingredientId,
      {
        id: i.ingredientId,
        name: i.nameDa,
        category: i.category,
        densityGPerMl: i.densityGPerMl,
        gramsPerPiece: i.gramsPerPiece,
      },
    ]),
  );
  return consolidateIngredients(
    plan.meals,
    recipes,
    infos,
    pantry
      .filter((p) => p.quantity > 0)
      .map((p) => ({ ingredientId: p.ingredient_id, quantity: p.quantity, unit: p.unit })),
  );
}

/** The consolidated ingredient list for this week's plan (no prices). */
export async function getRequiredItems(user: SessionUser) {
  return withUser(user.id, async (tx) => {
    const plan = await activePlan(tx, user.id);
    if (!plan) return null;
    const [catalog, pantry] = await Promise.all([loadCatalog(tx), pantryFor(tx, user.id)]);
    return { planId: plan.id, items: requiredItemsFor(plan, catalog, pantry) };
  });
}

export function formatQuantity(quantity: number, dimension: RequiredItem["dimension"]): string {
  if (dimension === "count") return `${formatInt(Math.ceil(quantity - 1e-9))} stk.`;
  const unit = dimension === "mass" ? "g" : "ml";
  if (quantity >= 1000)
    return `${String(Math.round(quantity / 100) / 10).replace(".", ",")} ${unit === "g" ? "kg" : "l"}`;
  return `${formatInt(quantity < 100 ? quantity : Math.round(quantity / 5) * 5)} ${unit}`;
}

export function formatPackage(q: number, unit: Unit): string {
  return `${String(q).replace(".", ",")} ${UNIT_LABELS_DA[unit]}`;
}

/** Choose one store per retailer: one in the user's postal code if known, else the first. */
function chooseStores(
  catalog: Catalog,
  postalCode: string | null,
  storePostal: Map<string, string | null>,
): Store[] {
  const byRetailer = new Map<string, Store>();
  for (const s of catalog.prices.stores) {
    const current = byRetailer.get(s.retailerId);
    if (
      !current ||
      (postalCode &&
        storePostal.get(s.id) === postalCode &&
        storePostal.get(current.id) !== postalCode)
    ) {
      byRetailer.set(s.retailerId, s);
    }
  }
  return [...byRetailer.values()];
}

export interface BasketView {
  id: string;
  mode: OptimizationMode;
  budgetOre: number | null;
  calculatedAt: string;
  result: OptimizeResult;
}

export async function calculateBasket(
  user: SessionUser,
  opts: { mode: OptimizationMode; allowSubstitutes: boolean },
): Promise<string> {
  return withUser(user.id, async (tx) => {
    await enforceRateLimit(tx, LIMITS.basketOptimize);
    const plan = await activePlan(tx, user.id);
    if (!plan) throw new Error("Lav en madplan først.");
    const now = new Date();
    const [catalog, pantry, profile, storeRows] = await Promise.all([
      loadCatalog(tx, now),
      pantryFor(tx, user.id),
      getProfile(tx, user.id),
      tx`select id, postal_code from public.stores`,
    ]);
    const items = requiredItemsFor(plan, catalog, pantry);
    const stores = chooseStores(
      catalog,
      profile?.postalCode ?? null,
      new Map(storeRows.map((s) => [s.id as string, s.postal_code as string | null])),
    );
    const budgetOre = profile?.weeklyBudgetOre ?? null;
    const result = optimizeBasket({
      items,
      stores,
      products: catalog.prices.products,
      matches: catalog.prices.matches,
      observations: catalog.prices.observations,
      ingredients: new Map(
        [...catalog.ingredients.values()].map((i) => [
          i.ingredientId,
          {
            id: i.ingredientId,
            shelfStable: i.shelfStable,
            densityGPerMl: i.densityGPerMl,
            gramsPerPiece: i.gramsPerPiece,
          },
        ]),
      ),
      userAllergens: profile?.allergens ?? [],
      mode: opts.mode === "strict_budget" && budgetOre !== null ? "strict_budget" : "best_value",
      budgetOre,
      allowSubstitutes: opts.allowSubstitutes,
      now,
    });
    const algorithmVersionId = await getAlgorithmVersionId(
      tx,
      BASKET_OPTIMIZER_ALGORITHM.key,
      BASKET_OPTIMIZER_ALGORITHM.version,
    );
    const [basket] = await tx`
      insert into public.shopping_baskets (user_id, meal_plan_id, store_id, mode, budget_ore, checkout_total_ore, algorithm_version_id, result, calculated_at)
      values (${user.id}, ${plan.id}, ${result.recommended?.store.id ?? null}, ${result.mode}, ${budgetOre},
              ${result.recommended?.checkoutTotalOre ?? null}, ${algorithmVersionId}, ${tx.json(result as never)}, ${now})
      returning id`;
    if (result.recommended) {
      for (const l of result.recommended.lines) {
        await tx`
          insert into public.shopping_basket_items (basket_id, user_id, ingredient_id, product_id, required, required_quantity, quantity_dimension,
            packages, unit_price_ore, line_cost_ore, price_observation_id, price_status, match_quality)
          values (${basket.id}, ${user.id}, ${l.ingredientId}, ${l.productId}, ${l.required}, ${l.requiredQuantity}, ${l.dimension},
            ${l.packages}, ${l.unitPriceOre}, ${l.lineCostOre}, ${l.priceObservationId}, ${l.priceStatus}, ${l.matchQuality})`;
      }
      for (const u of result.recommended.unmatched) {
        const item = items.find((i) => i.ingredientId === u.ingredientId)!;
        await tx`
          insert into public.shopping_basket_items (basket_id, user_id, ingredient_id, required, required_quantity, quantity_dimension, unmatched_reason)
          values (${basket.id}, ${user.id}, ${u.ingredientId}, ${u.required}, ${item.toBuy}, ${item.dimension}, ${u.reason})`;
      }
    }
    return basket.id as string;
  });
}

export async function getLatestBasket(user: SessionUser): Promise<BasketView | null> {
  return withUser(user.id, async (tx) => {
    const [b] =
      await tx`select * from public.shopping_baskets where user_id = ${user.id} order by calculated_at desc limit 1`;
    if (!b) return null;
    return {
      id: b.id,
      mode: b.mode,
      budgetOre: b.budget_ore,
      calculatedAt: new Date(b.calculated_at).toISOString(),
      result: b.result,
    };
  });
}

/** Creates a shopping list from one store's basket in a saved basket calculation. */
export async function createListFromBasket(
  user: SessionUser,
  basketId: string,
  storeId: string,
): Promise<string> {
  return withUser(user.id, async (tx) => {
    const [b] =
      await tx`select * from public.shopping_baskets where id = ${basketId} and user_id = ${user.id}`;
    if (!b) throw new Error("Kurven findes ikke.");
    const result = b.result as OptimizeResult;
    const basket = result.baskets.find((x) => x.store.id === storeId);
    if (!basket) throw new Error("Butikken findes ikke i beregningen.");
    const catalog = await loadCatalog(tx);
    const [list] = await tx`
      insert into public.shopping_lists (user_id, meal_plan_id, basket_id, store_id, title, budget_ore)
      values (${user.id}, ${b.meal_plan_id}, ${basketId}, ${storeId}, ${`Indkøb hos ${basket.store.name}`}, ${b.budget_ore})
      returning id`;
    let pos = 0;
    for (const l of basket.lines) {
      const category = catalog.ingredients.get(l.ingredientId)?.category ?? "Andet";
      await tx`
        insert into public.shopping_list_items (list_id, user_id, ingredient_id, product_id, label, category, required_quantity_text, packages,
          package_text, unit_price_ore, price_status, price_type, price_observed_at, offer_valid_to, required, position)
        values (${list.id}, ${user.id}, ${l.ingredientId}, ${l.productId}, ${l.productName}, ${category},
          ${`${l.ingredientName}: ${formatQuantity(l.requiredQuantity, l.dimension)}`}, ${l.packages}, ${formatPackage(l.packageQuantity, l.packageUnit)},
          ${l.unitPriceOre}, ${l.priceStatus}, ${l.priceType}, ${l.observedAt}, ${l.priceType === "promotional" ? l.validTo : null}, ${l.required}, ${pos++})`;
    }
    for (const u of basket.unmatched) {
      const category = catalog.ingredients.get(u.ingredientId)?.category ?? "Andet";
      await tx`
        insert into public.shopping_list_items (list_id, user_id, ingredient_id, label, category, required_quantity_text, packages, required, unmatched, position)
        values (${list.id}, ${user.id}, ${u.ingredientId}, ${u.ingredientName}, ${category}, ${u.ingredientName}, 1, ${u.required}, true, ${pos++})`;
    }
    return list.id as string;
  });
}

export interface ShoppingListItemView {
  id: string;
  label: string;
  category: string;
  requiredQuantityText: string | null;
  packages: number;
  packageText: string | null;
  unitPriceOre: number | null;
  priceStatus: PriceStatus | null;
  priceType: PriceType | null;
  priceObservedAt: string | null;
  offerValidTo: string | null;
  required: boolean;
  unmatched: boolean;
  checked: boolean;
  removed: boolean;
  addedManually: boolean;
  purchasedPriceOre: number | null;
}

export interface ShoppingListView {
  id: string;
  title: string;
  storeId: string | null;
  budgetOre: number | null;
  createdAt: string;
  items: ShoppingListItemView[];
  totals: ListTotals;
}

export interface ListTotals {
  expectedOre: number;
  pricedItems: number;
  unpricedItems: number;
  confirmedOre: number;
  confirmedItems: number;
  remainingBudgetOre: number | null;
  statusCounts: Record<PriceStatus, number>;
}

export function computeListTotals(
  items: ShoppingListItemView[],
  budgetOre: number | null,
): ListTotals {
  const active = items.filter((i) => !i.removed);
  const statusCounts: Record<PriceStatus, number> = {
    live: 0,
    stale: 0,
    estimated: 0,
    synthetic: 0,
  };
  let expected = 0;
  let priced = 0;
  let confirmed = 0;
  let confirmedItems = 0;
  for (const i of active) {
    if (i.unitPriceOre !== null && !i.unmatched) {
      expected += i.unitPriceOre * i.packages;
      priced++;
      if (i.priceStatus) statusCounts[i.priceStatus]++;
    }
    if (i.purchasedPriceOre !== null) {
      confirmed += i.purchasedPriceOre;
      confirmedItems++;
    }
  }
  return {
    expectedOre: expected,
    pricedItems: priced,
    unpricedItems: active.length - priced,
    confirmedOre: confirmed,
    confirmedItems,
    remainingBudgetOre: budgetOre === null ? null : budgetOre - expected,
    statusCounts,
  };
}

export async function getLatestList(user: SessionUser): Promise<ShoppingListView | null> {
  return withUser(user.id, async (tx) => {
    const [l] =
      await tx`select * from public.shopping_lists where user_id = ${user.id} order by created_at desc limit 1`;
    if (!l) return null;
    const rows =
      await tx`select * from public.shopping_list_items where list_id = ${l.id} order by category, position`;
    const items: ShoppingListItemView[] = rows.map((r) => ({
      id: r.id,
      label: r.label,
      category: r.category,
      requiredQuantityText: r.required_quantity_text,
      packages: r.packages,
      packageText: r.package_text,
      unitPriceOre: r.unit_price_ore,
      priceStatus: r.price_status,
      priceType: r.price_type,
      priceObservedAt: r.price_observed_at ? new Date(r.price_observed_at).toISOString() : null,
      offerValidTo: r.offer_valid_to ? new Date(r.offer_valid_to).toISOString() : null,
      required: r.required,
      unmatched: r.unmatched,
      checked: r.checked,
      removed: r.removed,
      addedManually: r.added_manually,
      purchasedPriceOre: r.purchased_price_ore,
    }));
    return {
      id: l.id,
      title: l.title,
      storeId: l.store_id,
      budgetOre: l.budget_ore,
      createdAt: new Date(l.created_at).toISOString(),
      items,
      totals: computeListTotals(items, l.budget_ore),
    };
  });
}

type ItemUpdate =
  | { kind: "checked"; value: boolean }
  | { kind: "packages"; value: number }
  | { kind: "removed"; value: boolean }
  | { kind: "purchased"; valueOre: number | null };

export async function updateListItem(
  user: SessionUser,
  itemId: string,
  u: ItemUpdate,
): Promise<void> {
  await withUser(user.id, async (tx) => {
    switch (u.kind) {
      case "checked":
        await tx`update public.shopping_list_items set checked = ${u.value} where id = ${itemId} and user_id = ${user.id}`;
        break;
      case "packages":
        await tx`update public.shopping_list_items set packages = ${Math.max(0, Math.min(99, Math.round(u.value)))} where id = ${itemId} and user_id = ${user.id}`;
        break;
      case "removed":
        await tx`update public.shopping_list_items set removed = ${u.value} where id = ${itemId} and user_id = ${user.id}`;
        break;
      case "purchased":
        await tx`update public.shopping_list_items set purchased_price_ore = ${u.valueOre} where id = ${itemId} and user_id = ${user.id}`;
        break;
    }
  });
}

export async function addManualItem(
  user: SessionUser,
  listId: string,
  label: string,
  priceOre: number | null,
): Promise<void> {
  await withUser(user.id, async (tx) => {
    const [list] =
      await tx`select id from public.shopping_lists where id = ${listId} and user_id = ${user.id}`;
    if (!list) throw new Error("Listen findes ikke.");
    await tx`
      insert into public.shopping_list_items (list_id, user_id, label, category, packages, unit_price_ore, price_status, price_type, required, added_manually, position)
      values (${listId}, ${user.id}, ${label}, 'Egne varer', 1, ${priceOre}, ${priceOre === null ? null : "estimated"}, ${priceOre === null ? null : "manual"}, false, true, 1000)`;
  });
}

// --- Pantry -----------------------------------------------------------------

export async function getPantry(user: SessionUser): Promise<{
  items: PantryItemView[];
  ingredients: { id: string; name: string; defaultUnit: Unit }[];
}> {
  return withUser(user.id, async (tx) => {
    const [rows, ingredients] = await Promise.all([
      pantryFor(tx, user.id),
      tx`select id, name_da, default_unit from public.ingredients order by name_da`,
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        ingredientId: r.ingredient_id,
        ingredientName: r.name_da,
        quantity: r.quantity,
        unit: r.unit,
        confirmedAt: new Date(r.confirmed_at).toISOString(),
        expiresOn: r.expires_on ? new Date(r.expires_on).toISOString().slice(0, 10) : null,
      })),
      ingredients: ingredients.map((i) => ({
        id: i.id,
        name: i.name_da,
        defaultUnit: i.default_unit,
      })),
    };
  });
}

export async function upsertPantryItem(
  user: SessionUser,
  ingredientId: string,
  quantity: number,
  unit: Unit,
  expiresOn: string | null,
) {
  await withUser(
    user.id,
    (tx) => tx`
    insert into public.pantry_items (user_id, ingredient_id, quantity, unit, expires_on, confirmed_at)
    values (${user.id}, ${ingredientId}, ${quantity}, ${unit}, ${expiresOn}, now())
    on conflict (user_id, ingredient_id, unit) do update set quantity = excluded.quantity, expires_on = excluded.expires_on, confirmed_at = now()`,
  );
}

export async function deletePantryItem(user: SessionUser, id: string) {
  await withUser(
    user.id,
    (tx) => tx`delete from public.pantry_items where id = ${id} and user_id = ${user.id}`,
  );
}

/** Store a user-observed shelf price (private to the user, marked as estimated). */
export async function addManualPrice(
  user: SessionUser,
  productId: string,
  storeId: string | null,
  priceOre: number,
) {
  await withUser(user.id, async (tx) => {
    const [p] = await tx`select retailer_id from public.products where id = ${productId}`;
    if (!p) throw new Error("Varen findes ikke.");
    await tx`
      insert into public.price_observations (product_id, retailer_id, store_id, price_ore, price_type, observed_at, source_key, confidence, reported_by)
      values (${productId}, ${p.retailer_id}, ${storeId}, ${priceOre}, 'manual', now(), 'manual-entry', 'low', ${user.id})`;
  });
}
