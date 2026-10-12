import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SyntheticDataNotice } from "@/components/data-badges";
import { requireUser } from "@/server/auth";
import { formatQuantity, getLatestList, getRequiredItems } from "@/server/services/shopping";
import { formatDate, formatKr } from "@/lib/format";
import { AddManualItemForm, ShoppingListItems } from "@/features/shopping-list/list-view";

export const metadata: Metadata = { title: "Indkøbsliste" };

export default async function ShoppingListPage() {
  const user = await requireUser();
  const [list, required] = await Promise.all([getLatestList(user), getRequiredItems(user)]);
  const actions = (
    <>
      <Button asChild variant="outline">
        <Link href="/spisekammer">Spisekammer</Link>
      </Button>
      <Button asChild>
        <Link href="/indkobsliste/kurv">
          {list ? "Sammenlign butikker igen" : "Sammenlign butikker"}
        </Link>
      </Button>
    </>
  );

  if (!list) {
    return (
      <>
        <PageHeader
          title="Indkøbsliste"
          description="Listen laves ud fra din godkendte madplan og dit spisekammer."
          actions={required ? actions : undefined}
        />
        {!required ? (
          <Card>
            <CardHeader>
              <CardTitle>Ingen madplan for denne uge</CardTitle>
              <CardDescription>
                Lav en madplan først. Så samler vi ingredienserne til en indkøbsliste.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/madplan">Gå til madplan</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Det skal du bruge denne uge</CardTitle>
              <CardDescription>
                Sammenlign butikker for at få pakningsstørrelser og priser på listen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {required.items.map((i) => (
                  <li key={i.ingredientId} className="flex justify-between gap-2 py-2">
                    <span>
                      {i.name}
                      {!i.required ? (
                        <span className="text-muted-foreground"> (valgfri)</span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground">
                      {i.toBuy > 0 ? formatQuantity(i.toBuy, i.dimension) : "Har du allerede"}
                      {i.coveredByPantry > 0 && i.toBuy > 0
                        ? ` (${formatQuantity(i.coveredByPantry, i.dimension)} fra spisekammer)`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </>
    );
  }

  const t = list.totals;
  const synthetic = t.statusCounts.synthetic > 0;
  const checked = list.items.filter((i) => i.checked && !i.removed).length;
  const active = list.items.filter((i) => !i.removed).length;
  return (
    <>
      <PageHeader
        title={list.title}
        description={`Oprettet ${formatDate(list.createdAt)}`}
        actions={actions}
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="order-2 lg:order-1">
          <CardHeader>
            <CardTitle>
              {checked} af {active} varer i kurven
            </CardTitle>
            <Progress value={checked} max={Math.max(active, 1)} label="Varer lagt i kurven" />
          </CardHeader>
          <CardContent className="grid gap-6">
            <ShoppingListItems items={list.items} />
            <AddManualItemForm listId={list.id} />
          </CardContent>
        </Card>
        <div className="order-1 grid content-start gap-4 lg:order-2">
          {synthetic ? <SyntheticDataNotice /> : null}
          <Card>
            <CardHeader>
              <CardTitle>{formatKr(t.expectedOre)}</CardTitle>
              <CardDescription>
                Forventet pris for {t.pricedItems} varer med pris
                {t.unpricedItems > 0
                  ? `. ${t.unpricedItems} varer har ingen pris og er ikke med.`
                  : "."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {t.remainingBudgetOre !== null ? (
                <p className={t.remainingBudgetOre < 0 ? "text-destructive" : ""}>
                  {t.remainingBudgetOre >= 0
                    ? `${formatKr(t.remainingBudgetOre)} tilbage af budgettet`
                    : `${formatKr(-t.remainingBudgetOre)} over budgettet`}
                </p>
              ) : null}
              <p>
                Betalt indtil nu: <strong>{formatKr(t.confirmedOre)}</strong> ({t.confirmedItems}{" "}
                varer med indtastet pris)
              </p>
              <p className="text-muted-foreground">
                At krydse en vare af betyder kun, at den er i kurven. Skriv den betalte pris for at
                følge dit reelle forbrug.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
