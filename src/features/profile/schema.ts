import { z } from "zod";
import { ACTIVITY_LEVELS, GOALS } from "@/features/nutrition/domain/energy";
import { DIETS } from "@/features/meal-planning/domain/planner";
import { danishNumber, optionalDanishNumber } from "@/lib/validation/common";
import { ALLERGEN_CODES } from "./constants";

const currentYear = new Date().getUTCFullYear();

const csvList = z.preprocess(
  (v) =>
    typeof v === "string"
      ? v
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : v,
  z.array(z.string().min(1).max(60)).max(40),
);

/** Shared by the onboarding wizard (client) and the server action. */
export const profileSchema = z
  .object({
    displayName: z.string().trim().max(80).optional().or(z.literal("")),
    birthYear: danishNumber({ min: currentYear - 100, max: currentYear - 18, label: "fødselsår" }),
    sex: z.enum(["female", "male", "unspecified"]),
    heightCm: danishNumber({ min: 120, max: 230, label: "højde" }),
    weightKg: danishNumber({ min: 35, max: 300, label: "vægt" }),
    goalWeightKg: optionalDanishNumber({ min: 35, max: 300, label: "målvægt" }),
    targetBodyFatPercent: optionalDanishNumber({ min: 3, max: 60, label: "fedtprocent" }),
    activityLevel: z.enum(ACTIVITY_LEVELS),
    trainingDaysPerWeek: danishNumber({ min: 0, max: 14, label: "træningsdage" }),
    goal: z.enum(GOALS),
    weeklyRatePercent: optionalDanishNumber({ min: 0, max: 1.5, label: "tempo" }),
    diet: z.enum(DIETS),
    allergens: z.array(z.enum(ALLERGEN_CODES)).default([]),
    excludedIngredients: csvList.default([]),
    dislikedIngredients: csvList.default([]),
    allowCalorieEstimate: z.boolean(),
    customEnergyKcal: optionalDanishNumber({ min: 1000, max: 6000, label: "kaloriemål" }),
    customProteinG: optionalDanishNumber({ min: 20, max: 400, label: "proteinmål" }),
    customCarbohydrateG: optionalDanishNumber({ min: 0, max: 900, label: "kulhydratmål" }),
    customFatG: optionalDanishNumber({ min: 20, max: 300, label: "fedtmål" }),
    mealsPerDay: danishNumber({ min: 2, max: 5, label: "måltider pr. dag" }),
    maxCookingMinutes: optionalDanishNumber({ min: 5, max: 240, label: "tilberedningstid" }),
    cookingSkill: z.enum(["beginner", "intermediate", "advanced"]),
    householdSize: danishNumber({ min: 1, max: 12, label: "husstandens størrelse" }),
    weeklyBudgetKr: optionalDanishNumber({ min: 0, max: 100000, label: "ugebudget" }),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{4}$/, "Postnummer skal være fire cifre.")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (!v.allowCalorieEstimate && v.customEnergyKcal === undefined) {
      ctx.addIssue({ code: "custom", path: ["customEnergyKcal"], message: "Angiv dit eget kaloriemål, eller lad os estimere det." });
    }
    if (v.goal === "fat_loss" && v.goalWeightKg !== undefined && v.goalWeightKg >= v.weightKg) {
      ctx.addIssue({ code: "custom", path: ["goalWeightKg"], message: "Målvægten skal være lavere end din nuværende vægt, når målet er fedttab." });
    }
    if (v.goal === "muscle_gain" && v.goalWeightKg !== undefined && v.goalWeightKg <= v.weightKg) {
      ctx.addIssue({ code: "custom", path: ["goalWeightKg"], message: "Målvægten skal være højere end din nuværende vægt, når målet er muskelopbygning." });
    }
  });

export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileData = z.output<typeof profileSchema>;
