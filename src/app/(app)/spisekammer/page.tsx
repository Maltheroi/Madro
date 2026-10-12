import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/server/auth";
import { getPantry } from "@/server/services/shopping";
import { UNIT_LABELS_DA } from "@/features/nutrition/domain/units";
import { formatAmount, formatDate, todayInCopenhagen } from "@/lib/format";
import { addDays } from "@/features/nutrition/domain/intake";
import { PantryForm } from "@/features/shopping-list/basket-forms";
import { DeletePantryButton } from "@/features/shopping-list/pantry-delete";

export const metadata: Metadata = { title: "Spisekammer" };

export default async function PantryPage() {
  const user = await requireUser();
  const { items, ingredients } = await getPantry(user);
  const today = todayInCopenhagen();
  const staleBefore = addDays(today, -30);
  return (
    <>
      <PageHeader
        title="Spisekammer"
        description="Det, du allerede har, trækkes fra indkøbslisten."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tilføj eller opdatér</CardTitle>
            <CardDescription>
              Findes varen allerede med samme enhed, overskrives mængden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PantryForm ingredients={ingredients} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Det har du</CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-muted-foreground text-sm">Dit spisekammer er tomt.</p>
            ) : (
              <ul className="divide-y text-sm">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium">
                        {i.ingredientName}: {formatAmount(i.quantity)} {UNIT_LABELS_DA[i.unit]}
                      </p>
                      <p className="text-muted-foreground flex flex-wrap gap-1 text-xs">
                        Bekræftet {formatDate(i.confirmedAt)}
                        {i.expiresOn ? ` · holdbar til ${formatDate(i.expiresOn)}` : ""}
                        {i.expiresOn && i.expiresOn < today ? (
                          <Badge variant="warning">Udløbet</Badge>
                        ) : null}
                        {i.confirmedAt.slice(0, 10) < staleBefore ? (
                          <Badge variant="outline">Tjek om du stadig har den</Badge>
                        ) : null}
                      </p>
                    </div>
                    <DeletePantryButton id={i.id} label={i.ingredientName} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
