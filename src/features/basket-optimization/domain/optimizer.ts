/**
 * Single-supermarket basket optimizer, algorithm "basket-optimizer" v1.
 *
 * For every eligible store, each required ingredient is matched to the
 * store's products. For a required quantity q and package size p (in a
 * compatible unit) the shopper buys ceil(q / p) packages at the package
 * price. The cheapest acceptable candidate per item is chosen (with a waste
 * and substitution penalty in best-value mode), and the complete baskets are
 * compared store by store. The basket is never split across retailers.
 *
 * The search is exhaustive over the candidate products per item within each
 * store, because items are independent once the store is fixed. The result is
 * optimal for the stated scoring rule and the available price data, nothing more.
 */

import {
  convert,
  type ConversionData,
  type Dimension,
  type Unit,
} from "@/features/nutrition/domain/units";
import type { RequiredItem } from "@/features/shopping-list/domain/consolidate";
import {
  effectivePrice,
  type PriceObservation,
  type PriceStatus,
  type PriceType,
} from "@/features/grocery-pricing/domain/prices";

export const BASKET_OPTIMIZER_ALGORITHM = { key: "basket-optimizer", version: "1.1.0" } as const;

export type MatchQuality = "exact" | "equivalent" | "substitute";

export interface Store {
  id: string;
  retailerId: string;
  name: string;
  retailerName: string;
}

export interface Product {
  id: string;
  retailerId: string;
  name: string;
  brand: string | null;
  packageQuantity: number;
  packageUnit: Unit;
}

export interface IngredientProductMatch {
  ingredientId: string;
  productId: string;
  quality: MatchQuality;
  /** Allergens the product contains, used to re-check substitutions. */
  allergens: string[];
}

export interface IngredientMeta extends ConversionData {
  id: string;
  /** Shelf-stable leftovers count as inventory, perishable leftovers as likely waste. */
  shelfStable: boolean;
}

export type OptimizationMode = "best_value" | "strict_budget";

export interface OptimizeInput {
  items: RequiredItem[];
  stores: Store[];
  products: Product[];
  matches: IngredientProductMatch[];
  observations: PriceObservation[];
  ingredients: Map<string, IngredientMeta>;
  userAllergens: string[];
  mode: OptimizationMode;
  budgetOre: number | null;
  allowSubstitutes: boolean;
  now: Date;
}

export interface BasketLine {
  ingredientId: string;
  ingredientName: string;
  required: boolean;
  requiredQuantity: number;
  dimension: Dimension;
  productId: string;
  productName: string;
  packageQuantity: number;
  packageUnit: Unit;
  packages: number;
  unitPriceOre: number;
  lineCostOre: number;
  /** Value of the share of purchased packages that the plan consumes. */
  consumedValueOre: number;
  leftoverQuantity: number;
  leftoverValueOre: number;
  likelyWasteValueOre: number;
  matchQuality: MatchQuality;
  priceType: PriceType;
  priceStatus: PriceStatus;
  observedAt: string;
  validTo: string | null;
  regularPriceOre: number | null;
  priceObservationId: string;
  sourceKey: string;
}

export type UnmatchedReason = "no_product" | "no_price" | "incompatible_unit" | "allergen_conflict";

export interface UnmatchedItem {
  ingredientId: string;
  ingredientName: string;
  required: boolean;
  reason: UnmatchedReason;
}

export interface StoreBasket {
  store: Store;
  lines: BasketLine[];
  unmatched: UnmatchedItem[];
  checkoutTotalOre: number;
  consumedValueOre: number;
  leftoverValueOre: number;
  likelyWasteValueOre: number;
  /**
   * What the week's food costs: what the plan uses plus perishable leftovers
   * that will likely be thrown out. Leftovers of long-lasting goods stay in the
   * cupboard for next week, so the checkout can be higher. Compared with the budget.
   */
  weeklyCostOre: number;
  /** All required items have a priced product. */
  complete: boolean;
  coverage: number;
  statusCounts: Record<PriceStatus, number>;
  withinBudget: boolean | null;
  score: number;
}

export interface BudgetShortfall {
  cheapestCompleteStoreId: string | null;
  shortfallOre: number;
  suggestions: string[];
}

export interface OptimizeResult {
  algorithm: typeof BASKET_OPTIMIZER_ALGORITHM;
  mode: OptimizationMode;
  recommended: StoreBasket | null;
  baskets: StoreBasket[];
  /** Savings against the next-best complete basket. */
  savings: { againstStoreId: string; amountOre: number; verified: boolean } | null;
  budget: BudgetShortfall | null;
  explanation: string[];
}

const QUALITY_PENALTY: Record<MatchQuality, number> = {
  exact: 0,
  equivalent: 0.02,
  substitute: 0.08,
};
const EPS = 1e-9;

/** Packages needed: ceil(q / p) with tolerance for floating-point noise. */
export function packagesNeeded(required: number, packageSize: number): number {
  if (!(packageSize > 0)) throw new RangeError("Pakningsstørrelse skal være større end 0.");
  if (required <= 0) return 0;
  return Math.ceil(required / packageSize - EPS);
}

function baseUnitFor(dimension: Dimension): Unit {
  return dimension === "mass" ? "g" : dimension === "volume" ? "ml" : "stk";
}

function emptyStatusCounts(): Record<PriceStatus, number> {
  return { live: 0, stale: 0, estimated: 0, synthetic: 0 };
}

function basketForStore(input: OptimizeInput, store: Store): StoreBasket {
  const lines: BasketLine[] = [];
  const unmatched: UnmatchedItem[] = [];
  const statusCounts = emptyStatusCounts();
  const productMap = new Map(input.products.map((p) => [p.id, p]));

  for (const item of input.items) {
    if (item.toBuy <= EPS) continue;
    const meta = input.ingredients.get(item.ingredientId);
    const matches = input.matches.filter(
      (m) =>
        m.ingredientId === item.ingredientId &&
        productMap.get(m.productId)?.retailerId === store.retailerId &&
        (input.allowSubstitutes || m.quality !== "substitute"),
    );
    if (matches.length === 0) {
      unmatched.push({
        ingredientId: item.ingredientId,
        ingredientName: item.name,
        required: item.required,
        reason: "no_product",
      });
      continue;
    }
    let best: { line: BasketLine; score: number } | null = null;
    let reason: UnmatchedReason = "no_price";
    for (const m of matches) {
      if (m.allergens.some((a) => input.userAllergens.includes(a))) {
        reason = "allergen_conflict";
        continue;
      }
      const product = productMap.get(m.productId)!;
      const packageInBase = convert(
        product.packageQuantity,
        product.packageUnit,
        baseUnitFor(item.dimension),
        meta ?? {},
      );
      if (packageInBase === null || packageInBase <= 0) {
        reason = "incompatible_unit";
        continue;
      }
      const price = effectivePrice(
        input.observations,
        product.id,
        store.id,
        store.retailerId,
        input.now,
      );
      if (!price) continue;
      const packages = packagesNeeded(item.toBuy, packageInBase);
      const cost = packages * price.observation.priceOre;
      const bought = packages * packageInBase;
      const leftover = Math.max(0, bought - item.toBuy);
      const consumedValue = (item.toBuy / packageInBase) * price.observation.priceOre;
      const leftoverValue = cost - consumedValue;
      const wasteValue = meta?.shelfStable ? 0 : leftoverValue;
      const score =
        input.mode === "best_value"
          ? cost + 0.5 * wasteValue + cost * QUALITY_PENALTY[m.quality]
          : cost + cost * QUALITY_PENALTY[m.quality] * 0.25;
      const line: BasketLine = {
        ingredientId: item.ingredientId,
        ingredientName: item.name,
        required: item.required,
        requiredQuantity: item.toBuy,
        dimension: item.dimension,
        productId: product.id,
        productName: product.name,
        packageQuantity: product.packageQuantity,
        packageUnit: product.packageUnit,
        packages,
        unitPriceOre: price.observation.priceOre,
        lineCostOre: cost,
        consumedValueOre: Math.round(consumedValue),
        leftoverQuantity: leftover,
        leftoverValueOre: Math.round(leftoverValue),
        likelyWasteValueOre: Math.round(wasteValue),
        matchQuality: m.quality,
        priceType: price.observation.priceType,
        priceStatus: price.status,
        observedAt: price.observation.observedAt,
        validTo: price.observation.validTo ?? null,
        regularPriceOre: price.regularPriceOre,
        priceObservationId: price.observation.id,
        sourceKey: price.observation.sourceKey,
      };
      if (
        !best ||
        score < best.score - EPS ||
        (Math.abs(score - best.score) <= EPS && product.id < best.line.productId)
      ) {
        best = { line, score };
      }
    }
    if (best) {
      lines.push(best.line);
      statusCounts[best.line.priceStatus]++;
    } else {
      unmatched.push({
        ingredientId: item.ingredientId,
        ingredientName: item.name,
        required: item.required,
        reason,
      });
    }
  }

  const needed = input.items.filter((i) => i.toBuy > EPS);
  const requiredNeeded = needed.filter((i) => i.required).length;
  const requiredMissing = unmatched.filter((u) => u.required).length;
  const checkout = lines.reduce((a, l) => a + l.lineCostOre, 0);
  const waste = lines.reduce((a, l) => a + l.likelyWasteValueOre, 0);
  const complete = requiredMissing === 0;
  const consumed = lines.reduce((a, l) => a + l.consumedValueOre, 0);
  const weeklyCost = Math.round(consumed + waste);
  const withinBudget = input.budgetOre === null ? null : weeklyCost <= input.budgetOre;
  // Incomplete baskets are ranked after complete ones; their score is informative only.
  const qualityPenalty = lines.reduce(
    (a, l) => a + l.lineCostOre * QUALITY_PENALTY[l.matchQuality],
    0,
  );
  const score = input.mode === "best_value" ? checkout + 0.5 * waste + qualityPenalty : checkout;

  return {
    store,
    lines,
    unmatched,
    checkoutTotalOre: checkout,
    consumedValueOre: consumed,
    weeklyCostOre: weeklyCost,
    leftoverValueOre: lines.reduce((a, l) => a + l.leftoverValueOre, 0),
    likelyWasteValueOre: waste,
    complete,
    coverage: requiredNeeded === 0 ? 1 : (requiredNeeded - requiredMissing) / requiredNeeded,
    statusCounts,
    withinBudget,
    score,
  };
}

const kr = (ore: number) =>
  new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format(ore / 100);

export function optimizeBasket(input: OptimizeInput): OptimizeResult {
  const baskets = input.stores
    .map((s) => basketForStore(input, s))
    .sort(
      (a, b) =>
        Number(b.complete) - Number(a.complete) ||
        b.coverage - a.coverage ||
        a.score - b.score ||
        a.store.id.localeCompare(b.store.id),
    );
  const explanation: string[] = [];
  const complete = baskets.filter((b) => b.complete);
  let recommended: StoreBasket | null = null;
  let budget: BudgetShortfall | null = null;

  if (input.mode === "strict_budget" && input.budgetOre !== null) {
    const feasible = complete.filter((b) => b.weeklyCostOre <= input.budgetOre!);
    recommended = feasible.sort((a, b) => a.weeklyCostOre - b.weeklyCostOre)[0] ?? null;
    if (!recommended) {
      const cheapest = [...complete].sort((a, b) => a.weeklyCostOre - b.weeklyCostOre)[0] ?? null;
      const shortfall = cheapest ? cheapest.weeklyCostOre - input.budgetOre : 0;
      const suggestions: string[] = [];
      if (cheapest) {
        const optional = cheapest.lines
          .filter((l) => !l.required)
          .reduce((a, l) => a + l.lineCostOre, 0);
        if (optional > 0) suggestions.push(`Fjern valgfrie varer (sparer ${kr(optional)}).`);
        const top = [...cheapest.lines].sort((a, b) => b.lineCostOre - a.lineCostOre).slice(0, 3);
        if (top.length) {
          suggestions.push(
            `De dyreste linjer er ${top.map((l) => `${l.ingredientName} (${kr(l.lineCostOre)})`).join(", ")}. Overvej at udskifte måltider med disse ingredienser.`,
          );
        }
        if (!input.allowSubstitutes)
          suggestions.push("Tillad erstatningsvarer for at finde billigere alternativer.");
        suggestions.push(`Hæv budgettet med ${kr(shortfall)} eller gentag billigere måltider.`);
      } else {
        suggestions.push(
          "Ingen butik kan levere alle nødvendige varer. Se de manglende varer nedenfor.",
        );
      }
      budget = {
        cheapestCompleteStoreId: cheapest?.store.id ?? null,
        shortfallOre: Math.max(0, shortfall),
        suggestions,
      };
      explanation.push(
        cheapest
          ? `Ingen komplet kurv holder sig inden for budgettet på ${kr(input.budgetOre)}. Den billigste komplette kurv (${cheapest.store.name}) mangler ${kr(shortfall)}.`
          : "Ingen butik har priser på alle nødvendige varer.",
      );
    }
  } else {
    recommended = complete[0] ?? null;
  }

  if (recommended) {
    explanation.push(
      `${recommended.store.name} har den ${input.mode === "best_value" ? "bedste samlede værdi" : "laveste pris"} for hele kurven: ${kr(recommended.checkoutTotalOre)} ved kassen.`,
    );
    if (recommended.likelyWasteValueOre > 0) {
      explanation.push(
        `Omkring ${kr(recommended.likelyWasteValueOre)} af kurven er rester af letfordærvelige varer, som planen ikke bruger.`,
      );
    }
    const s = recommended.statusCounts;
    if (s.synthetic > 0)
      explanation.push(
        `${s.synthetic} priser er syntetiske testdata og ikke rigtige butikspriser.`,
      );
    if (s.stale > 0) explanation.push(`${s.stale} priser er forældede og kun vejledende.`);
    if (s.estimated > 0)
      explanation.push(`${s.estimated} priser er indtastet manuelt og ikke verificeret.`);
    const optionalMissing = recommended.unmatched.filter((u) => !u.required);
    if (optionalMissing.length)
      explanation.push(`${optionalMissing.length} valgfrie varer findes ikke i butikken.`);
  } else if (complete.length === 0 && baskets.length > 0) {
    const best = baskets[0];
    explanation.push(
      `Ingen butik kan levere hele kurven. ${best.store.name} dækker flest varer (${Math.round(best.coverage * 100)} %). Mangler: ${best.unmatched
        .filter((u) => u.required)
        .map((u) => u.ingredientName)
        .join(", ")}.`,
    );
  }

  let savings: OptimizeResult["savings"] = null;
  if (recommended) {
    const next = complete.find((b) => b.store.id !== recommended!.store.id);
    if (next && next.checkoutTotalOre > recommended.checkoutTotalOre) {
      const verified = [recommended, next].every(
        (b) =>
          b.statusCounts.synthetic === 0 &&
          b.statusCounts.stale === 0 &&
          b.statusCounts.estimated === 0,
      );
      savings = {
        againstStoreId: next.store.id,
        amountOre: next.checkoutTotalOre - recommended.checkoutTotalOre,
        verified,
      };
    }
  }

  return {
    algorithm: BASKET_OPTIMIZER_ALGORITHM,
    mode: input.mode,
    recommended,
    baskets,
    savings,
    budget,
    explanation,
  };
}
