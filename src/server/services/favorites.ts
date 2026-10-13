import "server-only";
import { withUser } from "@/lib/database/db";
import type { SessionUser } from "@/server/auth";
import type { Cuisine, MealSlot } from "@/features/meal-planning/domain/planner";
import { loadCatalog } from "./catalog";

export const MIN_FAVORITES = 5;
export const MAX_FAVORITES = 10;

export interface PickerRecipe {
  id: string;
  slug: string;
  name: string;
  description: string;
  cuisines: Cuisine[];
  mealTypes: MealSlot[];
  kcalPerServing: number;
  proteinPerServing: number;
  minutes: number;
}

export class FavoritesError extends Error {}

/** Catalogue recipes for the favourites picker, plus the user's current picks and wishes. */
export async function getFavoritesPicker(user: SessionUser) {
  return withUser(user.id, async (tx) => {
    const [catalog, favorites, [profile]] = await Promise.all([
      loadCatalog(tx),
      tx`select recipe_id from public.recipe_favorites where user_id = ${user.id}`,
      tx`select dish_wishes from public.profiles where id = ${user.id}`,
    ]);
    const recipes: PickerRecipe[] = catalog.recipes
      .filter((r) => r.ownerId === null || r.ownerId === user.id)
      .map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        cuisines: r.cuisines,
        mealTypes: r.mealTypes,
        kcalPerServing: r.nutrition.perServing.energyKcal,
        proteinPerServing: r.nutrition.perServing.proteinG,
        minutes: r.prepMinutes + r.cookMinutes,
      }));
    return {
      recipes,
      selectedIds: favorites.map((f) => f.recipe_id as string),
      wishes: (profile?.dish_wishes as string[] | undefined) ?? [],
    };
  });
}

export async function countFavorites(user: SessionUser): Promise<number> {
  const [{ n }] = await withUser(
    user.id,
    (tx) => tx`select count(*)::int as n from public.recipe_favorites where user_id = ${user.id}`,
  );
  return n;
}

/** Replaces the user's favourite recipes (5–10) and dish wishes. */
export async function saveFavorites(
  user: SessionUser,
  recipeIds: string[],
  wishes: string[],
): Promise<void> {
  const ids = [...new Set(recipeIds)];
  if (ids.length < MIN_FAVORITES || ids.length > MAX_FAVORITES) {
    throw new FavoritesError(`Vælg mellem ${MIN_FAVORITES} og ${MAX_FAVORITES} retter.`);
  }
  await withUser(user.id, async (tx) => {
    const visible = await tx`
      select id from public.recipes
      where id in ${tx(ids)} and (owner_id is null or owner_id = ${user.id})`;
    if (visible.length !== ids.length) throw new FavoritesError("En af retterne findes ikke.");
    await tx`delete from public.recipe_favorites where user_id = ${user.id} and recipe_id not in ${tx(ids)}`;
    await tx`
      insert into public.recipe_favorites ${tx(ids.map((recipe_id) => ({ user_id: user.id, recipe_id })))}
      on conflict do nothing`;
    await tx`update public.profiles set dish_wishes = ${wishes} where id = ${user.id}`;
  });
}
