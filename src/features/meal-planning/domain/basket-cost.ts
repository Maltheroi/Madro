/**
 * Fast estimate of what a week's shopping costs when whole packages are
 * bought, used by the meal planner to aim at the weekly budget.
 *
 * It mirrors the basket optimizer in simplified form: ingredient amounts are
 * summed per ingredient and dimension, pantry stock is subtracted, and each
 * store buys the cheapest whole-package option for every ingredient. The
 * cheapest store wins. The basket optimizer still does the real calculation.
 *
 * It measures the weekly food cost, not this week's checkout: long-lasting
 * goods (rice, oil, spices) count only for the share used, because the rest
 * is still in the cupboard next week. Perishables count as whole packages.
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
  /** Keys of long-lasting ingredients, counted for the share used. */
  longLasting: Set<string>;
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

/**
 * Cheapest way to buy at least `quantity` from the options, or null without
 * options. With `share`, only the used share of a package is counted.
 */
export function cheapestPackages(
  options: PackageOption[],
  quantity: number,
  share = false,
): number | null {
  let best: number | null = null;
  for (const o of options) {
    const packages = share ? quantity / o.size : packagesNeeded(quantity, o.size);
    const cost = packages * o.priceOre;
    if (best === null || cost < best) best = cost;
  }
  return best;
}

/**
 * Weekly cost at the cheapest store that can supply everything, or of the
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
      const cost = cheapestPackages(options.get(key) ?? [], toBuy, model.longLasting.has(key));
      if (cost === null) missing = true;
      else total += cost;
    }
    if (!missing) complete = complete === null ? total : Math.min(complete, total);
    else partial = partial === null ? total : Math.min(partial, total);
  }
  if (complete !== null) return { totalOre: complete, complete: true };
  return partial === null ? null : { totalOre: partial, complete: false };
}

/**
 * The same weekly cost, kept up to date as meals change: evaluating a change
 * only re-prices the ingredients it touches. Used by the planner's budget
 * search, which tries thousands of small changes.
 */
export class WeekBasket {
  private needs: Map<string, number>;
  private keyCost: (number | null)[][] = [];
  private keyIndex = new Map<string, number>();
  private totals: number[];
  private missing: number[];

  constructor(
    private model: BasketCostModel,
    needs: Map<string, number>,
  ) {
    this.needs = new Map(needs);
    this.totals = model.stores.map(() => 0);
    this.missing = model.stores.map(() => 0);
    for (const [key, qty] of this.needs) this.setKey(key, qty);
  }

  private costAt(store: number, key: string, qty: number): number | null {
    const toBuy = qty - (this.model.pantry.get(key) ?? 0);
    if (toBuy <= 1e-9) return 0;
    return cheapestPackages(
      this.model.stores[store].get(key) ?? [],
      toBuy,
      this.model.longLasting.has(key),
    );
  }

  private index(key: string): number {
    let i = this.keyIndex.get(key);
    if (i === undefined) {
      i = this.keyCost.length;
      this.keyIndex.set(key, i);
      this.keyCost.push(this.model.stores.map(() => 0));
    }
    return i;
  }

  private setKey(key: string, qty: number) {
    const costs = this.keyCost[this.index(key)];
    this.model.stores.forEach((_, s) => {
      const old = costs[s];
      if (old === null) this.missing[s]--;
      else this.totals[s] -= old;
      const next = this.costAt(s, key, qty);
      if (next === null) this.missing[s]++;
      else this.totals[s] += next;
      costs[s] = next;
    });
    this.needs.set(key, qty);
  }

  /** Weekly cost if `delta` (quantity change per key) were applied. */
  evaluate(delta: Map<string, number>): { totalOre: number; complete: boolean } | null {
    const totals = [...this.totals];
    const missing = [...this.missing];
    for (const [key, change] of delta) {
      if (Math.abs(change) < 1e-9) continue;
      const qty = (this.needs.get(key) ?? 0) + change;
      const i = this.keyIndex.get(key);
      this.model.stores.forEach((_, s) => {
        const old = i === undefined ? 0 : this.keyCost[i][s];
        if (old === null) missing[s]--;
        else totals[s] -= old;
        const next = this.costAt(s, key, qty);
        if (next === null) missing[s]++;
        else totals[s] += next;
      });
    }
    return pickStore(totals, missing);
  }

  apply(delta: Map<string, number>) {
    for (const [key, change] of delta) {
      if (Math.abs(change) < 1e-9) continue;
      this.setKey(key, (this.needs.get(key) ?? 0) + change);
    }
  }

  current() {
    return pickStore(this.totals, this.missing);
  }
}

function pickStore(totals: number[], missing: number[]) {
  let complete: number | null = null;
  let partial: number | null = null;
  totals.forEach((t, s) => {
    if (missing[s] === 0) complete = complete === null ? t : Math.min(complete, t);
    else partial = partial === null ? t : Math.min(partial, t);
  });
  if (complete !== null) return { totalOre: complete as number, complete: true };
  return partial === null ? null : { totalOre: partial as number, complete: false };
}

/** Quantity change per ingredient key when a day's meals go from `before` to `after`. */
export function needsDelta(
  before: { recipeId: string; householdServings: number }[],
  after: { recipeId: string; householdServings: number }[],
  model: BasketCostModel,
): Map<string, number> {
  const delta = weekNeeds(after, model);
  for (const [key, qty] of weekNeeds(before, model)) delta.set(key, (delta.get(key) ?? 0) - qty);
  return delta;
}
