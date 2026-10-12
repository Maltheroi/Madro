import { describe, expect, it } from "vitest";
import {
  generateMealPlan,
  isRecipeAllowed,
  quantizeServings,
  slotsForMealsPerDay,
  type PlannerConstraints,
  type PlannerRecipe,
} from "./planner";

const r = (
  id: string,
  mealTypes: PlannerRecipe["mealTypes"],
  kcal: number,
  p: number,
  c: number,
  f: number,
  extra: Partial<PlannerRecipe> = {},
): PlannerRecipe => ({
  id,
  name: id,
  mealTypes,
  perServing: { energyKcal: kcal, proteinG: p, carbohydrateG: c, fatG: f },
  allergens: [],
  ingredientIds: [id + "-ing", "shared"],
  dietTags: ["vegetarian", "pescetarian"],
  totalTimeMinutes: 20,
  estimatedCostPerServingOre: 2000,
  nutritionCompleteness: 1,
  ...extra,
});

const recipes: PlannerRecipe[] = [
  r("havregrod", ["breakfast"], 450, 25, 60, 12),
  r("skyr-bowl", ["breakfast", "snack"], 350, 30, 40, 6),
  r("aeggemad", ["breakfast", "lunch"], 500, 30, 40, 22, { allergens: ["egg", "gluten"] }),
  r("kyllingesalat", ["lunch"], 550, 45, 40, 20, { dietTags: [] }),
  r("linsesuppe", ["lunch", "dinner"], 500, 28, 65, 12, { dietTags: ["vegan", "vegetarian", "pescetarian"] }),
  r("laks-ris", ["dinner"], 700, 45, 70, 25, { dietTags: ["pescetarian"], allergens: ["fish"] }),
  r("kylling-pasta", ["dinner"], 750, 50, 85, 18, { dietTags: [], allergens: ["gluten"] }),
  r("chili-sin-carne", ["dinner", "lunch"], 650, 35, 80, 15, { dietTags: ["vegan", "vegetarian", "pescetarian"] }),
  r("frugt-noedder", ["snack"], 250, 7, 25, 14, { allergens: ["nuts"] }),
];

const constraints: PlannerConstraints = {
  allergens: [],
  excludedIngredientIds: [],
  dislikedIngredientIds: [],
  diet: "omnivore",
  maxCookingMinutes: null,
  favoriteRecipeIds: [],
  mealsPerDay: 3,
  householdSize: 1,
  weeklyBudgetOre: null,
};

const targets = { energyKcal: 2200, proteinG: 140, carbohydrateG: 230, fatG: 70 };

describe("meal planner", () => {
  it("maps meals per day to slots", () => {
    expect(slotsForMealsPerDay(2)).toEqual(["lunch", "dinner"]);
    expect(slotsForMealsPerDay(4)).toHaveLength(4);
    expect(slotsForMealsPerDay(9)).toHaveLength(5);
  });

  it("quantizes servings to 0.25 steps within 0.5–2", () => {
    expect(quantizeServings(1.13)).toBe(1.25);
    expect(quantizeServings(0.1)).toBe(0.5);
    expect(quantizeServings(5)).toBe(2);
  });

  it("treats allergies and diet as hard constraints", () => {
    const c = { ...constraints, allergens: ["gluten"], diet: "vegetarian" as const };
    expect(isRecipeAllowed(recipes[2], c)).toBe(false);
    expect(isRecipeAllowed(recipes[3], c)).toBe(false);
    expect(isRecipeAllowed(recipes[4], c)).toBe(true);
    const plan = generateMealPlan({ recipes, constraints: c, targets, seed: 3 });
    const used = plan.days.flatMap((d) => d.meals.map((m) => m.recipeId));
    expect(used).not.toContain("aeggemad");
    expect(used).not.toContain("kylling-pasta");
    expect(used).not.toContain("kyllingesalat");
  });

  it("produces 7 days with daily energy close to target", () => {
    const plan = generateMealPlan({ recipes, constraints, targets, seed: 1 });
    expect(plan.days).toHaveLength(7);
    for (const d of plan.days) {
      expect(d.meals).toHaveLength(3);
      expect(Math.abs(d.totals.energyKcal - targets.energyKcal) / targets.energyKcal).toBeLessThan(0.1);
    }
  });

  it("is deterministic for a seed and varies across seeds", () => {
    const a = generateMealPlan({ recipes, constraints, targets, seed: 42 });
    const b = generateMealPlan({ recipes, constraints, targets, seed: 42 });
    expect(a).toEqual(b);
    const ids = (p: typeof a) => p.days.map((d) => d.meals.map((m) => m.recipeId).join()).join("|");
    const seeds = [1, 2, 3, 4, 5].map((s) => ids(generateMealPlan({ recipes, constraints, targets, seed: s })));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it("keeps locked meals", () => {
    const plan = generateMealPlan({
      recipes,
      constraints,
      targets,
      locked: [{ day: 2, slot: "dinner", recipeId: "laks-ris", servings: 1.5 }],
    });
    const meal = plan.days[2].meals.find((m) => m.slot === "dinner")!;
    expect(meal).toMatchObject({ recipeId: "laks-ris", servings: 1.5, locked: true });
  });

  it("drops locked meals that now violate an allergy", () => {
    const plan = generateMealPlan({
      recipes,
      constraints: { ...constraints, allergens: ["fish"] },
      targets,
      locked: [{ day: 0, slot: "dinner", recipeId: "laks-ris", servings: 1 }],
    });
    expect(plan.days[0].meals.find((m) => m.slot === "dinner")!.recipeId).not.toBe("laks-ris");
    expect(plan.warnings.join()).toContain("laks-ris");
  });

  it("reports violations instead of hiding them", () => {
    const plan = generateMealPlan({
      recipes,
      constraints,
      targets: { energyKcal: 2200, proteinG: 400, carbohydrateG: 230, fatG: 70 },
    });
    expect(plan.valid).toBe(false);
    expect(plan.days[0].violations.some((v) => v.code === "protein_low")).toBe(true);
  });

  it("reports slots with no eligible recipe", () => {
    const plan = generateMealPlan({
      recipes,
      constraints: { ...constraints, diet: "vegan", mealsPerDay: 3 },
      targets,
    });
    expect(plan.days[0].violations.some((v) => v.code === "no_candidates")).toBe(true);
  });

  it("scales household servings", () => {
    const plan = generateMealPlan({ recipes, constraints: { ...constraints, householdSize: 3 }, targets });
    for (const m of plan.days[0].meals) expect(m.householdServings).toBe(m.servings + 2);
  });
});
