import { describe, expect, it } from "vitest";
import { basketCost, cheapestPackages, weekNeeds, type BasketCostModel } from "./basket-cost";
import { planTowardsBudget } from "./budget";
import { generateMealPlan, type MealPlanResult, type PlannerRecipe } from "./planner";

const recipe = (
  id: string,
  mealTypes: PlannerRecipe["mealTypes"],
  costOre: number,
): PlannerRecipe => ({
  id,
  name: id,
  mealTypes,
  // Identical nutrition, so only cost separates the recipes.
  perServing: { energyKcal: 700, proteinG: 45, carbohydrateG: 75, fatG: 22 },
  allergens: [],
  ingredientIds: [id],
  dietTags: [],
  totalTimeMinutes: 20,
  estimatedCostPerServingOre: costOre,
  nutritionCompleteness: 1,
});

// Eight recipes per slot from 10 kr to 80 kr a serving.
const recipes = (["breakfast", "lunch", "dinner"] as const).flatMap((slot) =>
  [1, 2, 3, 4, 5, 6, 7, 8].map((i) => recipe(`${slot}-${i}`, [slot], i * 1000)),
);
const targets = { energyKcal: 2100, proteinG: 135, carbohydrateG: 225, fatG: 66 };
const constraints = {
  allergens: [],
  excludedIngredientIds: [],
  dislikedIngredientIds: [],
  diet: "omnivore" as const,
  maxCookingMinutes: null,
  favoriteRecipeIds: [],
  mealsPerDay: 3,
  householdSize: 1,
};

const plan = (budgetKr: number | null) =>
  generateMealPlan({
    recipes,
    targets,
    seed: 3,
    constraints: { ...constraints, weeklyBudgetOre: budgetKr === null ? null : budgetKr * 100 },
  });

describe("weekly budget", () => {
  it("lands close to the budget without going over", () => {
    for (const budget of [700, 1000, 1400]) {
      const r = plan(budget);
      expect(r.estimatedCostOre).toBeLessThanOrEqual(budget * 100);
      expect(r.estimatedCostOre).toBeGreaterThanOrEqual(budget * 100 * 0.95);
      expect(r.valid).toBe(true);
    }
  });

  it("gets as cheap as it can when the budget is out of reach", () => {
    const r = plan(100);
    // 21 meals, at most two per recipe: the cheapest possible week is well above 100 kr.
    expect(r.estimatedCostOre).toBeLessThan(plan(null).estimatedCostOre!);
    expect(r.valid).toBe(true);
  });

  it("never swaps in recipes without a price", () => {
    const unpriced = recipes.map((x) =>
      x.id.endsWith("-1") ? { ...x, estimatedCostPerServingOre: null } : x,
    );
    const unpricedMeals = (weeklyBudgetOre: number | null) =>
      generateMealPlan({
        recipes: unpriced,
        targets,
        seed: 3,
        constraints: { ...constraints, weeklyBudgetOre },
      })
        .days.flatMap((d) => d.meals)
        .filter((m) => m.recipeId.endsWith("-1")).length;
    // Unpriced recipes look free, but the budget search must not reach for them.
    expect(unpricedMeals(10_000)).toBeLessThanOrEqual(unpricedMeals(null));
  });
});

describe("whole-package basket cost", () => {
  const model: BasketCostModel = {
    needsPerServing: new Map([
      ["a", new Map([["ris:mass", 100]])],
      [
        "b",
        new Map([
          ["ris:mass", 100],
          ["kylling:mass", 150],
        ]),
      ],
    ]),
    stores: [
      new Map([
        ["ris:mass", [{ size: 1000, priceOre: 1500 }]],
        ["kylling:mass", [{ size: 500, priceOre: 4000 }]],
      ]),
      // Cheaper rice but no chicken: never the complete basket.
      new Map([["ris:mass", [{ size: 1000, priceOre: 1000 }]]]),
    ],
    pantry: new Map([["kylling:mass", 200]]),
  };

  it("buys whole packages", () => {
    expect(cheapestPackages([{ size: 500, priceOre: 4000 }], 501)).toBe(8000);
    expect(
      cheapestPackages(
        [
          { size: 500, priceOre: 4000 },
          { size: 1000, priceOre: 6000 },
        ],
        600,
      ),
    ).toBe(6000);
  });

  it("sums needs, subtracts the pantry and picks the cheapest complete store", () => {
    const needs = weekNeeds(
      [
        { recipeId: "a", householdServings: 4 },
        { recipeId: "b", householdServings: 4 },
      ],
      model,
    );
    expect(needs.get("ris:mass")).toBe(800);
    // 600 g chicken − 200 g in the pantry = 400 g: one package.
    expect(basketCost(needs, model)).toEqual({ totalOre: 1500 + 4000, complete: true });
  });
});

describe("planTowardsBudget", () => {
  const fake = (cost: number) => ({ estimatedCostOre: cost }) as MealPlanResult;

  it("lowers the planner's target until the basket fits", () => {
    // The basket costs 1.5× what the planner aims at (package overhead).
    const targetsTried: number[] = [];
    const { result, basketTotalOre } = planTowardsBudget(
      (t) => (targetsTried.push(t), fake(t)),
      30_000,
      (r) => Math.round(r.estimatedCostOre! * 1.5),
    );
    expect(targetsTried[0]).toBe(30_000);
    expect(basketTotalOre).toBeLessThanOrEqual(30_000);
    expect(basketTotalOre).toBeGreaterThanOrEqual(29_000);
    expect(result.estimatedCostOre).toBeLessThan(30_000);
  });

  it("returns the cheapest result when nothing fits", () => {
    const { basketTotalOre } = planTowardsBudget(
      (t) => fake(t),
      30_000,
      (r) => Math.max(50_000, r.estimatedCostOre!),
    );
    expect(basketTotalOre).toBe(50_000);
  });

  it("skips calibration without prices", () => {
    const { basketTotalOre } = planTowardsBudget(fake, 30_000, () => null);
    expect(basketTotalOre).toBeNull();
  });
});
