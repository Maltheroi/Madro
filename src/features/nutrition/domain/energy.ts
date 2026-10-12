/**
 * Energy and macronutrient target estimation.
 *
 * Algorithm: "initial-targets" v1 (docs/ARCHITECTURE.md#nutrition-engine).
 *   1. BMR with the Mifflin-St Jeor equation (Mifflin et al., 1990).
 *   2. TDEE = BMR × activity factor (standard FAO/WHO-style factors).
 *   3. Goal adjustment from the desired weekly rate, assuming ≈7 700 kcal per kg
 *      of body-mass change, then clamped by safety guardrails.
 *   4. Protein from g/kg of a reference body weight, fat as a share of energy
 *      with a g/kg floor, carbohydrates as the remainder.
 *
 * Every value returned here is an ESTIMATE, not a measurement. The adaptive
 * engine (weight-tracking/domain/adaptive.ts) later replaces the TDEE estimate
 * with one inferred from the user's own data when the data supports it.
 */

import { roundTargetKcal, roundTo } from "./rounding";

export const INITIAL_TARGETS_ALGORITHM = { key: "initial-targets", version: "1.0.0" } as const;

export const KCAL_PER_KG_BODY_MASS = 7700;
export const KCAL_PER_G = { protein: 4, carbohydrate: 4, fat: 9 } as const;

/** Sex used only for the BMR equation. "unspecified" averages the two constants. */
export type CalculationSex = "female" | "male" | "unspecified";

export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const GOALS = ["fat_loss", "maintenance", "muscle_gain", "recomposition"] as const;
export type Goal = (typeof GOALS)[number];

/** Allowed weekly rate of change, as a percentage of body weight. */
export const RATE_LIMITS: Record<Goal, { min: number; max: number; default: number }> = {
  fat_loss: { min: 0.1, max: 1.0, default: 0.5 },
  muscle_gain: { min: 0.1, max: 0.5, default: 0.25 },
  maintenance: { min: 0, max: 0, default: 0 },
  recomposition: { min: 0, max: 0, default: 0 },
};

export interface EnergyInput {
  ageYears: number;
  heightCm: number;
  weightKg: number;
  sex: CalculationSex;
  activityLevel: ActivityLevel;
  goal: Goal;
  /** Desired weekly change as % of body weight (positive number). */
  weeklyRatePercent?: number | null;
  goalWeightKg?: number | null;
  trainingDaysPerWeek?: number | null;
}

export interface MacroTargets {
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
}

export interface EnergyEstimate {
  algorithm: typeof INITIAL_TARGETS_ALGORITHM;
  bmrKcal: number;
  tdeeKcal: number;
  targetKcal: number;
  /** Daily energy delta applied to TDEE before guardrails (negative = deficit). */
  requestedDeltaKcal: number;
  appliedDeltaKcal: number;
  macros: MacroTargets;
  /** Guardrails or assumptions that changed the outcome, for the explanation. */
  notes: EstimateNote[];
  kind: "estimate";
}

export type EstimateNote =
  | { code: "sex_unspecified" }
  | { code: "rate_clamped"; requested: number; applied: number }
  | { code: "deficit_capped"; maxDeficitKcal: number }
  | { code: "surplus_capped"; maxSurplusKcal: number }
  | { code: "calorie_floor"; floorKcal: number }
  | { code: "protein_reference_weight"; referenceWeightKg: number }
  | { code: "fat_reduced_for_floor" };

/** Guardrails, documented in docs/ARCHITECTURE.md#safety-guardrails. */
export const GUARDRAILS = {
  /** Largest deficit as a fraction of TDEE. */
  maxDeficitFraction: 0.25,
  /** Largest surplus as a fraction of TDEE. */
  maxSurplusFraction: 0.15,
  /** Absolute minimum recommended intake. */
  absoluteFloorKcal: 1200,
  /** Recomposition uses a small deficit. */
  recompositionDeficitFraction: 0.05,
  /** Fat never below this many g per kg body weight. */
  minFatGPerKg: 0.6,
  fatEnergyShare: 0.27,
} as const;

export function validateEnergyInput(input: EnergyInput): void {
  const { ageYears, heightCm, weightKg } = input;
  if (!(ageYears >= 18 && ageYears <= 100)) {
    throw new RangeError("Beregningen understøtter kun voksne mellem 18 og 100 år.");
  }
  if (!(heightCm >= 120 && heightCm <= 230)) throw new RangeError("Ugyldig højde.");
  if (!(weightKg >= 35 && weightKg <= 300)) throw new RangeError("Ugyldig vægt.");
}

/** Mifflin-St Jeor resting energy expenditure in kcal/day. */
export function mifflinStJeorBmr(
  input: Pick<EnergyInput, "ageYears" | "heightCm" | "weightKg" | "sex">,
): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears;
  const sexConstant = input.sex === "male" ? 5 : input.sex === "female" ? -161 : -78;
  return base + sexConstant;
}

export function estimateTdee(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[activityLevel];
}

/** Reference weight for protein: caps at BMI 27 so protein is not inflated at high body mass. */
export function proteinReferenceWeightKg(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.min(weightKg, 27 * heightM * heightM);
}

export const PROTEIN_G_PER_KG: Record<Goal, number> = {
  fat_loss: 2.0,
  recomposition: 2.0,
  muscle_gain: 1.8,
  maintenance: 1.6,
};

export function calculateMacros(
  targetKcal: number,
  input: Pick<EnergyInput, "weightKg" | "heightCm" | "goal">,
  notes: EstimateNote[] = [],
): MacroTargets {
  const refWeight = proteinReferenceWeightKg(input.weightKg, input.heightCm);
  if (refWeight < input.weightKg) {
    notes.push({ code: "protein_reference_weight", referenceWeightKg: roundTo(refWeight, 1) });
  }
  const proteinG = PROTEIN_G_PER_KG[input.goal] * refWeight;
  const minFatG = GUARDRAILS.minFatGPerKg * refWeight;
  let fatG = Math.max((targetKcal * GUARDRAILS.fatEnergyShare) / KCAL_PER_G.fat, minFatG);
  let carbKcal = targetKcal - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat;
  if (carbKcal < 0) {
    // Low targets: drop fat to its floor before letting carbohydrates go negative.
    fatG = minFatG;
    notes.push({ code: "fat_reduced_for_floor" });
    carbKcal = Math.max(0, targetKcal - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat);
  }
  return {
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbohydrateG: Math.round(carbKcal / KCAL_PER_G.carbohydrate),
  };
}

export function estimateEnergy(input: EnergyInput): EnergyEstimate {
  validateEnergyInput(input);
  const notes: EstimateNote[] = [];
  if (input.sex === "unspecified") notes.push({ code: "sex_unspecified" });

  const bmr = mifflinStJeorBmr(input);
  const tdee = estimateTdee(bmr, input.activityLevel);

  let requestedDelta = 0;
  if (input.goal === "fat_loss" || input.goal === "muscle_gain") {
    const limits = RATE_LIMITS[input.goal];
    const requested = input.weeklyRatePercent ?? limits.default;
    const rate = Math.min(limits.max, Math.max(limits.min, requested));
    if (rate !== requested) notes.push({ code: "rate_clamped", requested, applied: rate });
    const kgPerWeek = (rate / 100) * input.weightKg;
    const daily = (kgPerWeek * KCAL_PER_KG_BODY_MASS) / 7;
    requestedDelta = input.goal === "fat_loss" ? -daily : daily;
  } else if (input.goal === "recomposition") {
    requestedDelta = -tdee * GUARDRAILS.recompositionDeficitFraction;
  }

  let delta = requestedDelta;
  const maxDeficit = tdee * GUARDRAILS.maxDeficitFraction;
  const maxSurplus = tdee * GUARDRAILS.maxSurplusFraction;
  if (delta < -maxDeficit) {
    delta = -maxDeficit;
    notes.push({ code: "deficit_capped", maxDeficitKcal: Math.round(maxDeficit) });
  }
  if (delta > maxSurplus) {
    delta = maxSurplus;
    notes.push({ code: "surplus_capped", maxSurplusKcal: Math.round(maxSurplus) });
  }

  let target = tdee + delta;
  const floor = Math.max(GUARDRAILS.absoluteFloorKcal, bmr);
  if (target < floor && input.goal !== "muscle_gain") {
    target = Math.min(floor, tdee);
    notes.push({ code: "calorie_floor", floorKcal: Math.round(floor) });
  }
  const targetKcal = roundTargetKcal(target);

  return {
    algorithm: INITIAL_TARGETS_ALGORITHM,
    bmrKcal: Math.round(bmr),
    tdeeKcal: Math.round(tdee),
    targetKcal,
    requestedDeltaKcal: Math.round(requestedDelta),
    appliedDeltaKcal: Math.round(targetKcal - tdee),
    macros: calculateMacros(targetKcal, input, notes),
    notes,
    kind: "estimate",
  };
}

/** Energy implied by macros (for showing how targets add up). */
export function kcalFromMacros(m: MacroTargets): number {
  return (
    m.proteinG * KCAL_PER_G.protein +
    m.carbohydrateG * KCAL_PER_G.carbohydrate +
    m.fatG * KCAL_PER_G.fat
  );
}

/** Danish explanation lines for estimate notes. */
export function describeNote(note: EstimateNote): string {
  switch (note.code) {
    case "sex_unspecified":
      return "Køn er ikke oplyst, så beregningen bruger et gennemsnit af ligningens to konstanter. Estimatet er derfor mere usikkert.";
    case "rate_clamped":
      return `Det ønskede tempo (${note.requested} % pr. uge) er justeret til ${note.applied} % pr. uge for at holde det inden for et forsvarligt interval.`;
    case "deficit_capped":
      return `Underskuddet er begrænset til ${note.maxDeficitKcal} kcal pr. dag (25 % af dit estimerede forbrug).`;
    case "surplus_capped":
      return `Overskuddet er begrænset til ${note.maxSurplusKcal} kcal pr. dag (15 % af dit estimerede forbrug).`;
    case "calorie_floor":
      return `Målet er hævet til mindst ${note.floorKcal} kcal pr. dag. Vi anbefaler ikke lavere indtag uden faglig vejledning.`;
    case "protein_reference_weight":
      return `Proteinmålet er beregnet ud fra en referencevægt på ${note.referenceWeightKg} kg for ikke at overvurdere behovet.`;
    case "fat_reduced_for_floor":
      return "Fedtmålet er sat til minimumsniveauet, fordi kaloriemålet er lavt.";
  }
}
