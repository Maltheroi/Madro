import { Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatKr } from "@/lib/format";
import type { OfferView } from "@/server/services/offers";

const UNIT_LABEL = { kg: "kg", l: "l", stk: "stk." } as const;

function validity(o: OfferView, now: Date): string {
  const short = { day: "numeric", month: "short" } as const;
  if (Date.parse(o.validFrom) > now.getTime()) return `Fra ${formatDate(o.validFrom, short)}`;
  return `Til og med ${formatDate(o.validTo, short)}`;
}

/** One line per offer: title, chain, validity, offer price and the published before/unit price. */
export function OfferList({
  offers,
  showChain = true,
}: {
  offers: OfferView[];
  showChain?: boolean;
}) {
  const now = new Date();
  return (
    <ul className="divide-y">
      {offers.map((o) => (
        <li key={o.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="font-medium break-words">{o.title}</p>
            <p className="text-muted-foreground text-xs">
              {showChain ? `${o.retailerName} · ` : ""}
              {validity(o, now)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-semibold">{formatKr(o.priceOre)}</p>
            {o.regularPriceOre ? (
              <p className="text-muted-foreground text-xs line-through">
                {formatKr(o.regularPriceOre)}
              </p>
            ) : null}
            {o.unitPriceOre && o.unitPriceUnit ? (
              <p className="text-muted-foreground text-xs">
                {formatKr(o.unitPriceOre)}/{UNIT_LABEL[o.unitPriceUnit]}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function OfferSourceNote({ lastSyncAt }: { lastSyncAt: Date | null }) {
  return (
    <div role="note" className="bg-muted text-muted-foreground flex gap-3 rounded-lg p-3 text-sm">
      <Tag aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>
        <Badge variant="info" className="mr-1">
          Tilbudspris
        </Badge>
        Avistilbud fra kæderne via{" "}
        <a href="https://shelfatlas.com" className="underline" rel="noreferrer" target="_blank">
          ShelfAtlas
        </a>
        {lastSyncAt ? `, hentet ${formatDate(lastSyncAt, { day: "numeric", month: "short" })}` : ""}
        . Det er kampagnepriser, ikke almindelige hyldepriser, og kædens egen avis gælder. Tilbud
        kan være udsolgt eller kun gælde i nogle butikker.
      </p>
    </div>
  );
}
