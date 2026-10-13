/**
 * Fast estimate of what a week's shopping costs when whole packages are
 * bought, used by the meal planner to aim at the weekly budget.
 *
 * It mirrors the basket optimizer in simplified form: ingredient amounts are
 * summed per ingredient and dimension, pantry stock is subtracted, and each
 * store buys the cheapest whole-package option for every ingredient. The
 * cheapest store wins. The basket optimizer still does the real calculation.
 */

import { packagesNeeded } from "@/features/basket-optimization/domain/optimizer";

export interface PackageOption {
  /** Package size in the ingredient key's base unit (g, ml or stk). */
  size: number;
  priceOre: number;
}

export interface BasketCostModel {
  /** Per recipe: amount per serving for each ingredient key ("ingredientId:dimension"). */
  needsPerServing: Map<string, Map<string, number>>;
  /** Per store: purchasable options for each ingredient key. */
  stores: Map<string, PackageOption[]>[];
  /** Pantry stock per ingredient key. */
  pantry: Map<string, number>;
}

export function weekNeeds(
  meals: { recipeId: string; householdServings: number }[],
  model: BasketCostModel,
): Map<string, number> {
  const needs = new Map<string, number>();
  for (const m of meals) {
    const perServing = model.needsPerServing.get(m.recipeId);
    if (!perServing) continue;
    for (const [key, qty] of perServing) {
      needs.set(key, (needs.get(key) ?? 0) + qty * m.householdServings);
    }
  }
  return needs;
}

/** Cheapest way to buy at least `quantity` from the options, or null without options. */
export function cheapestPackages(options: PackageOption[], quantity: number): number | null {
  let best: number | null = null;
  for (const o of options) {
    const cost = packagesNeeded(quantity, o.size) * o.priceOre;
    if (best === null || cost < best) best = cost;
  }
  return best;
}

/**
 * Checkout total of the cheapest store that can supply everything, or of the
 * cheapest partial basket (complete: false) when no store has everything.
 * Null without stores.
 */
export function basketCost(
  needs: Map<string, number>,
  model: BasketCostModel,
): { totalOre: number; complete: boolean } | null {
  let complete: number | null = null;
  let partial: number | null = null;
  for (const options of model.stores) {
    let total = 0;
    let missing = false;
    for (const [key, qty] of needs) {
      const toBuy = qty - (model.pantry.get(key) ?? 0);
      if (toBuy <= 1e-9) continue;
      const cost = cheapestPackages(options.get(key) ?? [], toBuy);
      if (cost === null) missing = true;
      else total += cost;
    }
    if (!missing) complete = complete === null ? total : Math.min(complete, total);
    else partial = partial === null ? total : Math.min(partial, total);
  }
  if (complete !== null) return { totalOre: complete, complete: true };
  return partial === null ? null : { totalOre: partial, complete: false };
}
