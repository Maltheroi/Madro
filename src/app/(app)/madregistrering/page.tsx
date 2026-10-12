import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth";
import { withUser } from "@/lib/database/db";
import { getActiveGoal } from "@/server/repositories/profile";
import { getDiaryRange } from "@/server/services/diary";
import { getPlanForWeek, currentWeekStart } from "@/server/services/meal-plan";
import {
  addDays,
  averageOfLoggedDays,
  dailyTotals,
  dateRange,
} from "@/features/nutrition/domain/intake";
import { MEAL_SLOT_LABELS_DA, MEAL_SLOTS } from "@/features/meal-planning/domain/planner";
import { formatDate, formatInt, formatWeekday, mondayOf, todayInCopenhagen } from "@/lib/format";
import { isoDate } from "@/lib/validation/common";
import {
  AddEntryPanel,
  DayCompleteToggle,
  DeleteEntryButton,
} from "@/features/food-diary/diary-forms";

export const metadata: Metadata = { title: "Madregistrering" };

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ dato?: string }>;
}) {
  const user = await requireUser();
  const today = todayInCopenhagen();
  const { dato } = await searchParams;
  const date = isoDate.safeParse(dato).success && dato! <= today ? dato! : today;
  const weekFrom = addDays(date, -6);
  const [goal, range, planData] = await Promise.all([
    withUser(user.id, (tx) => getActiveGoal(tx, user.id)),
    getDiaryRange(user, weekFrom, date),
    getPlanForWeek(user, mondayOf(date)),
  ]);
  const dayEntries = range.entries.filter((e) => e.entryDate === date);
  const totals = dayEntries.reduce(
    (a, e) => ({
      energyKcal: a.energyKcal + e.energyKcal,
      proteinG: a.proteinG + e.proteinG,
      carbohydrateG: a.carbohydrateG + e.carbohydrateG,
      fatG: a.fatG + e.fatG,
    }),
    { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0 },
  );
  const week = averageOfLoggedDays(
    dailyTotals(range.entries.map((e) => ({ ...e, date: e.entryDate }))),
  );
  const days = dateRange(weekFrom, date);

  const plan = planData.plan;
  const dayIndex = plan
    ? Math.round((Date.parse(date) - Date.parse(plan.weekStart)) / 86_400_000)
    : -1;
  const loggedPlannedIds = new Set<string>();
  const planned = (plan?.meals ?? [])
    .filter((m) => m.dayIndex === dayIndex)
    .map((m) => {
      const r = planData.catalog.recipeById.get(m.recipeId)!;
      const logged = dayEntries.some(
        (e) => e.source === "planned_meal" && e.description === r.name,
      );
      if (logged) loggedPlannedIds.add(m.id);
      return {
        id: m.id,
        label: `${MEAL_SLOT_LABELS_DA[m.slot]}: ${r.name} (${String(m.servings).replace(".", ",")} port.)`,
        logged,
      };
    });
  const recipes = planData.catalog.recipes.map((r) => ({ id: r.id, name: r.name }));
  const ingredients = [...planData.catalog.ingredients.values()]
    .filter((i) => i.facts.length > 0)
    .sort((a, b) => a.nameDa.localeCompare(b.nameDa, "da"))
    .map((i) => ({ id: i.ingredientId, name: i.nameDa, states: i.facts.map((f) => f.state) }));

  const macro = (label: string, value: number, target: number | undefined, unit: string) => (
    <div className="grid gap-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {formatInt(value)} / {target !== undefined ? formatInt(target) : "–"} {unit}
        </span>
      </div>
      <Progress value={value} max={target ?? 1} label={`${label} i forhold til mål`} />
    </div>
  );

  return (
    <>
      <PageHeader title="Madregistrering" description={formatWeekday(date)} />
      <nav aria-label="Vælg dag" className="mb-4 flex items-center justify-between">
        <Button asChild variant="outline" size="sm">
          <Link href={`/madregistrering?dato=${addDays(date, -1)}`}>
            <ChevronLeft aria-hidden /> Forrige dag
          </Link>
        </Button>
        {date !== today ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/madregistrering">I dag</Link>
          </Button>
        ) : null}
        {date < today ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/madregistrering?dato=${addDays(date, 1)}`}>
              Næste dag <ChevronRight aria-hidden />
            </Link>
          </Button>
        ) : (
          <span />
        )}
      </nav>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {formatInt(totals.energyKcal)} / {goal ? formatInt(goal.energyKcal) : "–"} kcal
              </CardTitle>
              <CardDescription>
                {goal
                  ? `${formatInt(goal.energyKcal - totals.energyKcal)} kcal tilbage`
                  : "Intet mål"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {macro("Energi", totals.energyKcal, goal?.energyKcal, "kcal")}
              {macro("Protein", totals.proteinG, goal?.proteinG, "g")}
              {macro("Kulhydrat", totals.carbohydrateG, goal?.carbohydrateG, "g")}
              {macro("Fedt", totals.fatG, goal?.fatG, "g")}
            </CardContent>
          </Card>
          <DayCompleteToggle date={date} complete={range.completeDays.has(date)} />
          <Card>
            <CardHeader>
              <CardTitle>Registreret</CardTitle>
            </CardHeader>
            <CardContent>
              {dayEntries.length === 0 ? (
                <p className="text-muted-foreground text-sm">Intet registreret endnu.</p>
              ) : (
                <ul className="divide-y">
                  {[...MEAL_SLOTS, null].flatMap((slot) =>
                    dayEntries
                      .filter((e) => e.slot === slot)
                      .map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{e.description}</p>
                            <p className="text-muted-foreground text-xs">
                              {slot ? `${MEAL_SLOT_LABELS_DA[slot]} · ` : ""}
                              {formatInt(e.energyKcal)} kcal · P {formatInt(e.proteinG)} g · K{" "}
                              {formatInt(e.carbohydrateG)} g · F {formatInt(e.fatG)} g
                              {e.source === "manual" ? " · manuelt indtastet" : ""}
                            </p>
                          </div>
                          <DeleteEntryButton id={e.id} label={e.description} />
                        </li>
                      )),
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Tilføj</CardTitle>
            </CardHeader>
            <CardContent>
              <AddEntryPanel
                date={date}
                planned={planned}
                recipes={recipes}
                ingredients={ingredients}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Seneste 7 dage</CardTitle>
              <CardDescription>
                Gennemsnit af {week.loggedDays} dage med registreringer. Dage uden registrering
                tæller ikke som 0.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p>
                {formatInt(week.energyKcal)} kcal · {formatInt(week.proteinG)} g protein pr. dag
                {goal && week.energyKcal !== null
                  ? ` (${week.energyKcal - goal.energyKcal >= 0 ? "+" : ""}${formatInt(week.energyKcal - goal.energyKcal)} kcal i forhold til målet)`
                  : ""}
              </p>
              <ul
                className="grid grid-cols-7 gap-1 text-center text-xs"
                aria-label="Registrerede dage"
              >
                {days.map((d) => {
                  const logged = range.entries.some((e) => e.entryDate === d);
                  const complete = range.completeDays.has(d);
                  return (
                    <li
                      key={d}
                      className={`rounded-md py-2 ${complete ? "bg-primary text-primary-foreground" : logged ? "bg-accent" : "bg-muted text-muted-foreground"}`}
                    >
                      <span aria-hidden>{formatDate(d, { weekday: "short" }).slice(0, 2)}</span>
                      <span className="sr-only">
                        {formatWeekday(d)}:{" "}
                        {complete
                          ? "komplet"
                          : logged
                            ? "delvist registreret"
                            : "ingen registrering"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
          {plan === null && currentWeekStart() === mondayOf(date) ? (
            <p className="text-muted-foreground text-sm">
              Tip: Med en{" "}
              <Link href="/madplan" className="text-primary underline">
                madplan
              </Link>{" "}
              kan du registrere måltider med ét tryk.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
