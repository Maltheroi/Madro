import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DevNutritionNotice } from "@/components/data-badges";
import { requireUser } from "@/server/auth";
import { getPlanForWeek } from "@/server/services/meal-plan";
import { resolveIngredientTerms, toPlannerRecipe } from "@/server/services/catalog";
import { isRecipeAllowed } from "@/features/meal-planning/domain/planner";
import { addDays } from "@/features/nutrition/domain/intake";
import { formatDate, formatInt, formatWeekday, todayInCopenhagen } from "@/lib/format";
import { GeneratePlanButton, WeekView, type WeekDay } from "@/features/meal-planning/week-view";

export const metadata: Metadata = { title: "Madplan" };

export default async function MealPlanPage() {
  const user = await requireUser();
  const { plan, catalog, profile, goal, favoriteIds } = await getPlanForWeek(user);
  const today = todayInCopenhagen();

  if (!goal) {
    return (
      <>
        <PageHeader title="Madplan" />
        <Card>
          <CardHeader>
            <CardTitle>Du mangler et kaloriemål</CardTitle>
            <CardDescription>Udfyld din profil, så vi kan lave en madplan til dig.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/profil">Gå til profil</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  if (!plan) {
    return (
      <>
        <PageHeader title="Madplan" description="Syv dage med måltider, der passer til dine mål." />
        <Card>
          <CardHeader>
            <CardTitle>Ingen madplan for denne uge endnu</CardTitle>
            <CardDescription>
              Vi vælger opskrifter efter dit mål på {formatInt(goal.energyKcal)} kcal og{" "}
              {goal.proteinG} g protein, dine allergier, din kost og den tid, du har. Du kan låse,
              udskifte og skalere måltider bagefter.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GeneratePlanButton />
          </CardContent>
        </Card>
      </>
    );
  }

  const excluded = resolveIngredientTerms(profile.excludedIngredients, catalog.ingredients).ids;
  const constraints = {
    allergens: profile.allergens,
    excludedIngredientIds: excluded,
    dislikedIngredientIds: [],
    diet: profile.diet,
    maxCookingMinutes: profile.maxCookingMinutes,
    favoriteRecipeIds: favoriteIds,
    mealsPerDay: profile.mealsPerDay,
    householdSize: profile.householdSize,
    weeklyBudgetOre: profile.weeklyBudgetOre,
  };
  const allowed = catalog.recipes.filter((r) => isRecipeAllowed(toPlannerRecipe(r), constraints));

  const days: WeekDay[] = plan.validation.days.map((v) => {
    const date = addDays(plan.weekStart, v.dayIndex);
    return {
      dayIndex: v.dayIndex,
      label: formatWeekday(date),
      isToday: date === today,
      totals: v.totals,
      violations: v.violations,
      meals: plan.meals
        .filter((m) => m.dayIndex === v.dayIndex)
        .map((m) => {
          const r = catalog.recipeById.get(m.recipeId)!;
          return {
            id: m.id,
            dayIndex: m.dayIndex,
            slot: m.slot,
            recipeId: r.id,
            recipeSlug: r.slug,
            recipeName: r.name,
            servings: m.servings,
            householdServings: m.householdServings,
            locked: m.locked,
            kcal: r.nutrition.perServing.energyKcal,
            proteinG: r.nutrition.perServing.proteinG,
            timeMinutes: r.prepMinutes + r.cookMinutes,
            alternatives: allowed
              .filter((a) => a.id !== r.id && a.mealTypes.includes(m.slot))
              .sort(
                (a, b) =>
                  Number(favoriteIds.includes(b.id)) - Number(favoriteIds.includes(a.id)) ||
                  a.name.localeCompare(b.name, "da"),
              )
              .map((a) => ({
                id: a.id,
                name: favoriteIds.includes(a.id) ? `★ ${a.name}` : a.name,
              })),
          };
        }),
    };
  });

  return (
    <>
      <PageHeader
        title="Madplan"
        description={`Uge fra ${formatDate(plan.weekStart, { day: "numeric", month: "long" })} · mål ${formatInt(goal.energyKcal)} kcal og ${goal.proteinG} g protein pr. dag`}
        actions={
          <Button asChild variant="outline">
            <Link href="/indkobsliste">Til indkøb</Link>
          </Button>
        }
      />
      <div className="mb-6">
        <DevNutritionNotice />
      </div>
      <WeekView
        days={days}
        targets={{ energyKcal: goal.energyKcal, proteinG: goal.proteinG }}
        warnings={plan.validation.warnings}
        estimatedCostOre={plan.validation.estimatedCostOre}
        basketEstimateOre={plan.validation.basketEstimateOre ?? null}
        budgetOre={profile.weeklyBudgetOre}
        unknownCostMeals={plan.validation.unknownCostMeals}
        householdSize={profile.householdSize}
      />
    </>
  );
}
