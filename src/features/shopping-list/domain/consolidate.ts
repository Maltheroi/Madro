/**
 * Consolidates the ingredients of a validated meal plan into required
 * quantities, then subtracts confirmed pantry stock.
 *
 * Quantities are normalised to grams where the ingredient has the data for it.
 * Otherwise they stay in their own dimension (ml or stk), so incompatible
 * amounts are never added together.
 */

import { toBase, toGrams, type ConversionData, type Dimension, type Unit } from "@/features/nutrition/domain/units";

export interface RecipeIngredientLine {
  ingredientId: string;
  quantity: number;
  unit: Unit;
  optional?: boolean;
}

export interface RecipeForShopping {
  id: string;
  servings: number;
  lines: RecipeIngredientLine[];
}

export interface PlannedMealForShopping {
  recipeId: string;
  /** Total servings cooked for the household. */
  householdServings: number;
}

export interface IngredientInfo extends ConversionData {
  id: string;
  name: string;
  category: string;
}

export interface PantryItem {
  ingredientId: string;
  quantity: number;
  unit: Unit;
}

export interface RequiredItem {
  ingredientId: string;
  name: string;
  category: string;
  dimension: Dimension;
  /** Amount in g, ml or stk depending on dimension. */
  quantity: number;
  /** Amount covered by pantry stock, in the same base unit. */
  coveredByPantry: number;
  /** quantity − coveredByPantry, never below 0. */
  toBuy: number;
  required: boolean;
  recipeIds: string[];
}

function normalise(
  quantity: number,
  unit: Unit,
  info: IngredientInfo | undefined,
): { dimension: Dimension; value: number } {
  const grams = toGrams(quantity, unit, info ?? {});
  if (grams !== null) return { dimension: "mass", value: grams };
  return toBase(quantity, unit);
}

export function consolidateIngredients(
  meals: PlannedMealForShopping[],
  recipes: Map<string, RecipeForShopping>,
  ingredients: Map<string, IngredientInfo>,
  pantry: PantryItem[] = [],
): RequiredItem[] {
  const items = new Map<string, RequiredItem>();

  for (const meal of meals) {
    const recipe = recipes.get(meal.recipeId);
    if (!recipe || recipe.servings <= 0) continue;
    const factor = meal.householdServings / recipe.servings;
    for (const line of recipe.lines) {
      const info = ingredients.get(line.ingredientId);
      const { dimension, value } = normalise(line.quantity * factor, line.unit, info);
      const key = `${line.ingredientId}:${dimension}`;
      const existing = items.get(key);
      if (existing) {
        existing.quantity += value;
        existing.toBuy += value;
        existing.required ||= !line.optional;
        if (!existing.recipeIds.includes(recipe.id)) existing.recipeIds.push(recipe.id);
      } else {
        items.set(key, {
          ingredientId: line.ingredientId,
          name: info?.name ?? line.ingredientId,
          category: info?.category ?? "andet",
          dimension,
          quantity: value,
          coveredByPantry: 0,
          toBuy: value,
          required: !line.optional,
          recipeIds: [recipe.id],
        });
      }
    }
  }

  for (const p of pantry) {
    const info = ingredients.get(p.ingredientId);
    const { dimension, value } = normalise(p.quantity, p.unit, info);
    const item = items.get(`${p.ingredientId}:${dimension}`);
    if (!item) continue;
    const covered = Math.min(item.quantity, item.coveredByPantry + value);
    item.coveredByPantry = covered;
    item.toBuy = Math.max(0, item.quantity - covered);
  }

  return [...items.values()].sort(
    (a, b) => a.category.localeCompare(b.category, "da") || a.name.localeCompare(b.name, "da"),
  );
}
