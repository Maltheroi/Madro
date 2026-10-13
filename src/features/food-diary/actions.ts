"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import {
  addDiaryEntry,
  deleteDiaryEntry,
  DiaryDataError,
  setDayComplete,
} from "@/server/services/diary";
import { MEAL_SLOTS } from "@/features/meal-planning/domain/planner";
import { FOOD_STATES } from "@/features/nutrition/domain/recipe-nutrition";
import {
  danishNumber,
  fieldErrorsOf,
  isoDate,
  optionalDanishNumber,
  type ActionResult,
} from "@/lib/validation/common";
import { logError } from "@/lib/observability/log";

const slot = z.enum(MEAL_SLOTS).nullable().catch(null);

const schemas = {
  recipe: z.object({
    kind: z.literal("recipe"),
    date: isoDate,
    slot,
    recipeId: z.uuid({ error: "Vælg en opskrift." }),
    servings: danishNumber({ min: 0.25, max: 6, label: "portioner" }),
  }),
  ingredient: z.object({
    kind: z.literal("ingredient"),
    date: isoDate,
    slot,
    ingredientId: z.uuid({ error: "Vælg en fødevare." }),
    grams: danishNumber({ min: 1, max: 3000, label: "mængde" }),
    state: z.enum(FOOD_STATES),
  }),
  manual: z.object({
    kind: z.literal("manual"),
    date: isoDate,
    slot,
    description: z.string().trim().min(1, "Skriv hvad du har spist.").max(200),
    energyKcal: danishNumber({ min: 0, max: 5000, label: "kalorier" }),
    proteinG: optionalDanishNumber({ min: 0, max: 400, label: "protein" }),
    carbohydrateG: optionalDanishNumber({ min: 0, max: 800, label: "kulhydrat" }),
    fatG: optionalDanishNumber({ min: 0, max: 400, label: "fedt" }),
  }),
  product: z.object({
    kind: z.literal("product"),
    date: isoDate,
    slot,
    productId: z.uuid({ error: "Vælg en vare." }),
    grams: danishNumber({ min: 1, max: 3000, label: "mængde" }),
  }),
  planned_meal: z.object({
    kind: z.literal("planned_meal"),
    date: isoDate,
    plannedMealId: z.uuid(),
  }),
};

export async function addEntryAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const raw = Object.fromEntries(formData.entries());
  const kind = raw.kind as keyof typeof schemas;
  const schema = schemas[kind];
  if (!schema) return { ok: false, error: "Ugyldig registrering." };
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: "Tjek felterne.", fieldErrors: fieldErrorsOf(parsed.error) };
  try {
    const d = parsed.data;
    if (d.kind === "manual") {
      await addDiaryEntry(user, {
        ...d,
        proteinG: d.proteinG ?? 0,
        carbohydrateG: d.carbohydrateG ?? 0,
        fatG: d.fatG ?? 0,
      });
    } else {
      await addDiaryEntry(user, d);
    }
  } catch (e) {
    if (e instanceof DiaryDataError) return { ok: false, error: e.message };
    logError("diary.add_failed", e);
    return { ok: false, error: "Registreringen kunne ikke gemmes." };
  }
  revalidatePath("/madregistrering");
  revalidatePath("/oversigt");
  return { ok: true, message: "Registreret." };
}

export async function deleteEntryAction(id: string): Promise<void> {
  const user = await requireUser();
  await deleteDiaryEntry(user, z.uuid().parse(id));
  revalidatePath("/madregistrering");
  revalidatePath("/oversigt");
}

export async function setDayCompleteAction(date: string, complete: boolean): Promise<void> {
  const user = await requireUser();
  await setDayComplete(user, isoDate.parse(date), complete);
  revalidatePath("/madregistrering");
}
