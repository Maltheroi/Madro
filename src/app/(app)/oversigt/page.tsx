import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/page-header";
import { countFavorites } from "@/server/services/favorites";
import { requireUser } from "@/server/auth";
import { withUser } from "@/lib/database/db";
import { getActiveGoal, getProfile } from "@/server/repositories/profile";
import { getPlanForWeek, currentWeekStart } from "@/server/services/meal-plan";
import { getDiaryRange } from "@/server/services/diary";
import { getWeightData } from "@/server/services/weight";
import { getLatestList } from "@/server/services/shopping";
import { dailyWeights, smoothTrend } from "@/features/weight-tracking/domain/trend";
import { MEAL_SLOT_LABELS_DA, type MealSlot } from "@/features/meal-planning/domain/planner";
import { formatDecimal, formatInt, formatKg, formatKr, todayInCopenhagen } from "@/lib/format";

export const metadata: Metadata = { title: "Oversigt" };

function hourInCopenhagen() {
  return Number(
    new Intl.DateTimeFormat("da-DK", {
      hour: "numeric",
      hour12: false,
      timeZone: "Europe/Copenhagen",
    }).format(new Date()),
  );
}

const SLOT_END_HOUR: Record<MealSlot, number> = { breakfast: 10, lunch: 14, snack: 16, dinner: 21 };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ velkommen?: string }>;
}) {
  const { velkommen } = await searchParams;
  const user = await requireUser();
  const today = todayInCopenhagen();
  const [{ profile, goal }, planData, diary, weight, list, favoriteCount] = await Promise.all([
    withUser(user.id, async (tx) => ({
      profile: await getProfile(tx, user.id),
      goal: await getActiveGoal(tx, user.id),
    })),
    getPlanForWeek(user),
    getDiaryRange(user, today, today),
    getWeightData(user),
    getLatestList(user),
    countFavorites(user),
  ]);

  const eaten = diary.entries.reduce(
    (a, e) => ({ kcal: a.kcal + e.energyKcal, protein: a.protein + e.proteinG }),
    { kcal: 0, protein: 0 },
  );

  // Next meal: today's planned meals not yet logged, in slot order, after the current time window.
  const plan = planData.plan;
  const dayIndex = plan
    ? Math.round((Date.parse(today) - Date.parse(plan.weekStart)) / 86_400_000)
    : -1;
  const loggedPlanned = new Set(
    diary.entries.filter((e) => e.source === "planned_meal").map((e) => e.description),
  );
  const hour = hourInCopenhagen();
  const todaysMeals = plan?.meals.filter((m) => m.dayIndex === dayIndex) ?? [];
  const nextMeal =
    todaysMeals.find((m) => {
      const r = planData.catalog.recipeById.get(m.recipeId);
      return r && !loggedPlanned.has(r.name) && hour < SLOT_END_HOUR[m.slot];
    }) ??
    todaysMeals.find(
      (m) => !loggedPlanned.has(planData.catalog.recipeById.get(m.recipeId)?.name ?? ""),
    );
  const nextRecipe = nextMeal ? planData.catalog.recipeById.get(nextMeal.recipeId) : null;

  const trend = smoothTrend(
    dailyWeights(weight.weights.map((w) => ({ measuredAt: w.measuredAt, weightKg: w.weightKg }))),
  );
  const latestTrend = trend.at(-1);
  const weekAgo = trend
    .filter((p) => Date.parse(p.date) <= Date.parse(today) - 7 * 86_400_000)
    .at(-1);
  const pendingRec = weight.recommendations.find((r) => r.status === "pending");

  const listForThisWeek =
    list && plan && new Date(list.createdAt) >= new Date(`${currentWeekStart()}T00:00:00Z`)
      ? list
      : null;
  const budget = profile?.weeklyBudgetOre ?? null;

  return (
    <>
      <PageHeader
        title={`Hej${profile?.displayName ? ` ${profile.displayName}` : ""}`}
        description="Her er din dag."
      />
      {velkommen ? (
        <Alert variant="success" className="mb-6">
          <AlertDescription>
            Dine mål er gemt. Næste skridt er at lave din første madplan.
          </AlertDescription>
        </Alert>
      ) : null}
      {favoriteCount < 5 ? (
        <Alert variant="info" className="mb-6">
          <Info aria-hidden />
          <AlertDescription>
            Vælg 5–10 yndlingsretter, så madplanen passer bedre til dig.{" "}
            <Link href="/profil/yndlingsretter" className="font-medium underline">
              Vælg retter
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      {pendingRec ? (
        <Alert variant="info" className="mb-6">
          <Info aria-hidden />
          <AlertDescription>
            <p>
              Vi har en ny anbefaling til dit kaloriemål:{" "}
              {formatInt(pendingRec.recommendedTargetKcal)} kcal (nu{" "}
              {formatInt(pendingRec.previousTargetKcal)} kcal).{" "}
              <Link href="/vaegt" className="font-medium underline">
                Se forklaringen
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Kalorier i dag</CardDescription>
            <CardTitle className="text-3xl">
              {formatInt(eaten.kcal)}{" "}
              <span className="text-muted-foreground text-base font-normal">
                / {goal ? formatInt(goal.energyKcal) : "–"} kcal
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Progress
              value={eaten.kcal}
              max={goal?.energyKcal ?? 1}
              label="Kalorier i forhold til dagens mål"
            />
            <p className="text-muted-foreground text-sm">
              {goal
                ? goal.energyKcal - eaten.kcal >= 0
                  ? `${formatInt(goal.energyKcal - eaten.kcal)} kcal tilbage`
                  : `${formatInt(eaten.kcal - goal.energyKcal)} kcal over målet`
                : "Intet mål endnu"}
              {goal
                ? ` · mål: ${goal.source === "adaptive" ? "tilpasset dine data" : goal.source === "user" ? "dit eget" : "estimat"}`
                : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Protein i dag</CardDescription>
            <CardTitle className="text-3xl">
              {formatInt(eaten.protein)}{" "}
              <span className="text-muted-foreground text-base font-normal">
                / {goal ? goal.proteinG : "–"} g
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Progress
              value={eaten.protein}
              max={goal?.proteinG ?? 1}
              label="Protein i forhold til dagens mål"
              indicatorClassName="bg-chart-3"
            />
            <Link
              href="/madregistrering"
              className="text-primary text-sm underline underline-offset-4"
            >
              Registrér mad
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Næste måltid</CardDescription>
            {nextMeal && nextRecipe ? (
              <CardTitle>
                <Link
                  href={`/opskrifter/${nextRecipe.slug}?portioner=${nextMeal.servings}`}
                  className="underline underline-offset-4"
                >
                  {nextRecipe.name}
                </Link>
              </CardTitle>
            ) : (
              <CardTitle>
                {plan ? "Ikke flere planlagte måltider i dag" : "Ingen madplan endnu"}
              </CardTitle>
            )}
          </CardHeader>
          <CardContent>
            {nextMeal && nextRecipe ? (
              <p className="text-muted-foreground text-sm">
                {MEAL_SLOT_LABELS_DA[nextMeal.slot]} ·{" "}
                {formatInt(nextRecipe.nutrition.perServing.energyKcal * nextMeal.servings)} kcal ·{" "}
                {formatInt(nextRecipe.nutrition.perServing.proteinG * nextMeal.servings)} g protein
              </p>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/madplan">
                  {plan ? "Se madplanen" : "Lav en madplan"} <ArrowRight aria-hidden />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Vægttrend</CardDescription>
            <CardTitle className="text-3xl">
              {latestTrend ? formatKg(latestTrend.trendKg) : "–"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {latestTrend && weekAgo
                ? `${latestTrend.trendKg - weekAgo.trendKg >= 0 ? "+" : ""}${formatDecimal(latestTrend.trendKg - weekAgo.trendKg)} kg på en uge (udjævnet)`
                : "Vej dig et par gange om ugen for at se en trend."}
            </p>
            <Link href="/vaegt" className="text-primary text-sm underline underline-offset-4">
              Registrér vægt
            </Link>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardDescription>Madbudget denne uge</CardDescription>
            <CardTitle className="text-2xl">
              {budget === null
                ? "Intet budget sat"
                : listForThisWeek
                  ? `${formatKr(budget - listForThisWeek.totals.expectedOre)} tilbage`
                  : `${formatKr(budget)} til rådighed`}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {budget !== null && listForThisWeek ? (
              <>
                <Progress
                  value={listForThisWeek.totals.expectedOre}
                  max={budget}
                  label="Forventet indkøb i forhold til ugebudget"
                  indicatorClassName={
                    listForThisWeek.totals.expectedOre > budget ? "bg-destructive" : "bg-chart-2"
                  }
                />
                <p className="text-muted-foreground text-sm">
                  Forventet indkøb {formatKr(listForThisWeek.totals.expectedOre)} ud fra
                  indkøbslisten. Priserne er{" "}
                  {listForThisWeek.totals.statusCounts.synthetic > 0
                    ? "syntetiske testpriser"
                    : "vejledende"}
                  .
                </p>
              </>
            ) : (
              <Link
                href="/indkobsliste"
                className="text-primary text-sm underline underline-offset-4"
              >
                {plan
                  ? "Find den bedste butik til ugens kurv"
                  : "Lav en madplan for at beregne kurven"}
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
