import type { Metadata } from "next";
import Link from "next/link";
import { Leaf } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth";
import { foodWasteNearMe } from "@/server/services/offers";
import { formatDate, formatDateTime, formatInt, formatKr } from "@/lib/format";

export const metadata: Metadata = { title: "Madspild nær dig" };

export default async function FoodWastePage() {
  const user = await requireUser();
  const result = await foodWasteNearMe(user);

  return (
    <>
      <PageHeader
        title="Madspild nær dig"
        description="Varer med kort holdbarhed, som Netto, føtex og Bilka har sat ned i butikker nær dit postnummer."
        actions={
          <Button asChild variant="outline">
            <Link href="/indkobsliste/tilbud">Ugens tilbud</Link>
          </Button>
        }
      />
      <div className="grid gap-4">
        <div
          role="note"
          className="bg-muted text-muted-foreground flex gap-3 rounded-lg p-3 text-sm"
        >
          <Leaf aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>
            Data fra Salling Group, vist som de udgiver dem. Lageret er kun vejledende, og varer kan
            være solgt, før du når frem. Kun dit postnummer sendes til Salling Group.
          </p>
        </div>

        {result.status === "not_configured" ? (
          <Card>
            <CardHeader>
              <CardTitle>Ikke sat op endnu</CardTitle>
              <CardDescription>
                Madspild-tilbud kræver en gratis nøgle fra Salling Groups udviklerportal
                (SALLING_API_KEY).
              </CardDescription>
            </CardHeader>
          </Card>
        ) : result.status === "no_postal_code" ? (
          <Card>
            <CardHeader>
              <CardTitle>Vi mangler dit postnummer</CardTitle>
              <CardDescription>
                Skriv dit postnummer på din profil, så finder vi butikker nær dig.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/profil">Gå til profil</Link>
              </Button>
            </CardContent>
          </Card>
        ) : result.status === "error" ? (
          <Card>
            <CardHeader>
              <CardTitle>Kunne ikke hente madspild-tilbud</CardTitle>
              <CardDescription>Salling Group svarede ikke. Prøv igen om lidt.</CardDescription>
            </CardHeader>
          </Card>
        ) : result.stores.every((s) => s.clearances.length === 0) ? (
          <p className="text-muted-foreground text-sm">
            Ingen nedsatte varer i butikker nær {result.postalCode} lige nu.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              Postnummer {result.postalCode} · hentet {formatDateTime(result.fetchedAt)}
            </p>
            {result.stores
              .filter((s) => s.clearances.length > 0)
              .map((s) => (
                <Card key={s.id}>
                  <CardHeader>
                    <CardTitle>{s.name}</CardTitle>
                    <CardDescription>
                      {[s.street, [s.zip, s.city].filter(Boolean).join(" ")]
                        .filter(Boolean)
                        .join(", ")}{" "}
                      · {formatInt(s.clearances.length)} varer
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y">
                      {s.clearances.map((c, i) => (
                        <li
                          key={`${c.ean ?? c.description}-${i}`}
                          className="flex items-start justify-between gap-3 py-2.5 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-medium break-words">{c.description}</p>
                            <p className="text-muted-foreground text-xs">
                              {c.endTime
                                ? `Til ${formatDate(c.endTime, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                                : "Slutdato ukendt"}
                              {c.stock !== null ? ` · ca. ${formatInt(c.stock)} på lager` : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-semibold">{formatKr(c.newPriceOre)}</p>
                            {c.originalPriceOre ? (
                              <p className="text-muted-foreground text-xs line-through">
                                {formatKr(c.originalPriceOre)}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
          </>
        )}
      </div>
    </>
  );
}
