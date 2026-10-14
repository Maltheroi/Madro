import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PriceStatusBadge, SyntheticDataNotice } from "@/components/data-badges";
import { requireUser } from "@/server/auth";
import { withUser } from "@/lib/database/db";
import { getProfile } from "@/server/repositories/profile";
import {
  formatPackage,
  formatQuantity,
  getLatestBasket,
  getRequiredItems,
} from "@/server/services/shopping";
import { formatDateTime, formatKr } from "@/lib/format";
import type { UnmatchedReason } from "@/features/basket-optimization/domain/optimizer";
import { CalculateBasketForm } from "@/features/shopping-list/basket-forms";
import { createListAction } from "@/features/shopping-list/actions";

export const metadata: Metadata = { title: "Sammenlign butikker" };

const REASON: Record<UnmatchedReason, string> = {
  no_product: "ingen matchende vare",
  no_price: "ingen pris",
  incompatible_unit: "enhed kan ikke sammenlignes",
  allergen_conflict: "varen indeholder et af dine allergener",
};

export default async function BasketPage() {
  const user = await requireUser();
  const [basket, required, profile] = await Promise.all([
    getLatestBasket(user),
    getRequiredItems(user),
    withUser(user.id, (tx) => getProfile(tx, user.id)),
  ]);
  const r = basket?.result;
  const synthetic = r?.baskets.some((b) => b.statusCounts.synthetic > 0) ?? false;

  return (
    <>
      <PageHeader
        title="Sammenlign butikker"
        description="Vi beregner prisen for hele madplanen i én butik ad gangen og regner med hele pakninger."
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Beregn</CardTitle>
              <CardDescription>
                {required
                  ? `${required.items.filter((i) => i.toBuy > 0).length} varer skal købes.`
                  : "Du har ingen madplan for denne uge."}
                {profile?.weeklyBudgetOre ? ` Ugebudget: ${formatKr(profile.weeklyBudgetOre)}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {required ? (
                <CalculateBasketForm
                  hasBudget={Boolean(profile?.weeklyBudgetOre)}
                  defaultMode={basket?.mode ?? "best_value"}
                />
              ) : (
                <Button asChild>
                  <Link href="/madplan">Gå til madplan</Link>
                </Button>
              )}
            </CardContent>
          </Card>
          <p className="text-muted-foreground text-sm">
            Mangler en pris?{" "}
            <Link href="/indkobsliste/priser" className="text-primary underline">
              Indtast priser fra butikken
            </Link>
            . De gemmes kun for dig.
          </p>
        </div>

        <div className="grid content-start gap-4">
          {synthetic ? <SyntheticDataNotice /> : null}
          {r ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {r.recommended ? `Anbefalet: ${r.recommended.store.name}` : "Ingen anbefaling"}
                  </CardTitle>
                  <CardDescription>Beregnet {formatDateTime(basket!.calculatedAt)}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  <ul className="list-disc pl-5">
                    {r.explanation.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                  {r.budget?.suggestions.length ? (
                    <div>
                      <p className="font-medium">Forslag til at holde budgettet:</p>
                      <ul className="list-disc pl-5">
                        {r.budget.suggestions.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              {[...r.baskets]
                .sort(
                  (a, b) =>
                    Number(b.complete) - Number(a.complete) ||
                    a.checkoutTotalOre - b.checkoutTotalOre,
                )
                .map((b) => (
                  <Card
                    key={b.store.id}
                    className={
                      r.recommended?.store.id === b.store.id ? "border-primary" : undefined
                    }
                  >
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle>{b.store.name}</CardTitle>
                        <div className="flex gap-1">
                          {r.recommended?.store.id === b.store.id ? <Badge>Anbefalet</Badge> : null}
                          {!b.complete ? <Badge variant="warning">Mangler varer</Badge> : null}
                          {b.withinBudget === false ? (
                            <Badge variant="warning">Over budget</Badge>
                          ) : null}
                        </div>
                      </div>
                      <CardDescription>
                        {/* Baskets saved before optimizer 1.1 have no weekly cost. */}
                        {b.weeklyCostOre !== undefined
                          ? `Ugentlig madudgift ${formatKr(b.weeklyCostOre)} · `
                          : ""}
                        Ved kassen {formatKr(b.checkoutTotalOre)} · bruges i planen{" "}
                        {formatKr(b.consumedValueOre)} · rester {formatKr(b.leftoverValueOre)}
                        {b.likelyWasteValueOre > 0
                          ? ` (heraf sandsynligt spild ${formatKr(b.likelyWasteValueOre)})`
                          : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      <details>
                        <summary className="text-muted-foreground cursor-pointer text-sm">
                          {b.lines.length} varer
                          {b.unmatched.length ? `, ${b.unmatched.length} mangler` : ""}
                        </summary>
                        <ul className="mt-2 divide-y text-sm">
                          {b.lines.map((l) => (
                            <li
                              key={l.ingredientId}
                              className="flex items-start justify-between gap-2 py-2"
                            >
                              <div>
                                <p className="font-medium">
                                  {l.packages} × {l.productName}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                  {l.ingredientName}:{" "}
                                  {formatQuantity(l.requiredQuantity, l.dimension)} · pakning{" "}
                                  {formatPackage(l.packageQuantity, l.packageUnit)}
                                  {l.matchQuality === "substitute" ? " · erstatning" : ""}
                                  {l.priceType === "promotional" && l.regularPriceOre
                                    ? ` · tilbud (normalt ${formatKr(l.regularPriceOre)})`
                                    : ""}
                                </p>
                              </div>
                              <div className="text-right">
                                <p>{formatKr(l.lineCostOre)}</p>
                                <PriceStatusBadge status={l.priceStatus} />
                              </div>
                            </li>
                          ))}
                          {b.unmatched.map((u) => (
                            <li
                              key={u.ingredientId}
                              className="text-muted-foreground flex justify-between gap-2 py-2"
                            >
                              <span>
                                {u.ingredientName}
                                {!u.required ? " (valgfri)" : ""}
                              </span>
                              <span>{REASON[u.reason]}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                      <form action={createListAction}>
                        <input type="hidden" name="basketId" value={basket!.id} />
                        <input type="hidden" name="storeId" value={b.store.id} />
                        <Button
                          type="submit"
                          variant={r.recommended?.store.id === b.store.id ? "default" : "outline"}
                        >
                          Lav indkøbsliste til {b.store.name}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                ))}
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Ingen beregning endnu</CardTitle>
                <CardDescription>
                  Tryk på “Beregn kurv” for at sammenligne butikkerne.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
