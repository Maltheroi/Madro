import { describe, expect, it } from "vitest";
import { convert, toBase, toGrams } from "./units";
import { roundDisplayGrams, roundKcal, roundTargetKcal, roundTo } from "./rounding";
import {
  calculateMacros,
  estimateEnergy,
  kcalFromMacros,
  mifflinStJeorBmr,
  type EnergyInput,
} from "./energy";
import {
  calculateRecipeNutrition,
  type IngredientNutritionData,
  type NutrientValues,
} from "./recipe-nutrition";
import { averageOfLoggedDays, compareToTargets, dailyTotals, dateRange } from "./intake";

describe("units", () => {
  it("converts within dimensions exactly", () => {
    expect(toBase(2, "dl")).toEqual({ dimension: "volume", value: 200 });
    expect(toBase(1.5, "kg")).toEqual({ dimension: "mass", value: 1500 });
    expect(convert(3, "tsk", "spsk")).toBe(1);
    expect(convert(250, "ml", "l")).toBe(0.25);
  });

  it("needs density for volume → mass and returns null without it", () => {
    expect(toGrams(100, "ml")).toBeNull();
    expect(toGrams(100, "ml", { densityGPerMl: 0.92 })).toBeCloseTo(92);
    expect(toGrams(1, "spsk", { densityGPerMl: 0.92 })).toBeCloseTo(13.8);
  });

  it("needs piece weight for stk", () => {
    expect(toGrams(2, "stk")).toBeNull();
    expect(toGrams(2, "stk", { gramsPerPiece: 55 })).toBe(110);
    expect(convert(110, "g", "stk", { gramsPerPiece: 55 })).toBe(2);
  });

  it("rejects negative quantities", () => {
    expect(() => toBase(-1, "g")).toThrow(RangeError);
  });
});

describe("rounding", () => {
  it("rounds half away from zero, robust to float error", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-2.5)).toBe(-3);
    expect(roundKcal(412.5)).toBe(413);
    expect(roundTargetKcal(2187)).toBe(2190);
  });
  it("display grams", () => {
    expect(roundDisplayGrams(42.4)).toBe(42);
    expect(roundDisplayGrams(237)).toBe(235);
  });
});

const base: EnergyInput = {
  ageYears: 30,
  heightCm: 180,
  weightKg: 80,
  sex: "male",
  activityLevel: "moderate",
  goal: "maintenance",
};

describe("energy", () => {
  it("implements Mifflin-St Jeor", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(mifflinStJeorBmr(base)).toBe(1780);
    // female: 10*60 + 6.25*165 - 5*40 - 161 = 1270.25
    expect(mifflinStJeorBmr({ weightKg: 60, heightCm: 165, ageYears: 40, sex: "female" })).toBe(
      1270.25,
    );
  });

  it("maintenance target equals TDEE rounded to 10 kcal", () => {
    const e = estimateEnergy(base);
    expect(e.tdeeKcal).toBe(Math.round(1780 * 1.55));
    expect(e.targetKcal).toBe(2760);
    expect(e.kind).toBe("estimate");
  });

  it("fat loss at 0.5 %/week gives ≈ 440 kcal deficit", () => {
    const e = estimateEnergy({ ...base, goal: "fat_loss", weeklyRatePercent: 0.5 });
    expect(e.requestedDeltaKcal).toBe(-440);
    expect(e.targetKcal).toBe(roundTargetKcal(1780 * 1.55 - 440));
  });

  it("clamps extreme rates and caps deficits", () => {
    const e = estimateEnergy({ ...base, goal: "fat_loss", weeklyRatePercent: 3 });
    expect(e.notes.some((n) => n.code === "rate_clamped")).toBe(true);
    // 1 %/week of 80 kg = 0.8 kg = 880 kcal/day, which exceeds 25 % of TDEE (690)
    expect(e.notes.some((n) => n.code === "deficit_capped")).toBe(true);
    expect(e.targetKcal).toBeGreaterThanOrEqual(roundTargetKcal(1780 * 1.55 * 0.75) - 10);
  });

  it("never goes below the calorie floor for small sedentary users", () => {
    const e = estimateEnergy({
      ageYears: 70,
      heightCm: 150,
      weightKg: 48,
      sex: "female",
      activityLevel: "sedentary",
      goal: "fat_loss",
      weeklyRatePercent: 1,
    });
    // TDEE (≈1088) is already below the 1200 kcal floor, so the target stays
    // at estimated maintenance instead of prescribing any deficit.
    expect(e.targetKcal).toBe(roundTargetKcal(e.tdeeKcal));
    expect(e.notes.some((n) => n.code === "calorie_floor")).toBe(true);
  });

  it("supports muscle gain with a surplus", () => {
    const e = estimateEnergy({ ...base, goal: "muscle_gain" });
    expect(e.appliedDeltaKcal).toBeGreaterThan(0);
  });

  it("macros add up to roughly the target", () => {
    const e = estimateEnergy({ ...base, goal: "fat_loss" });
    expect(Math.abs(kcalFromMacros(e.macros) - e.targetKcal)).toBeLessThan(20);
    expect(e.macros.proteinG).toBe(160);
  });

  it("caps protein reference weight at BMI 27", () => {
    const notes: never[] = [];
    const m = calculateMacros(2400, { weightKg: 130, heightCm: 170, goal: "fat_loss" }, notes);
    expect(m.proteinG).toBe(Math.round(2 * 27 * 1.7 * 1.7));
  });

  it("rejects minors", () => {
    expect(() => estimateEnergy({ ...base, ageYears: 16 })).toThrow();
  });
});

const nv = (p: Partial<NutrientValues>): NutrientValues => ({
  energyKcal: null,
  proteinG: null,
  carbohydrateG: null,
  fatG: null,
  fiberG: null,
  sugarsG: null,
  saturatedFatG: null,
  saltG: null,
  ...p,
});

const ingredients = new Map<string, IngredientNutritionData>([
  [
    "pasta",
    {
      ingredientId: "pasta",
      name: "Pasta",
      cookedYieldFactor: 2.5,
      facts: [
        {
          state: "dried",
          sourceId: "s",
          confidence: "medium",
          per100g: nv({ energyKcal: 350, proteinG: 12, carbohydrateG: 70, fatG: 2, fiberG: 3 }),
        },
      ],
    },
  ],
  [
    "oil",
    {
      ingredientId: "oil",
      name: "Olie",
      densityGPerMl: 0.92,
      facts: [
        {
          state: "as_sold",
          sourceId: "s",
          confidence: "high",
          per100g: nv({ energyKcal: 900, proteinG: 0, carbohydrateG: 0, fatG: 100 }),
        },
      ],
    },
  ],
  ["mystery", { ingredientId: "mystery", name: "Ukendt", facts: [] }],
]);

describe("recipe nutrition", () => {
  it("sums nutrients from quantities and divides by servings", () => {
    const r = calculateRecipeNutrition(
      [
        { ingredientId: "pasta", quantity: 400, unit: "g", state: "dried" },
        { ingredientId: "oil", quantity: 2, unit: "spsk", state: "raw" },
      ],
      4,
      ingredients,
    );
    // pasta 400 g → 1400 kcal; oil 30 ml × 0.92 = 27.6 g → 248.4 kcal
    expect(r.totals.energyKcal).toBeCloseTo(1648.4);
    expect(r.perServing.energyKcal).toBeCloseTo(412.1);
    expect(r.totals.fatG).toBeCloseTo(8 + 27.6);
    expect(r.incompleteNutrients).toContain("fiberG");
    expect(r.incompleteNutrients).not.toContain("energyKcal");
  });

  it("converts cooked quantities to the dried basis using the yield factor", () => {
    const r = calculateRecipeNutrition(
      [{ ingredientId: "pasta", quantity: 250, unit: "g", state: "cooked" }],
      1,
      ingredients,
    );
    expect(r.totals.energyKcal).toBeCloseTo(350); // 250 g cooked = 100 g dried
  });

  it("flags missing data instead of inventing it", () => {
    const r = calculateRecipeNutrition(
      [
        { ingredientId: "pasta", quantity: 100, unit: "g", state: "dried" },
        { ingredientId: "mystery", quantity: 50, unit: "g", state: "raw" },
        { ingredientId: "pasta", quantity: 1, unit: "stk", state: "dried" },
      ],
      1,
      ingredients,
    );
    expect(r.issues.map((i) => i.reason)).toEqual(
      expect.arrayContaining(["no_facts", "unit_not_convertible"]),
    );
    expect(r.incompleteNutrients).toContain("energyKcal");
    expect(r.confidence).toBe("low");
    expect(r.completeness).toBeCloseTo(1 / 3);
    expect(r.totals.energyKcal).toBeCloseTo(350);
  });

  it("rejects zero servings", () => {
    expect(() => calculateRecipeNutrition([], 0, ingredients)).toThrow();
  });
});

describe("intake", () => {
  const entries = [
    { date: "2026-10-01", energyKcal: 500, proteinG: 30, carbohydrateG: 50, fatG: 20 },
    { date: "2026-10-01", energyKcal: 700, proteinG: 40, carbohydrateG: 60, fatG: 30 },
    { date: "2026-10-03", energyKcal: 2000, proteinG: 120, carbohydrateG: 200, fatG: 70 },
  ];

  it("groups by day", () => {
    const days = dailyTotals(entries);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ date: "2026-10-01", energyKcal: 1200, entryCount: 2 });
  });

  it("averages only logged days", () => {
    const avg = averageOfLoggedDays(dailyTotals(entries));
    expect(avg.loggedDays).toBe(2);
    expect(avg.energyKcal).toBe(1600);
  });

  it("compares to targets", () => {
    const diff = compareToTargets(
      { energyKcal: 1800, proteinG: 100, carbohydrateG: 200, fatG: 60 },
      { energyKcal: 2000, proteinG: 150, carbohydrateG: 200, fatG: 60 },
    );
    expect(diff[0]).toMatchObject({ key: "energyKcal", difference: -200, ratio: 0.9 });
  });

  it("builds date ranges across month ends", () => {
    expect(dateRange("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });
});
