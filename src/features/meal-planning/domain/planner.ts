/**
 * Seven-day meal planner, algorithm "meal-planner" v1.
 *
 * Deterministic candidate ranking with bounded local improvement:
 *   1. Hard filters remove recipes that violate allergies, exclusions or diet.
 *   2. Each open slot gets the best-scoring candidate. The score combines macro
 *      fit, ingredient reuse with recipes already chosen, variety, cost, cooking
 *      time, disliked ingredients and favourites. A seeded hash breaks ties so
 *      "regenerate" yields a different but reproducible week.
 *   3. Portions are scaled (0.5–3.0 servings in 0.25 steps) so each day lands
 *      near the energy target.
 *   4. Each day is validated against configurable tolerances. Days that fail
 *      get a bounded swap search over the top candidates; any remaining
 *      violation is reported, never hidden.
 *   5. With a weekly budget, a swap search moves the week's estimated cost as
 *      close to the budget as possible without going over, as long as no day
 *      gets worse on nutrition.
 *
 * This is a heuristic. It does not claim the plan is globally optimal.
 */

import type { NutrientTotals } from "@/features/nutrition/domain/recipe-nutrition";
import { needsDelta, WeekBasket, weekNeeds, type BasketCostModel } from "./basket-cost";

export const MEAL_PLANNER_ALGORITHM = { key: "meal-planner", version: "1.4.0" } as const;

export const CUISINES = ["fitness", "thai", "asiatisk", "dansk", "italiensk", "mexicansk"] as const;
export type Cuisine = (typeof CUISINES)[number];
export const CUISINE_LABELS_DA: Record<Cuisine, string> = {
  fitness: "Fitness",
  thai: "Thai",
  asiatisk: "Asiatisk",
  dansk: "Dansk",
  italiensk: "Italiensk",
  mexicansk: "Mexicansk",
};

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABELS_DA: Record<MealSlot, string> = {
  breakfast: "Morgenmad",
  lunch: "Frokost",
  dinner: "Aftensmad",
  snack: "Mellemmåltid",
};

export const DIETS = ["omnivore", "pescetarian", "vegetarian", "vegan"] as const;
export type Diet = (typeof DIETS)[number];

/** Diet tags a recipe must carry to be eligible for a diet. */
const DIET_REQUIREMENT: Record<Diet, string | null> = {
  omnivore: null,
  pescetarian: "pescetarian",
  vegetarian: "vegetarian",
  vegan: "vegan",
};

export interface PlannerRecipe {
  id: string;
  name: string;
  mealTypes: MealSlot[];
  /** Nutrition for one standard serving. */
  perServing: Pick<NutrientTotals, "energyKcal" | "proteinG" | "carbohydrateG" | "fatG">;
  /** Allergen codes present in the recipe (derived from ingredients). */
  allergens: string[];
  ingredientIds: string[];
  /** Diet tags the recipe satisfies: "vegan" implies "vegetarian" and "pescetarian". */
  dietTags: string[];
  /** Cuisine tags (optional for callers that do not care). */
  cuisines?: string[];
  totalTimeMinutes: number;
  /** Estimated cost per serving in øre, or null when unknown. */
  estimatedCostPerServingOre: number | null;
  /** Share of recipe grams with complete core nutrition data (0–1). */
  nutritionCompleteness: number;
}

export interface PlannerConstraints {
  allergens: string[];
  excludedIngredientIds: string[];
  dislikedIngredientIds: string[];
  diet: Diet;
  maxCookingMinutes: number | null;
  favoriteRecipeIds: string[];
  mealsPerDay: number;
  householdSize: number;
  weeklyBudgetOre: number | null;
  /**
   * What the week's estimated recipe cost should land on (defaults to the
   * weekly budget). Callers lower it when whole packages make the real
   * shopping basket cost more than the recipe estimate.
   */
  budgetTargetOre?: number | null;
}

export interface DailyTargets {
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
}

export interface Tolerances {
  /** Allowed relative deviation of daily energy (0.07 = ±7 %). */
  energy: number;
  /** Allowed relative shortfall of protein. Surplus protein is accepted. */
  proteinShortfall: number;
  /** Allowed relative deviation for carbohydrate and fat. */
  carbohydrate: number;
  fat: number;
}

export const DEFAULT_TOLERANCES: Tolerances = {
  energy: 0.07,
  proteinShortfall: 0.1,
  carbohydrate: 0.25,
  fat: 0.25,
};

export interface LockedMeal {
  day: number;
  slot: MealSlot;
  recipeId: string;
  servings: number;
}

export interface PlannedMeal {
  day: number;
  slot: MealSlot;
  recipeId: string;
  /** Servings the user eats (portion scaling applied). */
  servings: number;
  /** Servings to cook in total for the household. */
  householdServings: number;
  locked: boolean;
}

export type Violation =
  | { code: "energy"; actual: number; target: number }
  | { code: "protein_low"; actual: number; target: number }
  | { code: "carbohydrate"; actual: number; target: number }
  | { code: "fat"; actual: number; target: number }
  | { code: "no_candidates"; slot: MealSlot };

export interface PlannedDay {
  day: number;
  meals: PlannedMeal[];
  totals: DailyTargets;
  violations: Violation[];
}

export interface MealPlanResult {
  algorithm: typeof MEAL_PLANNER_ALGORITHM;
  seed: number;
  days: PlannedDay[];
  valid: boolean;
  estimatedCostOre: number | null;
  /** Number of meals where the recipe cost is unknown. */
  unknownCostMeals: number;
  /** The budget search's target and the cost it reached (when a budget was set). */
  budgetFit?: { targetOre: number; costOre: number };
  warnings: string[];
}

export const SLOT_ENERGY_SHARE: Record<MealSlot, number> = {
  breakfast: 0.25,
  lunch: 0.3,
  dinner: 0.35,
  snack: 0.1,
};

export function slotsForMealsPerDay(n: number): MealSlot[] {
  switch (Math.max(2, Math.min(5, Math.round(n)))) {
    case 2:
      return ["lunch", "dinner"];
    case 3:
      return ["breakfast", "lunch", "dinner"];
    case 4:
      return ["breakfast", "lunch", "dinner", "snack"];
    default:
      return ["breakfast", "snack", "lunch", "dinner", "snack"];
  }
}

/** Slot energy share normalised over the slots actually used. */
export function slotShares(slots: MealSlot[]): number[] {
  const raw = slots.map((s) => SLOT_ENERGY_SHARE[s]);
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => r / sum);
}

export function isRecipeAllowed(recipe: PlannerRecipe, c: PlannerConstraints): boolean {
  if (recipe.allergens.some((a) => c.allergens.includes(a))) return false;
  if (recipe.ingredientIds.some((i) => c.excludedIngredientIds.includes(i))) return false;
  const tag = DIET_REQUIREMENT[c.diet];
  if (tag && !recipe.dietTags.includes(tag)) return false;
  if (recipe.perServing.energyKcal <= 0) return false;
  return true;
}

/** Deterministic 32-bit hash used for seeded tie-breaking (FNV-1a). */
export function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const SERVING_STEP = 0.25;
export const MIN_SERVINGS = 0.5;
export const MAX_SERVINGS = 3;

export function quantizeServings(x: number): number {
  const clamped = Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, x));
  return Math.round(clamped / SERVING_STEP) * SERVING_STEP;
}

function dayTotals(meals: PlannedMeal[], recipes: Map<string, PlannerRecipe>): DailyTargets {
  const t = { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0 };
  for (const m of meals) {
    const r = recipes.get(m.recipeId);
    if (!r) continue;
    t.energyKcal += r.perServing.energyKcal * m.servings;
    t.proteinG += r.perServing.proteinG * m.servings;
    t.carbohydrateG += r.perServing.carbohydrateG * m.servings;
    t.fatG += r.perServing.fatG * m.servings;
  }
  return t;
}

export function validateDay(
  totals: DailyTargets,
  targets: DailyTargets,
  tol: Tolerances,
): Violation[] {
  const v: Violation[] = [];
  const rel = (a: number, t: number) => (t > 0 ? Math.abs(a - t) / t : 0);
  if (rel(totals.energyKcal, targets.energyKcal) > tol.energy) {
    v.push({ code: "energy", actual: totals.energyKcal, target: targets.energyKcal });
  }
  if (totals.proteinG < targets.proteinG * (1 - tol.proteinShortfall)) {
    v.push({ code: "protein_low", actual: totals.proteinG, target: targets.proteinG });
  }
  if (rel(totals.carbohydrateG, targets.carbohydrateG) > tol.carbohydrate) {
    v.push({ code: "carbohydrate", actual: totals.carbohydrateG, target: targets.carbohydrateG });
  }
  if (rel(totals.fatG, targets.fatG) > tol.fat) {
    v.push({ code: "fat", actual: totals.fatG, target: targets.fatG });
  }
  return v;
}

/** Penalty used to compare day compositions: squared relative deviations. */
function dayDeviation(totals: DailyTargets, targets: DailyTargets): number {
  const sq = (a: number, t: number, w: number) => (t > 0 ? w * ((a - t) / t) ** 2 : 0);
  const proteinShort = Math.max(0, targets.proteinG - totals.proteinG);
  return (
    sq(totals.energyKcal, targets.energyKcal, 4) +
    (targets.proteinG > 0 ? 3 * (proteinShort / targets.proteinG) ** 2 : 0) +
    sq(totals.carbohydrateG, targets.carbohydrateG, 1) +
    sq(totals.fatG, targets.fatG, 1)
  );
}

/**
 * Scale the open (unlocked) meals of a day. Each slot first gets its energy
 * share; then single 0.25-serving steps are applied while they reduce the
 * day's deviation from the targets (energy, protein shortfall, carbohydrate,
 * fat), so protein-dense meals are scaled up before others.
 */
export function scalePortions(
  meals: PlannedMeal[],
  recipes: Map<string, PlannerRecipe>,
  targets: DailyTargets,
  shares: number[],
): PlannedMeal[] {
  const out = meals.map((m, i) => {
    if (m.locked) return { ...m };
    const r = recipes.get(m.recipeId)!;
    return {
      ...m,
      servings: quantizeServings((targets.energyKcal * shares[i]) / r.perServing.energyKcal),
    };
  });
  let current = dayDeviation(dayTotals(out, recipes), targets);
  for (let iter = 0; iter < 24; iter++) {
    let best: { idx: number; servings: number; dev: number } | null = null;
    out.forEach((m, idx) => {
      if (m.locked) return;
      for (const dir of [1, -1]) {
        const next = quantizeServings(m.servings + dir * SERVING_STEP);
        if (next === m.servings) continue;
        const trial = out.map((x, xi) => (xi === idx ? { ...x, servings: next } : x));
        const dev = dayDeviation(dayTotals(trial, recipes), targets);
        if (dev < current - 1e-9 && (!best || dev < best.dev)) best = { idx, servings: next, dev };
      }
    });
    if (!best) break;
    const b = best as { idx: number; servings: number; dev: number };
    out[b.idx] = { ...out[b.idx], servings: b.servings };
    current = b.dev;
  }
  return out;
}

export interface PlanInput {
  recipes: PlannerRecipe[];
  constraints: PlannerConstraints;
  targets: DailyTargets;
  tolerances?: Tolerances;
  locked?: LockedMeal[];
  seed?: number;
  days?: number;
  /** Whole-package cost model; without it the budget search uses per-serving estimates. */
  basket?: BasketCostModel;
}

interface ScoreContext {
  usedCounts: Map<string, number>;
  usedIngredients: Map<string, number>;
  slotKcal: number;
  slotProteinShare: number;
  seed: number;
  key: string;
  /** Cuisines of the user's favourite recipes, with how many favourites carry each. */
  favoriteCuisines: Map<string, number>;
}

const COST_CAP = 4;

function scoreCandidate(r: PlannerRecipe, c: PlannerConstraints, ctx: ScoreContext): number {
  let score = 0;
  // Protein density relative to the slot's protein expectation.
  const servings = quantizeServings(ctx.slotKcal / r.perServing.energyKcal);
  const kcal = r.perServing.energyKcal * servings;
  score -= (3 * Math.abs(kcal - ctx.slotKcal)) / ctx.slotKcal;
  const proteinPerKcal = r.perServing.proteinG / r.perServing.energyKcal;
  score += Math.min(proteinPerKcal / ctx.slotProteinShare, 1.5);
  // Ingredient reuse lowers waste from partly used packages.
  const shared = r.ingredientIds.filter((i) => ctx.usedIngredients.has(i)).length;
  score += 0.15 * Math.min(shared, 5);
  // Variety: allow up to two uses per week (cook once, eat twice).
  const used = ctx.usedCounts.get(r.id) ?? 0;
  if (used >= 2) score -= 5;
  else if (used === 1) score -= 0.4;
  if (c.favoriteRecipeIds.includes(r.id)) score += 1;
  // Recipes from cuisines the user picked favourites in get a small boost.
  const affinity = Math.max(0, ...(r.cuisines ?? []).map((k) => ctx.favoriteCuisines.get(k) ?? 0));
  score += 0.1 * Math.min(affinity, 3);
  const disliked = r.ingredientIds.filter((i) => c.dislikedIngredientIds.includes(i)).length;
  score -= 2 * disliked;
  if (c.maxCookingMinutes && r.totalTimeMinutes > c.maxCookingMinutes) score -= 1.5;
  const budget = c.weeklyBudgetOre;
  if (budget) {
    // What this meal costs the household at the slot's size, against its share of the budget.
    // Ranks by price per kcal, so tight budgets start from cheap meals. Capped; an unknown
    // price counts as the most expensive, never as a free meal.
    const perMealBudget = budget / (7 * c.mealsPerDay);
    const household = Math.max(1, c.householdSize);
    const ratio =
      r.estimatedCostPerServingOre === null
        ? Infinity
        : (r.estimatedCostPerServingOre * (servings + household - 1)) / perMealBudget;
    score -= Math.min(COST_CAP, 1.5 * ratio);
  }
  score -= 0.5 * (1 - r.nutritionCompleteness);
  // Seeded tie-breaker in [0, 0.3).
  score += (hash(`${ctx.seed}:${ctx.key}:${r.id}`) % 1000) / 3333;
  return score;
}

export function generateMealPlan(input: PlanInput): MealPlanResult {
  const tol = input.tolerances ?? DEFAULT_TOLERANCES;
  const seed = input.seed ?? 1;
  const numDays = input.days ?? 7;
  const c = input.constraints;
  const recipeMap = new Map(input.recipes.map((r) => [r.id, r]));
  const allowed = input.recipes.filter((r) => isRecipeAllowed(r, c));
  const slots = slotsForMealsPerDay(c.mealsPerDay);
  const shares = slotShares(slots);
  const warnings: string[] = [];
  const lockedMap = new Map((input.locked ?? []).map((l) => [`${l.day}:${l.slot}`, l]));
  const usedCounts = new Map<string, number>();
  const usedIngredients = new Map<string, number>();
  const proteinShare = input.targets.proteinG / input.targets.energyKcal;
  const favoriteCuisines = new Map<string, number>();
  for (const id of c.favoriteRecipeIds) {
    for (const k of recipeMap.get(id)?.cuisines ?? [])
      favoriteCuisines.set(k, (favoriteCuisines.get(k) ?? 0) + 1);
  }

  const markUsed = (r: PlannerRecipe, delta: number) => {
    usedCounts.set(r.id, (usedCounts.get(r.id) ?? 0) + delta);
    for (const i of r.ingredientIds) usedIngredients.set(i, (usedIngredients.get(i) ?? 0) + delta);
  };

  for (const l of input.locked ?? []) {
    const r = recipeMap.get(l.recipeId);
    if (!r) continue;
    if (!isRecipeAllowed(r, c)) {
      warnings.push(
        `Den låste opskrift "${r.name}" passer ikke længere til dine restriktioner og er fjernet.`,
      );
      lockedMap.delete(`${l.day}:${l.slot}`);
      continue;
    }
    markUsed(r, 1);
  }

  const days: PlannedDay[] = [];
  const dayContexts: DayContext[] = [];
  for (let day = 0; day < numDays; day++) {
    const slotCount = new Map<MealSlot, number>();
    const violations: Violation[] = [];
    let meals: PlannedMeal[] = [];
    const candidatesPerSlot: PlannerRecipe[][] = [];
    const mealSlotIndex: number[] = [];

    slots.forEach((slot, i) => {
      const occurrence = slotCount.get(slot) ?? 0;
      slotCount.set(slot, occurrence + 1);
      const locked = occurrence === 0 ? lockedMap.get(`${day}:${slot}`) : undefined;
      if (locked) {
        meals.push({
          day,
          slot,
          recipeId: locked.recipeId,
          servings: locked.servings,
          householdServings: 0,
          locked: true,
        });
        mealSlotIndex.push(i);
        candidatesPerSlot.push([]);
        return;
      }
      const pool = allowed.filter((r) => r.mealTypes.includes(slot));
      const ctx: ScoreContext = {
        usedCounts,
        usedIngredients,
        slotKcal: input.targets.energyKcal * shares[i],
        slotProteinShare: proteinShare,
        seed,
        key: `${day}:${i}`,
        favoriteCuisines,
      };
      const ranked = pool
        .map((r) => ({ r, s: scoreCandidate(r, c, ctx) }))
        .sort((a, b) => b.s - a.s || a.r.id.localeCompare(b.r.id))
        .map((x) => x.r);
      candidatesPerSlot.push(ranked.slice(0, BUDGET_CANDIDATES));
      const pick = ranked[0];
      if (!pick) {
        violations.push({ code: "no_candidates", slot });
        return;
      }
      markUsed(pick, 1);
      mealSlotIndex.push(i);
      meals.push({
        day,
        slot,
        recipeId: pick.id,
        servings: 1,
        householdServings: 0,
        locked: false,
      });
    });

    const mealShares = mealSlotIndex.map((i) => shares[i]);
    meals = scalePortions(meals, recipeMap, input.targets, mealShares);
    let totals = dayTotals(meals, recipeMap);
    let dayViolations = validateDay(totals, input.targets, tol);

    // Bounded improvement: try single-slot swaps among top candidates.
    if (dayViolations.length > 0) {
      let bestDeviation = dayDeviation(totals, input.targets);
      for (let pass = 0; pass < 2; pass++) {
        let improved = false;
        meals.forEach((m, mi) => {
          if (m.locked) return;
          const candidates = (candidatesPerSlot[mealSlotIndex[mi]] ?? []).slice(0, 6);
          for (const cand of candidates) {
            if (cand.id === m.recipeId) continue;
            if ((usedCounts.get(cand.id) ?? 0) >= 2) continue;
            const trial = meals.map((x, xi) => (xi === mi ? { ...x, recipeId: cand.id } : x));
            const scaled = scalePortions(trial, recipeMap, input.targets, mealShares);
            const dev = dayDeviation(dayTotals(scaled, recipeMap), input.targets);
            if (dev < bestDeviation - 1e-9) {
              markUsed(recipeMap.get(m.recipeId)!, -1);
              markUsed(cand, 1);
              meals = scaled;
              bestDeviation = dev;
              improved = true;
              break;
            }
          }
        });
        if (!improved) break;
      }
      totals = dayTotals(meals, recipeMap);
      dayViolations = validateDay(totals, input.targets, tol);
    }

    const household = Math.max(1, c.householdSize);
    meals = meals.map((m) => ({ ...m, householdServings: m.servings + (household - 1) }));
    days.push({ day, meals, totals, violations: [...violations, ...dayViolations] });
    dayContexts.push({ candidatesPerSlot, mealSlotIndex, mealShares });
  }

  const budgetTarget = c.budgetTargetOre ?? c.weeklyBudgetOre;
  let budgetFit: MealPlanResult["budgetFit"];
  if (budgetTarget && budgetTarget > 0) {
    budgetFit = fitBudget(days, dayContexts, budgetTarget, {
      recipeMap,
      targets: input.targets,
      tolerances: tol,
      household: Math.max(1, c.householdSize),
      usedCounts,
      markUsed,
      basket: input.basket,
    });
  }

  let cost = 0;
  let unknown = 0;
  for (const d of days) {
    for (const m of d.meals) {
      const r = recipeMap.get(m.recipeId);
      if (r?.estimatedCostPerServingOre == null) unknown++;
      else cost += r.estimatedCostPerServingOre * m.householdServings;
    }
  }
  if (allowed.length < slots.length * 3) {
    warnings.push(
      "Der er få opskrifter, der passer til dine restriktioner, så madplanen gentager retter oftere.",
    );
  }

  return {
    algorithm: MEAL_PLANNER_ALGORITHM,
    seed,
    days,
    valid: days.every((d) => d.violations.length === 0),
    estimatedCostOre:
      unknown === days.reduce((a, d) => a + d.meals.length, 0) ? null : Math.round(cost),
    unknownCostMeals: unknown,
    budgetFit,
    warnings,
  };
}

/** How many ranked candidates per slot the budget search may swap in. */
const BUDGET_CANDIDATES = 15;

interface DayContext {
  candidatesPerSlot: PlannerRecipe[][];
  mealSlotIndex: number[];
  mealShares: number[];
}

interface BudgetContext {
  recipeMap: Map<string, PlannerRecipe>;
  targets: DailyTargets;
  tolerances: Tolerances;
  household: number;
  usedCounts: Map<string, number>;
  markUsed: (r: PlannerRecipe, delta: number) => void;
  basket?: BasketCostModel;
}

/** Distance from the budget target; going over counts three times as much as staying under. */
function budgetGap(cost: number, target: number): number {
  return cost > target ? 3 * (cost - target) : target - cost;
}

/**
 * The week's cost: the weekly basket cost when a basket model is given,
 * otherwise the sum of per-serving recipe estimates. Changes to one day are
 * evaluated incrementally.
 */
class WeekCost {
  private basket: WeekBasket | null = null;
  constructor(
    private days: PlannedDay[],
    private b: BudgetContext,
  ) {
    if (b.basket) {
      const basket = new WeekBasket(
        b.basket,
        weekNeeds(
          days.flatMap((d) => d.meals),
          b.basket,
        ),
      );
      if (basket.current()) this.basket = basket;
    }
  }

  private estimate(meals: PlannedMeal[]) {
    let cost = 0;
    for (const m of meals)
      cost +=
        (this.b.recipeMap.get(m.recipeId)?.estimatedCostPerServingOre ?? 0) * m.householdServings;
    return cost;
  }

  current(): { cost: number; complete: boolean } {
    if (this.basket) {
      const c = this.basket.current()!;
      return { cost: c.totalOre, complete: c.complete };
    }
    return { cost: this.estimate(this.days.flatMap((d) => d.meals)), complete: true };
  }

  /** Cost if day `di` had `meals` instead. */
  evaluate(di: number, meals: PlannedMeal[]): { cost: number; complete: boolean } {
    if (this.basket) {
      const c = this.basket.evaluate(needsDelta(this.days[di].meals, meals, this.b.basket!))!;
      return { cost: c.totalOre, complete: c.complete };
    }
    const all = this.days.flatMap((d, i) => (i === di ? meals : d.meals));
    return { cost: this.estimate(all), complete: true };
  }

  /** Call before replacing day `di`'s meals. */
  commit(di: number, meals: PlannedMeal[]) {
    this.basket?.apply(needsDelta(this.days[di].meals, meals, this.b.basket!));
  }
}

interface BudgetMove {
  day: number;
  meals: PlannedMeal[];
  cost: number;
  complete: boolean;
  gap: number;
  swap?: { from: string; to: PlannerRecipe };
}

/**
 * Greedy week-level search towards the budget target. Each step takes the move
 * that closes the gap the most: swapping one meal for another candidate
 * (portions rescaled), or moving a quarter serving from one meal of a day to
 * another (more of the cheap dish, less of the dear one). A move is only taken
 * if the day keeps the same or fewer nutrition violations and the basket does
 * not lose a store that can supply everything. Recipes without a known price
 * are never swapped in, and the weekly variety limit (two uses per recipe)
 * still applies.
 */
function fitBudget(
  days: PlannedDay[],
  contexts: DayContext[],
  target: number,
  b: BudgetContext,
): { targetOre: number; costOre: number } {
  const withHousehold = (meals: PlannedMeal[]) =>
    meals.map((m) => ({ ...m, householdServings: m.servings + (b.household - 1) }));
  const baseViolations = days.map(
    (d) => d.violations.filter((v) => v.code !== "no_candidates").length,
  );
  const week = new WeekCost(days, b);
  let { cost, complete } = week.current();

  for (let step = 0; step < 120; step++) {
    const gap = budgetGap(cost, target);
    if (gap <= target * 0.01) break;
    let best: BudgetMove | null = null;
    const consider = (di: number, meals: PlannedMeal[], swap?: BudgetMove["swap"]) => {
      const next = week.evaluate(di, meals);
      if (complete && !next.complete) return;
      const newGap = budgetGap(next.cost, target);
      if (newGap >= gap - 100 || (best && newGap >= best.gap)) return;
      const totals = dayTotals(meals, b.recipeMap);
      if (validateDay(totals, b.targets, b.tolerances).length > baseViolations[di]) return;
      best = { day: di, meals, cost: next.cost, complete: next.complete, gap: newGap, swap };
    };
    days.forEach((d, di) => {
      const ctx = contexts[di];
      d.meals.forEach((m, mi) => {
        if (m.locked) return;
        for (const cand of ctx.candidatesPerSlot[ctx.mealSlotIndex[mi]] ?? []) {
          if (cand.id === m.recipeId || cand.estimatedCostPerServingOre === null) continue;
          if ((b.usedCounts.get(cand.id) ?? 0) >= 2) continue;
          const trial = d.meals.map((x, xi) => (xi === mi ? { ...x, recipeId: cand.id } : x));
          consider(
            di,
            withHousehold(scalePortions(trial, b.recipeMap, b.targets, ctx.mealShares)),
            {
              from: m.recipeId,
              to: cand,
            },
          );
        }
        // Portion moves: a quarter serving more here, a quarter less on another meal (or none).
        for (let other = -1; other < d.meals.length; other++) {
          if (other === mi || (other >= 0 && d.meals[other].locked)) continue;
          for (const dir of [1, -1]) {
            const up = quantizeServings(m.servings + dir * SERVING_STEP);
            if (up === m.servings) continue;
            const trial = d.meals.map((x, xi) => {
              if (xi === mi) return { ...x, servings: up };
              if (xi === other)
                return { ...x, servings: quantizeServings(x.servings - dir * SERVING_STEP) };
              return x;
            });
            consider(di, withHousehold(trial));
          }
        }
      });
    });
    if (!best) break;
    const move = best as BudgetMove;
    const d = days[move.day];
    week.commit(move.day, move.meals);
    if (move.swap) {
      b.markUsed(b.recipeMap.get(move.swap.from)!, -1);
      b.markUsed(move.swap.to, 1);
    }
    d.meals = move.meals;
    d.totals = dayTotals(move.meals, b.recipeMap);
    d.violations = [
      ...d.violations.filter((v) => v.code === "no_candidates"),
      ...validateDay(d.totals, b.targets, b.tolerances),
    ];
    cost = move.cost;
    complete = move.complete;
  }
  return { targetOre: target, costOre: Math.round(cost) };
}

export function describeViolation(v: Violation): string {
  const r = (x: number) => Math.round(x);
  switch (v.code) {
    case "energy":
      return `Energi ${r(v.actual)} kcal mod mål ${r(v.target)} kcal`;
    case "protein_low":
      return `Protein ${r(v.actual)} g er under målet på ${r(v.target)} g`;
    case "carbohydrate":
      return `Kulhydrat ${r(v.actual)} g mod mål ${r(v.target)} g`;
    case "fat":
      return `Fedt ${r(v.actual)} g mod mål ${r(v.target)} g`;
    case "no_candidates":
      return `Ingen opskrifter passer til ${v.slot} med dine restriktioner`;
  }
}
