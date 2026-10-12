import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/server/auth";
import { withUser } from "@/lib/database/db";
import { getActiveGoal } from "@/server/repositories/profile";
import {
  describeNote,
  kcalFromMacros,
  type EstimateNote,
} from "@/features/nutrition/domain/energy";
import { formatDate, formatInt } from "@/lib/format";
import { TolerancesForm } from "@/features/profile/account-forms";

export const metadata: Metadata = { title: "Ernæringsmål" };

const SOURCE = {
  estimate: "Beregnet estimat",
  user: "Dit eget mål",
  adaptive: "Tilpasset ud fra dine data",
} as const;

export default async function GoalsPage() {
  const user = await requireUser();
  const { goal, history } = await withUser(user.id, async (tx) => ({
    goal: await getActiveGoal(tx, user.id),
    history:
      await tx`select energy_kcal, source, effective_from from public.nutrition_goals where user_id = ${user.id} order by effective_from desc limit 12`,
  }));
  if (!goal) {
    return (
      <>
        <PageHeader title="Ernæringsmål" />
        <p>
          Du har intet mål endnu.{" "}
          <Link href="/profil" className="text-primary underline">
            Udfyld din profil
          </Link>
          .
        </p>
      </>
    );
  }
  const macroKcal = kcalFromMacros(goal);
  // Adaptive goals store a reference to their recommendation instead of estimate notes.
  const notes = (goal.calculationNotes as { code?: string }[]).filter(
    (n) => goal.source === "estimate" && typeof n?.code === "string",
  ) as EstimateNote[];
  return (
    <>
      <PageHeader
        title="Ernæringsmål"
        description="Dine mål er vejledende og ikke medicinsk rådgivning."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{formatInt(goal.energyKcal)} kcal pr. dag</CardTitle>
              <Badge variant="secondary">{SOURCE[goal.source]}</Badge>
            </div>
            <CardDescription>Gælder fra {formatDate(goal.effectiveFrom)}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="text-muted-foreground">Protein</dt>
                <dd className="text-lg font-medium">{formatInt(goal.proteinG)} g</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Kulhydrat</dt>
                <dd className="text-lg font-medium">{formatInt(goal.carbohydrateG)} g</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fedt</dt>
                <dd className="text-lg font-medium">{formatInt(goal.fatG)} g</dd>
              </div>
            </dl>
            {goal.bmrKcal && goal.tdeeKcal ? (
              <p className="text-muted-foreground">
                Hvilestofskifte (Mifflin-St Jeor) {formatInt(goal.bmrKcal)} kcal · estimeret samlet
                forbrug {formatInt(goal.tdeeKcal)} kcal.
              </p>
            ) : null}
            {Math.abs(macroKcal - goal.energyKcal) > 30 ? (
              <p className="text-muted-foreground">
                Makronæringsstofferne svarer til {formatInt(macroKcal)} kcal på grund af afrunding
                og dine egne valg.
              </p>
            ) : null}
            {notes.length ? (
              <ul className="text-muted-foreground list-disc pl-5">
                {notes.map((n, i) => (
                  <li key={i}>{describeNote(n)}</li>
                ))}
              </ul>
            ) : null}
            <p>
              Vil du ændre målet? Opdatér din{" "}
              <Link href="/profil" className="text-primary underline">
                profil
              </Link>{" "}
              og vælg at beregne målene igen, eller angiv dit eget mål.
            </p>
          </CardContent>
        </Card>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Tolerancer for madplanen</CardTitle>
              <CardDescription>
                Hvor langt en dag i madplanen må afvige fra dine mål, før den markeres.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TolerancesForm
                defaults={{
                  energy: goal.toleranceEnergy,
                  proteinShortfall: goal.toleranceProteinShortfall,
                  carbohydrate: goal.toleranceCarbohydrate,
                  fat: goal.toleranceFat,
                }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Historik</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {history.map((h, i) => (
                  <li key={i} className="flex justify-between py-1.5">
                    <span>{formatDate(new Date(h.effective_from))}</span>
                    <span>
                      {formatInt(h.energy_kcal)} kcal · {SOURCE[h.source as keyof typeof SOURCE]}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
