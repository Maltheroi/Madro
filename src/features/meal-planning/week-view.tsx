"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Lock, LockOpen, Minus, Plus, RefreshCw, Repeat, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativeSelect } from "@/components/ui/native-select";
import {
  describeViolation,
  MEAL_SLOT_LABELS_DA,
  type MealSlot,
  type Violation,
} from "@/features/meal-planning/domain/planner";
import { formatInt, formatKr } from "@/lib/format";
import {
  generatePlanAction,
  repeatWeekAction,
  replaceMealAction,
  setServingsAction,
  toggleLockAction,
} from "./actions";

export interface WeekMeal {
  id: string;
  dayIndex: number;
  slot: MealSlot;
  recipeId: string;
  recipeSlug: string;
  recipeName: string;
  servings: number;
  householdServings: number;
  locked: boolean;
  kcal: number;
  proteinG: number;
  timeMinutes: number;
  alternatives: { id: string; name: string }[];
}

export interface WeekDay {
  dayIndex: number;
  label: string;
  isToday: boolean;
  totals: { energyKcal: number; proteinG: number; carbohydrateG: number; fatG: number };
  violations: Violation[];
  meals: WeekMeal[];
}

export function WeekView({
  days,
  targets,
  warnings,
  estimatedCostOre,
  unknownCostMeals,
  householdSize,
}: {
  days: WeekDay[];
  targets: { energyKcal: number; proteinG: number };
  warnings: string[];
  estimatedCostOre: number | null;
  unknownCostMeals: number;
  householdSize: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.ok ? null : (res.error ?? "Noget gik galt."));
    });

  return (
    <div className="grid gap-6" aria-busy={pending}>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => act(() => generatePlanAction(true))} disabled={pending}>
          <Shuffle aria-hidden /> Lav ny uge (behold låste)
        </Button>
        <Button
          variant="outline"
          onClick={() => act(() => generatePlanAction(false))}
          disabled={pending}
        >
          <RefreshCw aria-hidden /> Start forfra
        </Button>
        <Button variant="ghost" onClick={() => act(repeatWeekAction)} disabled={pending}>
          <Repeat aria-hidden /> Gentag sidste uge
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {warnings.map((w) => (
        <Alert key={w} variant="warning">
          <AlertDescription>{w}</AlertDescription>
        </Alert>
      ))}
      <p className="text-muted-foreground text-sm">
        Anslået råvarepris for ugen{householdSize > 1 ? ` (${householdSize} personer)` : ""}:{" "}
        <strong className="text-foreground">
          {estimatedCostOre === null ? "ukendt" : `ca. ${formatKr(estimatedCostOre)}`}
        </strong>
        {unknownCostMeals > 0 ? ` · ${unknownCostMeals} måltider uden pris` : ""}. Den præcise pris
        beregnes i indkøbskurven.
      </p>
      <ol className="grid gap-4">
        {days.map((d) => {
          const kcalDiff = d.totals.energyKcal - targets.energyKcal;
          return (
            <li
              key={d.dayIndex}
              className={`bg-card rounded-xl border ${d.isToday ? "ring-primary/40 ring-2" : ""}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
                <h2 className="font-semibold capitalize">
                  {d.label}
                  {d.isToday ? (
                    <span className="text-primary ml-2 text-xs font-normal">I dag</span>
                  ) : null}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {formatInt(d.totals.energyKcal)} kcal ({kcalDiff >= 0 ? "+" : ""}
                  {formatInt(kcalDiff)}) · {formatInt(d.totals.proteinG)} g protein
                </p>
              </div>
              {d.violations.length > 0 ? (
                <ul className="bg-warning text-warning-foreground mx-4 mt-3 grid gap-1 rounded-md px-3 py-2 text-sm">
                  {d.violations.map((v, i) => (
                    <li key={i}>Uden for tolerance: {describeViolation(v)}</li>
                  ))}
                </ul>
              ) : null}
              <ul className="divide-y">
                {d.meals.map((m) => (
                  <li key={m.id} className="grid gap-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                          {MEAL_SLOT_LABELS_DA[m.slot]}
                        </p>
                        <Link
                          href={`/opskrifter/${m.recipeSlug}?portioner=${m.servings}`}
                          className="font-medium underline underline-offset-4"
                        >
                          {m.recipeName}
                        </Link>
                        <p className="text-muted-foreground text-sm">
                          {formatInt(m.kcal * m.servings)} kcal ·{" "}
                          {formatInt(m.proteinG * m.servings)} g protein · {m.timeMinutes} min
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => act(() => toggleLockAction(m.id))}
                        disabled={pending}
                        aria-pressed={m.locked}
                        aria-label={m.locked ? `Lås ${m.recipeName} op` : `Lås ${m.recipeName}`}
                      >
                        {m.locked ? (
                          <Lock aria-hidden className="text-primary" />
                        ) : (
                          <LockOpen aria-hidden />
                        )}
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className="flex items-center gap-1"
                        role="group"
                        aria-label={`Portioner af ${m.recipeName}`}
                      >
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9"
                          aria-label="Mindre portion"
                          disabled={pending || m.servings <= 0.5}
                          onClick={() => act(() => setServingsAction(m.id, m.servings - 0.25))}
                        >
                          <Minus aria-hidden />
                        </Button>
                        <span className="min-w-20 text-center text-sm" aria-live="polite">
                          {String(m.servings).replace(".", ",")} portion
                          {m.servings === 1 ? "" : "er"}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9"
                          aria-label="Større portion"
                          disabled={pending || m.servings >= 2}
                          onClick={() => act(() => setServingsAction(m.id, m.servings + 0.25))}
                        >
                          <Plus aria-hidden />
                        </Button>
                      </div>
                      {householdSize > 1 ? (
                        <Badge variant="secondary">
                          Lav {String(m.householdServings).replace(".", ",")} portioner i alt
                        </Badge>
                      ) : null}
                      {m.alternatives.length > 0 ? (
                        <div className="ml-auto w-full sm:w-56">
                          <label className="sr-only" htmlFor={`swap-${m.id}`}>
                            Udskift {m.recipeName}
                          </label>
                          <NativeSelect
                            id={`swap-${m.id}`}
                            value=""
                            disabled={pending}
                            className="h-9"
                            onChange={(e) =>
                              e.target.value && act(() => replaceMealAction(m.id, e.target.value))
                            }
                          >
                            <option value="">Udskift med …</option>
                            {m.alternatives.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </NativeSelect>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function GeneratePlanButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await generatePlanAction(false);
            if (!res.ok) setError(res.error);
          })
        }
      >
        {pending ? "Laver madplan …" : "Lav min madplan"}
      </Button>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
