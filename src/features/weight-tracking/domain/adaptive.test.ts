import { describe, expect, it } from "vitest";
import { dailyWeights, linearRegression, smoothTrend } from "./trend";
import { goalTimeline, recommendCalories, type AdaptiveInput, type IntakeDay } from "./adaptive";

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const today = "2026-10-12";

/** Deterministic pseudo-noise in [-0.5, 0.5]. */
const noise = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1) - 0.5 * Math.sign(Math.sin(i));

function scenario(opts: {
  days: number;
  startKg: number;
  kgPerWeek: number;
  intake: number;
  noiseKg?: number;
  logEvery?: number;
  weighEvery?: number;
}): Pick<AdaptiveInput, "weighIns" | "intake"> {
  const weighIns = [];
  const intake: IntakeDay[] = [];
  for (let i = 0; i < opts.days; i++) {
    const date = addDays(today, -(opts.days - 1 - i));
    if (i % (opts.weighEvery ?? 1) === 0) {
      weighIns.push({
        measuredAt: `${date}T06:30:00Z`,
        weightKg: opts.startKg + (opts.kgPerWeek / 7) * i + (opts.noiseKg ?? 0) * noise(i),
      });
    }
    if (i % (opts.logEvery ?? 1) === 0) {
      intake.push({ date, energyKcal: opts.intake, entryCount: 3, markedComplete: false });
    }
  }
  return { weighIns, intake };
}

const base: Omit<AdaptiveInput, "weighIns" | "intake"> = {
  today,
  currentTargetKcal: 2200,
  priorTdeeKcal: 2700,
  bmrKcal: 1750,
  goal: "fat_loss",
  weeklyRatePercent: 0.5,
  currentWeightKg: 85,
  goalWeightKg: 78,
  lastRecommendationDate: null,
};

describe("trend", () => {
  it("averages multiple weigh-ins per day", () => {
    const d = dailyWeights([
      { measuredAt: "2026-10-01T05:00:00Z", weightKg: 80 },
      { measuredAt: "2026-10-01T18:00:00Z", weightKg: 81 },
    ]);
    expect(d).toEqual([{ date: "2026-10-01", weightKg: 80.5, count: 2 }]);
  });

  it("dampens a single outlier", () => {
    const days = [80, 80, 80, 83, 80].map((w, i) => ({ date: addDays("2026-10-01", i), weightKg: w, count: 1 }));
    const t = smoothTrend(days);
    expect(t[3].trendKg).toBeCloseTo(80.3);
  });

  it("regression recovers a known slope", () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ date: addDays("2026-10-01", i), value: 80 - 0.1 * i }));
    expect(linearRegression(pts)!.slopePerDay).toBeCloseTo(-0.1);
  });
});

describe("adaptive recommendation", () => {
  it("keeps the target with too little data", () => {
    const rec = recommendCalories({ ...base, ...scenario({ days: 7, startKg: 85, kgPerWeek: -0.4, intake: 2200 }) });
    expect(rec.decision).toBe("keep");
    expect(rec.keepReasons).toEqual(expect.arrayContaining(["insufficient_span", "insufficient_weigh_ins"]));
    expect(rec.recommendedTargetKcal).toBe(2200);
  });

  it("keeps the target when food logs are incomplete", () => {
    const rec = recommendCalories({ ...base, ...scenario({ days: 21, startKg: 85, kgPerWeek: -0.4, intake: 2200, logEvery: 2 }) });
    expect(rec.decision).toBe("keep");
    expect(rec.keepReasons).toContain("incomplete_food_logs");
  });

  it("keeps the target when it is too soon after the last recommendation", () => {
    const rec = recommendCalories({
      ...base,
      lastRecommendationDate: addDays(today, -3),
      ...scenario({ days: 21, startKg: 85, kgPerWeek: -0.4, intake: 2200 }),
    });
    expect(rec.keepReasons).toContain("too_soon");
  });

  it("lowers the target conservatively when weight is stable on a deficit target", () => {
    // Weight flat at 2200 kcal → TDEE ≈ 2200, goal deficit ≈ 425 → wants ~1775, capped to −150.
    const rec = recommendCalories({ ...base, ...scenario({ days: 21, startKg: 85, kgPerWeek: 0, intake: 2200, noiseKg: 0.6 }) });
    expect(rec.decision).toBe("adjust");
    expect(rec.recommendedTargetKcal).toBe(2050);
    expect(rec.explanation.join(" ")).toContain("begrænset");
    expect(rec.observedTdeeKcal).toBeGreaterThan(1900);
    expect(rec.observedTdeeKcal).toBeLessThan(2500);
  });

  it("keeps the target when progress matches the plan", () => {
    // Losing ≈ 0.425 kg/week at 2200 kcal → observed TDEE ≈ 2670, target ≈ 2245 → change < 50.
    const rec = recommendCalories({
      ...base,
      priorTdeeKcal: 2650,
      ...scenario({ days: 21, startKg: 85, kgPerWeek: -0.425, intake: 2200, noiseKg: 0.3 }),
    });
    expect(rec.decision).toBe("keep");
    expect(rec.keepReasons).toContain("change_too_small");
  });

  it("rejects implausible estimates", () => {
    // Huge apparent loss with high logged intake → TDEE far above prior.
    const rec = recommendCalories({ ...base, ...scenario({ days: 21, startKg: 90, kgPerWeek: -3, intake: 3000 }) });
    expect(rec.decision).toBe("keep");
    expect(rec.keepReasons).toContain("implausible_estimate");
  });

  it("is robust to noisy daily weights", () => {
    const rec = recommendCalories({ ...base, ...scenario({ days: 21, startKg: 85, kgPerWeek: 0, intake: 2200, noiseKg: 2 }) });
    expect(Math.abs(rec.recommendedTargetKcal - base.currentTargetKcal)).toBeLessThanOrEqual(150);
  });

  it("respects the calorie floor", () => {
    const rec = recommendCalories({
      ...base,
      currentTargetKcal: 1300,
      priorTdeeKcal: 1500,
      bmrKcal: 1250,
      ...scenario({ days: 28, startKg: 60, kgPerWeek: 0, intake: 1300 }),
    });
    expect(rec.recommendedTargetKcal).toBeGreaterThanOrEqual(1250);
  });
});

describe("goal timeline", () => {
  it("gives a range from the planned rate", () => {
    const t = goalTimeline(85, 80, null, null, -0.5)!;
    expect(t.basis).toBe("planned_rate");
    expect(t.weeksLow).toBeLessThan(t.weeksHigh);
  });
  it("returns null when moving away from goal", () => {
    expect(goalTimeline(85, 80, 0.3, 0.05, 0.25)).toBeNull();
  });
});
