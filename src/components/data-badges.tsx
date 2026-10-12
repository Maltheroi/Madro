import { AlertTriangle, CheckCircle2, FlaskConical, Clock, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PRICE_STATUS_LABELS_DA, type PriceStatus } from "@/features/grocery-pricing/domain/prices";
import type { DataConfidence } from "@/features/nutrition/domain/recipe-nutrition";

export function PriceStatusBadge({ status }: { status: PriceStatus | null }) {
  if (!status) return <Badge variant="outline">Ingen pris</Badge>;
  const map = {
    live: { variant: "success" as const, Icon: CheckCircle2 },
    stale: { variant: "warning" as const, Icon: Clock },
    estimated: { variant: "info" as const, Icon: PencilLine },
    synthetic: { variant: "warning" as const, Icon: FlaskConical },
  }[status];
  return (
    <Badge variant={map.variant}>
      <map.Icon aria-hidden /> {PRICE_STATUS_LABELS_DA[status]}
    </Badge>
  );
}

const CONFIDENCE_LABEL: Record<DataConfidence, string> = {
  high: "Høj",
  medium: "Middel",
  low: "Lav",
};

export function NutritionConfidenceBadge({
  confidence,
  completeness,
}: {
  confidence: DataConfidence;
  completeness: number;
}) {
  const variant = confidence === "high" ? "success" : confidence === "medium" ? "info" : "warning";
  return (
    <Badge variant={variant} title={`Datadækning ${Math.round(completeness * 100)} %`}>
      {confidence !== "high" ? <AlertTriangle aria-hidden /> : null}
      Datakvalitet: {CONFIDENCE_LABEL[confidence]}
    </Badge>
  );
}

/** Banner shown wherever synthetic prices may appear. */
export function SyntheticDataNotice() {
  return (
    <div
      role="note"
      className="bg-warning text-warning-foreground flex gap-3 rounded-lg p-3 text-sm"
    >
      <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>Testpriser.</strong> Der er endnu ikke forbundet en godkendt priskilde. Priserne her
        er syntetiske udviklingsdata for fiktive demokæder og ikke rigtige butikspriser.
      </p>
    </div>
  );
}

export function DevNutritionNotice() {
  return (
    <div role="note" className="bg-info text-info-foreground flex gap-3 rounded-lg p-3 text-sm">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>
        Næringsværdierne er foreløbige udviklingsdata og endnu ikke verificeret mod Frida (DTU
        Fødevareinstituttet). Brug dem som vejledende.
      </p>
    </div>
  );
}
