import "server-only";
import { withUser, type Tx } from "@/lib/database/db";
import { mondayOf, todayInCopenhagen } from "@/lib/format";
import {
  DEFAULT_TOLERANCES,
  generateMealPlan,
  MEAL_PLANNER_ALGORITHM,
  quantizeServings,
  slotShares,
  slotsForMealsPerDay,
  validateDay,
  type DailyTargets,
  type MealSlot,
  type Tolerances,
  type Violation,
} from "@/features/meal-planning/domain/planner";
import type { SessionUser } from "@/server/auth";
import {
  getActiveGoal,
  getAlgorithmVersionId,
  getProfile,
  type NutritionGoal,
  type Profile,
} from "@/server/repositories/profile";
import { loadCatalog, resolveIngredientTerms, toPlannerRecipe, type Catalog } from "./catalog";
import { enforceRateLimit, LIMITS } from "./rate-limit";

export interface PlannedMealView {
  id: string;
  dayIndex: number;
  slot: MealSlot;
  slotPosition: number;
  recipeId: string;
  servings: number;
  householdServings: number;
  locked: boolean;
}

export interface MealPlanView {
  id: string;
  weekStart: string;
  seed: number;
  targets: DailyTargets;
  meals: PlannedMealView[];
  validation: PlanValidation;
  createdAt: Date;
}

export interface PlanValidation {
  days: { dayIndex: number; totals: DailyTargets; violations: Violation[] }[];
  valid: boolean;
  warnings: string[];
  estimatedCostOre: number | null;
  unknownCostMeals: number;
}

export function targetsFromGoal(goal: NutritionGoal): DailyTargets {
  return {
    energyKcal: goal.energyKcal,
    proteinG: goal.proteinG,
    carbohydrateG: goal.carbohydrateG,
    fatG: goal.fatG,
  };
}

export function tolerancesFromGoal(goal: NutritionGoal): Tolerances {
  return {
    energy: goal.toleranceEnergy ?? DEFAULT_TOLERANCES.energy,
    proteinShortfall: goal.toleranceProteinShortfall ?? DEFAULT_TOLERANCES.proteinShortfall,
    carbohydrate: goal.toleranceCarbohydrate ?? DEFAULT_TOLERANCES.carbohydrate,
    fat: goal.toleranceFat ?? DEFAULT_TOLERANCES.fat,
  };
}

export function currentWeekStart(): string {
  return mondayOf(todayInCopenhagen());
}

async function loadPlan(tx: Tx, userId: string, weekStart: string): Promise<MealPlanView | null> {
  const [plan] = await tx`
    select * from public.meal_plans where user_id = ${userId} and week_start = ${weekStart} and status = 'active'`;
  if (!plan) return null;
  const meals = await tx`
    select * from public.planned_meals where meal_plan_id = ${plan.id} order by day_index, slot_position`;
  return {
    id: plan.id,
    weekStart:
      typeof plan.week_start === "string"
        ? plan.week_start
        : new Date(plan.week_start).toISOString().slice(0, 10),
    seed: plan.seed,
    targets: plan.targets,
    validation: plan.validation,
    createdAt: plan.created_at,
    meals: meals.map((m) => ({
      id: m.id,
      dayIndex: m.day_index,
      slot: m.slot,
      slotPosition: m.slot_position,
      recipeId: m.recipe_id,
      servings: m.servings,
      householdServings: m.household_servings,
      locked: m.locked,
    })),
  };
}

export async function getPlanForWeek(user: SessionUser, weekStart = currentWeekStart()) {
  return withUser(user.id, async (tx) => {
    const [plan, catalog, profile, goal, favorites] = await Promise.all([
      loadPlan(tx, user.id, weekStart),
      loadCatalog(tx),
      getProfile(tx, user.id),
      getActiveGoal(tx, user.id),
      tx`select recipe_id from public.recipe_favorites where user_id = ${user.id}`,
    ]);
    return {
      plan,
      catalog,
      profile: profile!,
      goal,
      favoriteIds: favorites.map((f) => f.recipe_id as string),
    };
  });
}

function revalidate(
  plan: { meals: PlannedMealView[] },
  catalog: Catalog,
  targets: DailyTargets,
  tol: Tolerances,
  warnings: string[],
): PlanValidation {
  const days: PlanValidation["days"] = [];
  let cost = 0;
  let unknown = 0;
  for (let d = 0; d < 7; d++) {
    const meals = plan.meals.filter((m) => m.dayIndex === d);
    const totals = { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0 };
    for (const m of meals) {
      const r = catalog.recipeById.get(m.recipeId);
      if (!r) continue;
      totals.energyKcal += r.nutrition.perServing.energyKcal * m.servings;
      totals.proteinG += r.nutrition.perServing.proteinG * m.servings;
      totals.carbohydrateG += r.nutrition.perServing.carbohydrateG * m.servings;
      totals.fatG += r.nutrition.perServing.fatG * m.servings;
      if (r.cost.perServingOre === null) unknown++;
      else cost += r.cost.perServingOre * m.householdServings;
    }
    days.push({
      dayIndex: d,
      totals,
      violations: meals.length ? validateDay(totals, targets, tol) : [],
    });
  }
  return {
    days,
    valid: days.every((d) => d.violations.length === 0),
    warnings,
    estimatedCostOre: plan.meals.length && unknown < plan.meals.length ? Math.round(cost) : null,
    unknownCostMeals: unknown,
  };
}

function constraintsFor(profile: Profile, catalog: Catalog, favoriteIds: string[]) {
  const excluded = resolveIngredientTerms(profile.excludedIngredients, catalog.ingredients);
  const disliked = resolveIngredientTerms(profile.dislikedIngredients, catalog.ingredients);
  const warnings: string[] = [];
  if (excluded.unmatched.length) {
    warnings.push(
      `Vi kunne ikke genkende disse udelukkede ingredienser i vores katalog: ${excluded.unmatched.join(", ")}. Tjek opskrifterne selv.`,
    );
  }
  return {
    constraints: {
      allergens: profile.allergens,
      excludedIngredientIds: excluded.ids,
      dislikedIngredientIds: disliked.ids,
      diet: profile.diet,
      maxCookingMinutes: profile.maxCookingMinutes,
      favoriteRecipeIds: favoriteIds,
      mealsPerDay: profile.mealsPerDay,
      householdSize: profile.householdSize,
      weeklyBudgetOre: profile.weeklyBudgetOre,
    },
    warnings,
  };
}

/** Generate (or regenerate) the week's plan, keeping locked meals. */
export async function generatePlan(
  user: SessionUser,
  opts: { weekStart?: string; keepLocked?: boolean } = {},
): Promise<string> {
  const weekStart = opts.weekStart ?? currentWeekStart();
  return withUser(user.id, async (tx) => {
    await enforceRateLimit(tx, LIMITS.mealPlanGenerate);
    const [profile, goal, catalog, favorites, existing] = await Promise.all([
      getProfile(tx, user.id),
      getActiveGoal(tx, user.id),
      loadCatalog(tx),
      tx`select recipe_id from public.recipe_favorites where user_id = ${user.id}`,
      loadPlan(tx, user.id, weekStart),
    ]);
    if (!profile || !goal)
      throw new Error("Profil og mål skal være udfyldt, før der kan laves en madplan.");
    const favoriteIds = favorites.map((f) => f.recipe_id as string);
    const { constraints, warnings } = constraintsFor(profile, catalog, favoriteIds);
    const targets = targetsFromGoal(goal);
    const tolerances = tolerancesFromGoal(goal);
    const locked =
      opts.keepLocked && existing
        ? existing.meals
            .filter((m) => m.locked)
            .map((m) => ({
              day: m.dayIndex,
              slot: m.slot,
              recipeId: m.recipeId,
              servings: m.servings,
            }))
        : [];
    const seed = Math.floor(Math.random() * 2 ** 31);
    const result = generateMealPlan({
      recipes: catalog.recipes.map(toPlannerRecipe),
      constraints,
      targets,
      tolerances,
      locked,
      seed,
    });
    const algorithmVersionId = await getAlgorithmVersionId(
      tx,
      MEAL_PLANNER_ALGORITHM.key,
      MEAL_PLANNER_ALGORITHM.version,
    );

    if (existing)
      await tx`update public.meal_plans set status = 'archived' where id = ${existing.id}`;
    const meals: PlannedMealView[] = [];
    for (const day of result.days) {
      day.meals.forEach((m, i) =>
        meals.push({
          id: "",
          dayIndex: m.day,
          slot: m.slot,
          slotPosition: i,
          recipeId: m.recipeId,
          servings: m.servings,
          householdServings: m.householdServings,
          locked: m.locked,
        }),
      );
    }
    const validation = revalidate({ meals }, catalog, targets, tolerances, [
      ...warnings,
      ...result.warnings,
    ]);
    // Slots the planner could not fill are not visible from the saved meals, so carry them over.
    for (const day of result.days) {
      validation.days[day.day].violations.push(
        ...day.violations.filter((v) => v.code === "no_candidates"),
      );
      if (day.violations.some((v) => v.code === "no_candidates")) validation.valid = false;
    }
    const [plan] = await tx`
      insert into public.meal_plans (user_id, week_start, seed, algorithm_version_id, targets, validation)
      values (${user.id}, ${weekStart}, ${seed}, ${algorithmVersionId}, ${tx.json(targets as never)}, ${tx.json(validation as never)})
      returning id`;
    for (const m of meals) {
      await tx`
        insert into public.planned_meals (meal_plan_id, user_id, day_index, slot, slot_position, recipe_id, servings, household_servings, locked)
        values (${plan.id}, ${user.id}, ${m.dayIndex}, ${m.slot}, ${m.slotPosition}, ${m.recipeId}, ${m.servings}, ${m.householdServings}, ${m.locked})`;
    }
    return plan.id as string;
  });
}

async function mutateMeal(
  user: SessionUser,
  plannedMealId: string,
  fn: (
    tx: Tx,
    meal: { meal_plan_id: string; day_index: number; slot: MealSlot; slot_position: number },
  ) => Promise<void>,
) {
  await withUser(user.id, async (tx) => {
    const [meal] = await tx`
      select pm.meal_plan_id, pm.day_index, pm.slot, pm.slot_position from public.planned_meals pm
      join public.meal_plans p on p.id = pm.meal_plan_id
      where pm.id = ${plannedMealId} and pm.user_id = ${user.id} and p.status = 'active'`;
    if (!meal) throw new Error("Måltidet findes ikke.");
    await fn(tx, meal as never);
    // Re-validate the whole plan after any change.
    const [plan] =
      await tx`select week_start, validation from public.meal_plans where id = ${meal.meal_plan_id}`;
    const weekStart =
      typeof plan.week_start === "string"
        ? plan.week_start
        : new Date(plan.week_start).toISOString().slice(0, 10);
    const [view, catalog, goal] = await Promise.all([
      loadPlan(tx, user.id, weekStart),
      loadCatalog(tx),
      getActiveGoal(tx, user.id),
    ]);
    if (view && goal) {
      const validation = revalidate(
        view,
        catalog,
        targetsFromGoal(goal),
        tolerancesFromGoal(goal),
        plan.validation?.warnings ?? [],
      );
      await tx`update public.meal_plans set validation = ${tx.json(validation as never)} where id = ${meal.meal_plan_id}`;
    }
  });
}

export async function toggleLock(user: SessionUser, plannedMealId: string) {
  await mutateMeal(user, plannedMealId, async (tx) => {
    await tx`update public.planned_meals set locked = not locked where id = ${plannedMealId}`;
  });
}

export async function setServings(user: SessionUser, plannedMealId: string, servings: number) {
  const s = quantizeServings(servings);
  await mutateMeal(user, plannedMealId, async (tx) => {
    const [profile] = await tx`select household_size from public.profiles where id = ${user.id}`;
    await tx`update public.planned_meals set servings = ${s}, household_servings = ${s + Math.max(1, profile.household_size) - 1} where id = ${plannedMealId}`;
  });
}

/** Swap a meal for another eligible recipe and scale the portion to the slot's energy share. */
export async function replaceMeal(user: SessionUser, plannedMealId: string, recipeId: string) {
  await mutateMeal(user, plannedMealId, async (tx, meal) => {
    const [profile, goal, catalog] = await Promise.all([
      getProfile(tx, user.id),
      getActiveGoal(tx, user.id),
      loadCatalog(tx),
    ]);
    const recipe = catalog.recipeById.get(recipeId);
    if (!recipe || !profile || !goal) throw new Error("Opskriften findes ikke.");
    const { constraints } = constraintsFor(profile, catalog, []);
    const planner = toPlannerRecipe(recipe);
    // Hard constraints are re-checked server-side; the client list is not trusted.
    if (planner.allergens.some((a) => constraints.allergens.includes(a)))
      throw new Error("Opskriften indeholder et af dine allergener.");
    if (planner.ingredientIds.some((i) => constraints.excludedIngredientIds.includes(i)))
      throw new Error("Opskriften indeholder en udelukket ingrediens.");
    const dietTag = {
      omnivore: null,
      pescetarian: "pescetarian",
      vegetarian: "vegetarian",
      vegan: "vegan",
    }[profile.diet];
    if (dietTag && !planner.dietTags.includes(dietTag))
      throw new Error("Opskriften passer ikke til din kost.");
    const slots = slotsForMealsPerDay(profile.mealsPerDay);
    const share = slotShares(slots)[Math.min(meal.slot_position, slots.length - 1)] ?? 0.3;
    const servings = quantizeServings((goal.energyKcal * share) / planner.perServing.energyKcal);
    await tx`
      update public.planned_meals set recipe_id = ${recipeId}, servings = ${servings},
        household_servings = ${servings + Math.max(1, profile.householdSize) - 1}
      where id = ${plannedMealId}`;
  });
}

export async function toggleFavorite(user: SessionUser, recipeId: string): Promise<boolean> {
  return withUser(user.id, async (tx) => {
    const deleted =
      await tx`delete from public.recipe_favorites where user_id = ${user.id} and recipe_id = ${recipeId} returning recipe_id`;
    if (deleted.length) return false;
    await tx`insert into public.recipe_favorites (user_id, recipe_id) values (${user.id}, ${recipeId})`;
    return true;
  });
}

/** Copy last week's plan into this week ("gentag uge"). */
export async function repeatPreviousWeek(user: SessionUser): Promise<boolean> {
  const weekStart = currentWeekStart();
  const prev = new Date(`${weekStart}T00:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 7);
  const prevWeek = prev.toISOString().slice(0, 10);
  return withUser(user.id, async (tx) => {
    const old = await loadPlan(tx, user.id, prevWeek);
    if (!old) return false;
    const current = await loadPlan(tx, user.id, weekStart);
    if (current)
      await tx`update public.meal_plans set status = 'archived' where id = ${current.id}`;
    const [plan] = await tx`
      insert into public.meal_plans (user_id, week_start, seed, algorithm_version_id, targets, validation)
      select user_id, ${weekStart}, seed, algorithm_version_id, targets, validation from public.meal_plans where id = ${old.id}
      returning id`;
    await tx`
      insert into public.planned_meals (meal_plan_id, user_id, day_index, slot, slot_position, recipe_id, servings, household_servings, locked)
      select ${plan.id}, user_id, day_index, slot, slot_position, recipe_id, servings, household_servings, locked
      from public.planned_meals where meal_plan_id = ${old.id}`;
    return true;
  });
}
