"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import {
  generatePlan,
  repeatPreviousWeek,
  replaceMeal,
  setServings,
  toggleFavorite,
  toggleLock,
} from "@/server/services/meal-plan";
import { RateLimitError } from "@/server/services/rate-limit";
import { MAX_SERVINGS, MIN_SERVINGS } from "./domain/planner";
import { logError } from "@/lib/observability/log";
import type { ActionResult } from "@/lib/validation/common";

const id = z.uuid();

async function run(fn: () => Promise<unknown>, fallback: string): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/madplan");
    revalidatePath("/oversigt");
    return { ok: true };
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: e.message };
    logError("meal_plan.action_failed", e);
    return {
      ok: false,
      error: e instanceof Error && /^[A-ZÆØÅ]/.test(e.message) ? e.message : fallback,
    };
  }
}

export async function generatePlanAction(keepLocked: boolean): Promise<ActionResult> {
  const user = await requireUser();
  return run(() => generatePlan(user, { keepLocked }), "Madplanen kunne ikke laves. Prøv igen.");
}

export async function toggleLockAction(mealId: string): Promise<ActionResult> {
  const user = await requireUser();
  return run(() => toggleLock(user, id.parse(mealId)), "Måltidet kunne ikke opdateres.");
}

export async function setServingsAction(mealId: string, servings: number): Promise<ActionResult> {
  const user = await requireUser();
  const s = z.number().min(MIN_SERVINGS).max(MAX_SERVINGS).parse(servings);
  return run(() => setServings(user, id.parse(mealId), s), "Portionen kunne ikke opdateres.");
}

export async function replaceMealAction(mealId: string, recipeId: string): Promise<ActionResult> {
  const user = await requireUser();
  return run(
    () => replaceMeal(user, id.parse(mealId), id.parse(recipeId)),
    "Måltidet kunne ikke udskiftes.",
  );
}

export async function toggleFavoriteAction(recipeId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await run(
    () => toggleFavorite(user, id.parse(recipeId)),
    "Favoritten kunne ikke gemmes.",
  );
  revalidatePath("/opskrifter", "layout");
  return res;
}

export async function repeatWeekAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const ok = await repeatPreviousWeek(user);
    revalidatePath("/madplan");
    return ok
      ? { ok: true }
      : { ok: false, error: "Der er ingen madplan fra sidste uge at gentage." };
  } catch (e) {
    logError("meal_plan.repeat_failed", e);
    return { ok: false, error: "Ugen kunne ikke gentages." };
  }
}
