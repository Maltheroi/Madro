import "server-only";
import type { Tx } from "@/lib/database/db";
import type { ActivityLevel, CalculationSex, Goal } from "@/features/nutrition/domain/energy";
import type { Diet } from "@/features/meal-planning/domain/planner";

export interface Profile {
  id: string;
  displayName: string | null;
  birthYear: number | null;
  sex: CalculationSex | null;
  heightCm: number | null;
  activityLevel: ActivityLevel | null;
  trainingDaysPerWeek: number | null;
  goal: Goal | null;
  weeklyRatePercent: number | null;
  goalWeightKg: number | null;
  targetBodyFatPercent: number | null;
  diet: Diet;
  allergens: string[];
  excludedIngredients: string[];
  dislikedIngredients: string[];
  mealsPerDay: number;
  maxCookingMinutes: number | null;
  cookingSkill: "beginner" | "intermediate" | "advanced";
  householdSize: number;
  weeklyBudgetOre: number | null;
  postalCode: string | null;
  preferredRetailerSlugs: string[];
  allowCalorieEstimate: boolean;
  timezone: string;
  onboardingCompletedAt: Date | null;
}

export interface NutritionGoal {
  id: string;
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  source: "estimate" | "user" | "adaptive";
  bmrKcal: number | null;
  tdeeKcal: number | null;
  toleranceEnergy: number;
  toleranceProteinShortfall: number;
  toleranceCarbohydrate: number;
  toleranceFat: number;
  calculationNotes: unknown[];
  effectiveFrom: Date;
}

export async function getProfile(tx: Tx, userId: string): Promise<Profile | null> {
  const [r] = await tx`select * from public.profiles where id = ${userId}`;
  if (!r) return null;
  return {
    id: r.id,
    displayName: r.display_name,
    birthYear: r.birth_year,
    sex: r.sex_for_calculation,
    heightCm: r.height_cm,
    activityLevel: r.activity_level,
    trainingDaysPerWeek: r.training_days_per_week,
    goal: r.primary_goal,
    weeklyRatePercent: r.weekly_rate_percent,
    goalWeightKg: r.goal_weight_kg,
    targetBodyFatPercent: r.target_body_fat_percent,
    diet: r.diet,
    allergens: r.allergens,
    excludedIngredients: r.excluded_ingredients,
    dislikedIngredients: r.disliked_ingredients,
    mealsPerDay: r.meals_per_day,
    maxCookingMinutes: r.max_cooking_minutes,
    cookingSkill: r.cooking_skill,
    householdSize: r.household_size,
    weeklyBudgetOre: r.weekly_budget_ore,
    postalCode: r.postal_code,
    preferredRetailerSlugs: r.preferred_retailer_slugs,
    allowCalorieEstimate: r.allow_calorie_estimate,
    timezone: r.timezone,
    onboardingCompletedAt: r.onboarding_completed_at,
  };
}

export async function getActiveGoal(tx: Tx, userId: string): Promise<NutritionGoal | null> {
  const [r] =
    await tx`select * from public.nutrition_goals where user_id = ${userId} and is_active`;
  if (!r) return null;
  return {
    id: r.id,
    energyKcal: r.energy_kcal,
    proteinG: r.protein_g,
    carbohydrateG: r.carbohydrate_g,
    fatG: r.fat_g,
    source: r.source,
    bmrKcal: r.bmr_kcal,
    tdeeKcal: r.tdee_kcal,
    toleranceEnergy: r.tolerance_energy,
    toleranceProteinShortfall: r.tolerance_protein_shortfall,
    toleranceCarbohydrate: r.tolerance_carbohydrate,
    toleranceFat: r.tolerance_fat,
    calculationNotes: r.calculation_notes,
    effectiveFrom: r.effective_from,
  };
}

export async function getLatestWeightKg(tx: Tx, userId: string): Promise<number | null> {
  const [r] =
    await tx`select weight_kg from public.weight_entries where user_id = ${userId} order by measured_at desc limit 1`;
  return r?.weight_kg ?? null;
}

export async function getAlgorithmVersionId(
  tx: Tx,
  key: string,
  version: string,
): Promise<string | null> {
  const [r] =
    await tx`select id from public.algorithm_versions where key = ${key} and version = ${version}`;
  return r?.id ?? null;
}

export interface NewGoal {
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  source: "estimate" | "user" | "adaptive";
  bmrKcal: number | null;
  tdeeKcal: number | null;
  algorithmVersionId: string | null;
  notes: unknown[];
  tolerances?: { energy: number; proteinShortfall: number; carbohydrate: number; fat: number };
}

/** Replaces the active goal, keeping history. */
export async function replaceActiveGoal(tx: Tx, userId: string, g: NewGoal): Promise<void> {
  const [prev] = await tx`
    update public.nutrition_goals set is_active = false where user_id = ${userId} and is_active
    returning tolerance_energy, tolerance_protein_shortfall, tolerance_carbohydrate, tolerance_fat`;
  const tol = g.tolerances ?? {
    energy: prev?.tolerance_energy ?? 0.07,
    proteinShortfall: prev?.tolerance_protein_shortfall ?? 0.1,
    carbohydrate: prev?.tolerance_carbohydrate ?? 0.25,
    fat: prev?.tolerance_fat ?? 0.25,
  };
  await tx`
    insert into public.nutrition_goals
      (user_id, energy_kcal, protein_g, carbohydrate_g, fat_g, source, bmr_kcal, tdee_kcal, algorithm_version_id,
       calculation_notes, tolerance_energy, tolerance_protein_shortfall, tolerance_carbohydrate, tolerance_fat)
    values (${userId}, ${g.energyKcal}, ${g.proteinG}, ${g.carbohydrateG}, ${g.fatG}, ${g.source}, ${g.bmrKcal}, ${g.tdeeKcal},
            ${g.algorithmVersionId}, ${tx.json(g.notes as never)}, ${tol.energy}, ${tol.proteinShortfall}, ${tol.carbohydrate}, ${tol.fat})`;
}
