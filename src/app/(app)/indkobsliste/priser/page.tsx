import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PriceStatusBadge } from "@/components/data-badges";
import { requireUser } from "@/server/auth";
import { withUser } from "@/lib/database/db";
import { loadPriceData } from "@/server/services/catalog";
import { formatPackage } from "@/server/services/shopping";
import { effectivePrice } from "@/features/grocery-pricing/domain/prices";
import { formatDate, formatKr } from "@/lib/format";
import { ManualPriceForm } from "@/features/shopping-list/basket-forms";

export const metadata: Metadata = { title: "Indtast priser" };

export default async function ManualPricesPage({
  searchParams,
}: {
  searchParams: Promise<{ butik?: string }>;
}) {
  const user = await requireUser();
  const now = new Date();
  const { butik } = await searchParams;
  const { prices, ingredientNames } = await withUser(user.id, async (tx) => {
    const [prices, names] = await Promise.all([
      loadPriceData(tx, now),
      tx`select id, name_da from public.ingredients`,
    ]);
    return {
      prices,
      ingredientNames: new Map(names.map((n) => [n.id as string, n.name_da as string])),
    };
  });
  const store = prices.stores.find((s) => s.id === butik) ?? prices.stores[0];
  const products = store
    ? prices.products
        .filter((p) => p.retailerId === store.retailerId)
        .sort((a, b) => a.name.localeCompare(b.name, "da"))
    : [];

  return (
    <>
      <PageHeader
        title="Indtast priser"
        description="Har du set en pris i butikken? Indtast den her. Prisen gemmes kun for dig, markeres som estimeret og bruges i dine beregninger."
      />
      <nav aria-label="Vælg butik" className="mb-4 flex flex-wrap gap-2">
        {prices.stores.map((s) => (
          <Link
            key={s.id}
            href={`/indkobsliste/priser?butik=${s.id}`}
            aria-current={s.id === store?.id ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${s.id === store?.id ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
          >
            {s.name}
          </Link>
        ))}
      </nav>
      {!store ? (
        <p className="text-muted-foreground">Der er ingen butikker i kataloget endnu.</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{store.name}</CardTitle>
            <CardDescription>{products.length} varer</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {products.map((p) => {
                const price = effectivePrice(
                  prices.observations,
                  p.id,
                  store.id,
                  store.retailerId,
                  now,
                );
                const ingredients = prices.matches
                  .filter((m) => m.productId === p.id)
                  .map((m) => ingredientNames.get(m.ingredientId))
                  .filter(Boolean);
                return (
                  <li
                    key={p.id}
                    className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <div>
                      <p className="font-medium">
                        {p.name}{" "}
                        <span className="text-muted-foreground font-normal">
                          · {formatPackage(p.packageQuantity, p.packageUnit)}
                        </span>
                      </p>
                      <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                        {ingredients.length ? (
                          <span>Bruges til: {ingredients.join(", ")}</span>
                        ) : null}
                        {price ? (
                          <>
                            <span>
                              {formatKr(price.observation.priceOre)} (
                              {formatDate(price.observation.observedAt)})
                            </span>
                            <PriceStatusBadge status={price.status} />
                          </>
                        ) : (
                          <PriceStatusBadge status={null} />
                        )}
                      </p>
                    </div>
                    <ManualPriceForm productId={p.id} storeId={store.id} label={p.name} />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
