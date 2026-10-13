import "server-only";
import { withUser } from "@/lib/database/db";
import type { SessionUser } from "@/server/auth";
import type { MealSlot } from "@/features/meal-planning/domain/planner";
import { calculateNutrition, type FoodState } from "@/features/nutrition/domain/recipe-nutrition";
import { portionNutrition } from "@/features/products/domain/products";
import { loadCatalog } from "./catalog";
import { getProduct } from "./products";

export interface DiaryEntry {
  id: string;
  entryDate: string;
  slot: MealSlot | null;
  description: string;
  servings: number | null;
  grams: number | null;
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  source: "recipe" | "ingredient" | "manual" | "planned_meal" | "product";
}

const isoDate = (d: unknown) =>
  typeof d === "string" ? d.slice(0, 10) : (d as Date).toISOString().slice(0, 10);

function mapEntry(r: Record<string, unknown>): DiaryEntry {
  return {
    id: r.id as string,
    entryDate: isoDate(r.entry_date),
    slot: r.slot as MealSlot | null,
    description: r.description as string,
    servings: r.servings as number | null,
    grams: r.grams as number | null,
    energyKcal: r.energy_kcal as number,
    proteinG: r.protein_g as number,
    carbohydrateG: r.carbohydrate_g as number,
    fatG: r.fat_g as number,
    source: r.source as DiaryEntry["source"],
  };
}

export async function getDiaryRange(user: SessionUser, from: string, to: string) {
  return withUser(user.id, async (tx) => {
    const [entries, days] = await Promise.all([
      tx`select * from public.food_diary_entries where user_id = ${user.id} and entry_date between ${from} and ${to} order by entry_date, created_at`,
      tx`select entry_date, marked_complete from public.food_diary_days where user_id = ${user.id} and entry_date between ${from} and ${to}`,
    ]);
    return {
      entries: entries.map(mapEntry),
      completeDays: new Set(
        days.filter((d) => d.marked_complete).map((d) => isoDate(d.entry_date)),
      ),
    };
  });
}

type NewEntry =
  | { kind: "recipe"; date: string; slot: MealSlot | null; recipeId: string; servings: number }
  | {
      kind: "ingredient";
      date: string;
      slot: MealSlot | null;
      ingredientId: string;
      grams: number;
      state: FoodState;
    }
  | {
      kind: "manual";
      date: string;
      slot: MealSlot | null;
      description: string;
      energyKcal: number;
      proteinG: number;
      carbohydrateG: number;
      fatG: number;
    }
  | { kind: "planned_meal"; date: string; plannedMealId: string }
  | { kind: "product"; date: string; slot: MealSlot | null; productId: string; grams: number };

export class DiaryDataError extends Error {}

/** Adds a diary entry. Nutrition is always computed server-side from catalog data. */
export async function addDiaryEntry(user: SessionUser, e: NewEntry): Promise<void> {
  await withUser(user.id, async (tx) => {
    if (e.kind === "manual") {
      await tx`
        insert into public.food_diary_entries (user_id, entry_date, slot, description, energy_kcal, protein_g, carbohydrate_g, fat_g, source)
        values (${user.id}, ${e.date}, ${e.slot}, ${e.description}, ${e.energyKcal}, ${e.proteinG}, ${e.carbohydrateG}, ${e.fatG}, 'manual')`;
      return;
    }
    if (e.kind === "product") {
      const product = await getProduct(tx, user.id, e.productId);
      if (!product) throw new DiaryDataError("Varen findes ikke.");
      const n = portionNutrition(product, e.grams);
      if (!n) {
        throw new DiaryDataError(
          "Varen mangler kalorier. Tilføj den som din egen vare med tal fra pakken.",
        );
      }
      const description = (
        product.brand ? `${product.name} (${product.brand})` : product.name
      ).slice(0, 200);
      await tx`
        insert into public.food_diary_entries
          (user_id, entry_date, slot, product_id, description, grams, energy_kcal, protein_g, carbohydrate_g, fat_g, source)
        values (${user.id}, ${e.date}, ${e.slot}, ${product.id}, ${description}, ${e.grams},
                ${n.energyKcal}, ${n.proteinG}, ${n.carbohydrateG}, ${n.fatG}, 'product')`;
      return;
    }
    const catalog = await loadCatalog(tx);
    if (e.kind === "recipe" || e.kind === "planned_meal") {
      let recipeId: string;
      let servings: number;
      let slot: MealSlot | null;
      let plannedMealId: string | null = null;
      if (e.kind === "planned_meal") {
        const [pm] =
          await tx`select recipe_id, servings, slot from public.planned_meals where id = ${e.plannedMealId} and user_id = ${user.id}`;
        if (!pm) throw new DiaryDataError("Måltidet findes ikke.");
        recipeId = pm.recipe_id;
        servings = pm.servings;
        slot = pm.slot;
        plannedMealId = e.plannedMealId;
      } else {
        recipeId = e.recipeId;
        servings = e.servings;
        slot = e.slot;
      }
      const recipe = catalog.recipeById.get(recipeId);
      if (!recipe) throw new DiaryDataError("Opskriften findes ikke.");
      if (recipe.nutrition.incompleteNutrients.includes("energyKcal")) {
        throw new DiaryDataError(
          "Opskriften mangler ernæringsdata og kan ikke registreres automatisk. Brug manuel registrering.",
        );
      }
      const n = recipe.nutrition.perServing;
      await tx`
        insert into public.food_diary_entries
          (user_id, entry_date, slot, recipe_id, planned_meal_id, description, servings, energy_kcal, protein_g, carbohydrate_g, fat_g, source)
        values (${user.id}, ${e.date}, ${slot}, ${recipeId}, ${plannedMealId}, ${recipe.name}, ${servings},
                ${n.energyKcal * servings}, ${n.proteinG * servings}, ${n.carbohydrateG * servings}, ${n.fatG * servings}, ${e.kind})`;
      return;
    }
    const ing = catalog.ingredients.get(e.ingredientId);
    if (!ing) throw new DiaryDataError("Fødevaren findes ikke.");
    const result = calculateNutrition(
      [{ ingredientId: ing.ingredientId, quantity: e.grams, unit: "g", state: e.state }],
      catalog.ingredients,
    );
    if (result.incompleteNutrients.includes("energyKcal")) {
      throw new DiaryDataError(
        `Vi mangler energidata for ${ing.nameDa} i den tilstand. Brug manuel registrering.`,
      );
    }
    const t = result.totals;
    await tx`
      insert into public.food_diary_entries
        (user_id, entry_date, slot, ingredient_id, description, grams, energy_kcal, protein_g, carbohydrate_g, fat_g, source)
      values (${user.id}, ${e.date}, ${e.slot}, ${ing.ingredientId}, ${ing.nameDa}, ${e.grams}, ${t.energyKcal}, ${t.proteinG}, ${t.carbohydrateG}, ${t.fatG}, 'ingredient')`;
  });
}

export async function deleteDiaryEntry(user: SessionUser, id: string): Promise<void> {
  await withUser(
    user.id,
    (tx) => tx`delete from public.food_diary_entries where id = ${id} and user_id = ${user.id}`,
  );
}

export async function setDayComplete(
  user: SessionUser,
  date: string,
  complete: boolean,
): Promise<void> {
  await withUser(
    user.id,
    (tx) => tx`
    insert into public.food_diary_days (user_id, entry_date, marked_complete) values (${user.id}, ${date}, ${complete})
    on conflict (user_id, entry_date) do update set marked_complete = excluded.marked_complete`,
  );
}
