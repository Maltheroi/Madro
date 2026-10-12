/**
 * Recipe nutrition from actual ingredient quantities.
 *
 * Nutrition facts are stored per 100 g of the ingredient in a specific food
 * state (raw, cooked, ...). A recipe line names a quantity, a unit and the
 * state the quantity refers to. When the line's state differs from the facts'
 * state, a documented yield factor converts between them. Anything that cannot
 * be converted is reported as missing; nothing is filled in by guesswork.
 */

import { toGrams, type ConversionData, type Unit } from "./units";

export const NUTRIENT_KEYS = [
  "energyKcal",
  "proteinG",
  "carbohydrateG",
  "fatG",
  "fiberG",
  "sugarsG",
  "saturatedFatG",
  "saltG",
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export const CORE_NUTRIENTS: readonly NutrientKey[] = [
  "energyKcal",
  "proteinG",
  "carbohydrateG",
  "fatG",
];

/** Per-100 g values; `null` means the source does not provide the value. */
export type NutrientValues = Record<NutrientKey, number | null>;
export type NutrientTotals = Record<NutrientKey, number>;

export const FOOD_STATES = ["raw", "cooked", "dried", "canned_drained", "as_sold"] as const;
export type FoodState = (typeof FOOD_STATES)[number];

export type DataConfidence = "high" | "medium" | "low";

export interface NutritionFacts {
  state: FoodState;
  per100g: NutrientValues;
  sourceId: string;
  confidence: DataConfidence;
}

export interface IngredientNutritionData extends ConversionData {
  ingredientId: string;
  name: string;
  facts: NutritionFacts[];
  /**
   * Weight after cooking divided by raw weight (e.g. dry pasta ≈ 2.4).
   * Used to convert a cooked quantity into the raw basis or vice versa.
   */
  cookedYieldFactor?: number | null;
}

export interface RecipeLine {
  ingredientId: string;
  quantity: number;
  unit: Unit;
  state: FoodState;
}

export type MissingReason =
  "no_facts" | "unit_not_convertible" | "state_not_convertible" | "nutrient_missing";

export interface MissingDataIssue {
  ingredientId: string;
  name: string;
  reason: MissingReason;
  nutrients?: NutrientKey[];
}

export interface NutritionResult {
  totals: NutrientTotals;
  /** Nutrients for which at least one line contributed no value. */
  incompleteNutrients: NutrientKey[];
  issues: MissingDataIssue[];
  /** Share of total recipe grams with complete core nutrient data (0–1). */
  completeness: number;
  /** Lowest confidence among the facts used. */
  confidence: DataConfidence;
}

const CONFIDENCE_ORDER: DataConfidence[] = ["low", "medium", "high"];

export function emptyTotals(): NutrientTotals {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as NutrientTotals;
}

interface ResolvedLine {
  grams: number;
  facts: NutritionFacts;
}

/** Pick the facts for a line and express the line's quantity in that facts' basis. */
export function resolveLine(
  line: RecipeLine,
  ingredient: IngredientNutritionData | undefined,
): ResolvedLine | MissingReason {
  if (!ingredient || ingredient.facts.length === 0) return "no_facts";
  const grams = toGrams(line.quantity, line.unit, ingredient);
  if (grams === null) return "unit_not_convertible";

  const exact = ingredient.facts.find((f) => f.state === line.state);
  if (exact) return { grams, facts: exact };

  const yieldFactor = ingredient.cookedYieldFactor;
  if (yieldFactor && yieldFactor > 0) {
    if (line.state === "cooked") {
      const raw = ingredient.facts.find((f) => f.state === "raw" || f.state === "dried");
      if (raw) return { grams: grams / yieldFactor, facts: raw };
    }
    if (line.state === "raw" || line.state === "dried") {
      const cooked = ingredient.facts.find((f) => f.state === "cooked");
      if (cooked) return { grams: grams * yieldFactor, facts: cooked };
    }
  }
  // "as_sold" facts are interchangeable with raw for products eaten as purchased.
  const asSold = ingredient.facts.find(
    (f) =>
      (f.state === "as_sold" && line.state === "raw") ||
      (f.state === "raw" && line.state === "as_sold"),
  );
  if (asSold) return { grams, facts: asSold };
  return "state_not_convertible";
}

export function calculateNutrition(
  lines: RecipeLine[],
  ingredients: Map<string, IngredientNutritionData>,
): NutritionResult {
  const totals = emptyTotals();
  const incomplete = new Set<NutrientKey>();
  const issues: MissingDataIssue[] = [];
  let confidence: DataConfidence = "high";
  let totalGrams = 0;
  let completeGrams = 0;

  for (const line of lines) {
    const ingredient = ingredients.get(line.ingredientId);
    const name = ingredient?.name ?? line.ingredientId;
    const resolved = resolveLine(line, ingredient);
    if (typeof resolved === "string") {
      issues.push({ ingredientId: line.ingredientId, name, reason: resolved });
      NUTRIENT_KEYS.forEach((k) => incomplete.add(k));
      continue;
    }
    totalGrams += resolved.grams;
    const missing: NutrientKey[] = [];
    for (const key of NUTRIENT_KEYS) {
      const per100 = resolved.facts.per100g[key];
      if (per100 === null || per100 === undefined) {
        missing.push(key);
        incomplete.add(key);
      } else {
        totals[key] += (per100 * resolved.grams) / 100;
      }
    }
    const coreMissing = missing.filter((k) => CORE_NUTRIENTS.includes(k));
    if (coreMissing.length === 0) completeGrams += resolved.grams;
    if (missing.length > 0) {
      issues.push({
        ingredientId: line.ingredientId,
        name,
        reason: "nutrient_missing",
        nutrients: missing,
      });
    }
    if (
      CONFIDENCE_ORDER.indexOf(resolved.facts.confidence) < CONFIDENCE_ORDER.indexOf(confidence)
    ) {
      confidence = resolved.facts.confidence;
    }
  }

  // Grams with complete core data, scaled down by the share of lines that
  // could not be resolved to grams at all.
  const unresolvedCount = issues.filter((i) => i.reason !== "nutrient_missing").length;
  const resolvedShare = lines.length === 0 ? 0 : (lines.length - unresolvedCount) / lines.length;
  const completeness = totalGrams > 0 ? (completeGrams / totalGrams) * resolvedShare : 0;
  if (unresolvedCount > 0) confidence = "low";

  return {
    totals,
    incompleteNutrients: NUTRIENT_KEYS.filter((k) => incomplete.has(k)),
    issues,
    completeness,
    confidence,
  };
}

export function scaleTotals(totals: NutrientTotals, factor: number): NutrientTotals {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, totals[k] * factor])) as NutrientTotals;
}

export function addTotals(a: NutrientTotals, b: NutrientTotals): NutrientTotals {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, a[k] + b[k]])) as NutrientTotals;
}

export interface RecipeNutrition extends NutritionResult {
  perServing: NutrientTotals;
  servings: number;
}

/** Recipe-level nutrition: totals for the whole yield plus one serving. */
export function calculateRecipeNutrition(
  lines: RecipeLine[],
  servings: number,
  ingredients: Map<string, IngredientNutritionData>,
): RecipeNutrition {
  if (!(servings > 0)) throw new RangeError("Antal portioner skal være større end 0.");
  const result = calculateNutrition(lines, ingredients);
  return { ...result, servings, perServing: scaleTotals(result.totals, 1 / servings) };
}
