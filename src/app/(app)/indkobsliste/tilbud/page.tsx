import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { requireUser } from "@/server/auth";
import { offersForMyList, searchOffers } from "@/server/services/offers";
import { OfferList, OfferSourceNote } from "@/features/offers/offer-list";
import { formatInt } from "@/lib/format";

export const metadata: Metadata = { title: "Ugens tilbud" };

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kaede?: string }>;
}) {
  const user = await requireUser();
  const { q, kaede } = await searchParams;
  const searching = Boolean(q?.trim() || kaede);
  const [result, forList] = await Promise.all([
    searchOffers(user, { q, retailer: kaede }),
    searching ? Promise.resolve(null) : offersForMyList(user),
  ]);

  return (
    <>
      <PageHeader
        title="Ugens tilbud"
        description="Avistilbud fra de danske kæder. Søg efter en vare, eller se tilbud på det, din madplan kræver."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/indkobsliste/madspild">Madspild nær dig</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/indkobsliste">Til indkøbslisten</Link>
            </Button>
          </>
        }
      />
      <div className="grid gap-4">
        <OfferSourceNote lastSyncAt={result.lastSyncAt} />

        <form method="get" className="grid gap-2 sm:grid-cols-[1fr_14rem_auto]" role="search">
          <label className="sr-only" htmlFor="q">
            Søg i tilbud
          </label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Fx kylling, skyr, havregryn"
          />
          <label className="sr-only" htmlFor="kaede">
            Kæde
          </label>
          <NativeSelect id="kaede" name="kaede" defaultValue={kaede ?? ""}>
            <option value="">Alle kæder</option>
            {result.retailers.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit">Søg</Button>
        </form>

        {forList && forList.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Tilbud på din madplan</CardTitle>
              <CardDescription>
                Fundet ud fra varenavnene. Tjek at varen passer, før du køber. Tilbud indgår ikke i
                butikssammenligningen.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {forList.map((i) => (
                <section key={i.ingredientId} aria-label={i.name}>
                  <h3 className="text-sm font-semibold">{i.name}</h3>
                  <OfferList offers={i.offers} />
                </section>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>
              {searching ? "Søgeresultat" : "Alle aktuelle tilbud"}{" "}
              <span className="text-muted-foreground text-sm font-normal">
                ({formatInt(result.total)})
              </span>
            </CardTitle>
            {result.total > result.offers.length ? (
              <CardDescription>
                Viser de første {formatInt(result.offers.length)}. Søg eller vælg en kæde for at se
                flere.
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            {result.offers.length ? (
              <OfferList offers={result.offers} />
            ) : (
              <p className="text-muted-foreground text-sm">
                {result.lastSyncAt
                  ? "Ingen aktuelle tilbud matcher."
                  : "Der er ikke hentet tilbud endnu. Når tilbudsjobbet har kørt, vises ugens tilbud her."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
