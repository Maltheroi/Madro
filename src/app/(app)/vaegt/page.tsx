import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireUser } from "@/server/auth";
import { withUser } from "@/lib/database/db";
import { getProfile } from "@/server/repositories/profile";
import { getWeightData, previewRecommendation } from "@/server/services/weight";
import {
  dailyWeights,
  linearRegression,
  smoothTrend,
} from "@/features/weight-tracking/domain/trend";
import { addDays } from "@/features/nutrition/domain/intake";
import { ADAPTIVE_RULES } from "@/features/weight-tracking/domain/adaptive";
import {
  formatDate,
  formatDateTime,
  formatDecimal,
  formatInt,
  formatKg,
  todayInCopenhagen,
  formatAmount,
} from "@/lib/format";
import { WeightChart } from "@/features/weight-tracking/weight-chart";
import {
  DecisionButtons,
  DeleteButton,
  EvaluateButton,
  MeasurementForm,
  WeightForm,
} from "@/features/weight-tracking/weight-forms";

export const metadata: Metadata = { title: "Vægt og mål" };

const STATUS_LABEL = {
  pending: "Afventer dit svar",
  accepted: "Accepteret",
  rejected: "Afvist",
  superseded: "Erstattet",
} as const;

function weeksRange(low: number, high: number) {
  const l = Math.max(1, Math.round(low));
  const h = Math.max(l, Math.round(high));
  return l === h ? `ca. ${l} uger` : `${l}–${h} uger`;
}

export default async function WeightPage() {
  const user = await requireUser();
  const today = todayInCopenhagen();
  const [data, preview, profile] = await Promise.all([
    getWeightData(user),
    previewRecommendation(user),
    withUser(user.id, (tx) => getProfile(tx, user.id)),
  ]);
  const days = dailyWeights(data.weights, profile?.timezone);
  const trend = smoothTrend(days);
  const lastDate = days.at(-1)?.date;
  const recent = lastDate ? days.filter((d) => d.date >= addDays(lastDate, -27)) : [];
  const reg = linearRegression(recent.map((d) => ({ date: d.date, value: d.weightKg })));
  const weekly = reg && recent.length >= 4 ? reg.slopePerDay * 7 : null;
  const latestTrend = trend.at(-1)?.trendKg ?? null;
  const pending = data.recommendations.find((r) => r.status === "pending");
  const q = preview?.quality;

  return (
    <>
      <PageHeader
        title="Vægt og mål"
        description="Den udjævnede trend viser din reelle udvikling bedre end de enkelte målinger."
      />
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {latestTrend !== null ? `Trend: ${formatKg(latestTrend)}` : "Ingen målinger endnu"}
              </CardTitle>
              <CardDescription>
                {weekly !== null
                  ? `${weekly <= 0 ? "" : "+"}${formatDecimal(Math.round(weekly * 100) / 100)} kg pr. uge de seneste 4 uger`
                  : "Registrér din vægt et par gange om ugen for at se en trend."}
                {profile?.goalWeightKg ? ` · Målvægt ${formatKg(profile.goalWeightKg)}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trend.length >= 2 ? (
                <WeightChart points={trend.slice(-90)} goalKg={profile?.goalWeightKg ?? null} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Grafen vises, når du har mindst to dages målinger.
                </p>
              )}
            </CardContent>
          </Card>

          {pending ? (
            <Alert variant="info">
              <AlertTitle>
                Forslag: {formatInt(pending.previousTargetKcal)} →{" "}
                {formatInt(pending.recommendedTargetKcal)} kcal pr. dag
              </AlertTitle>
              <AlertDescription className="grid gap-3">
                <ul className="list-disc pl-5">
                  {pending.explanation.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
                <DecisionButtons id={pending.id} />
              </AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Tilpasning af kaloriemål</CardTitle>
              <CardDescription>
                Vi sammenligner din registrerede indtagelse med din vægttrend over{" "}
                {ADAPTIVE_RULES.windowDays} dage. Ændringer er højst ±
                {ADAPTIVE_RULES.maxChangePerAdjustmentKcal} kcal ad gangen, og du bestemmer selv, om
                de skal gælde.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              {q ? (
                <dl className="grid grid-cols-3 gap-3">
                  <div>
                    <dt className="text-muted-foreground">Vejedage</dt>
                    <dd className="font-medium">
                      {q.weighInDays} / {ADAPTIVE_RULES.minWeighInDays}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Periode</dt>
                    <dd className="font-medium">
                      {q.spanDays} / {ADAPTIVE_RULES.minSpanDays} dage
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Komplette madlogs</dt>
                    <dd className="font-medium">
                      {Math.round(q.completeLogShare * 100)} % /{" "}
                      {Math.round(ADAPTIVE_RULES.minCompleteLogShare * 100)} %
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-muted-foreground">
                  Registrér din vægt og dine måltider for at få en vurdering.
                </p>
              )}
              {preview?.decision === "keep" && preview.explanation.length ? (
                <ul className="text-muted-foreground list-disc pl-5">
                  {preview.explanation.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
              {preview?.timeline && profile?.goalWeightKg ? (
                <p>
                  Ved nuværende {preview.timeline.basis === "observed_trend" ? "tempo" : "plan"} kan
                  du forvente at nå {formatKg(profile.goalWeightKg)} om{" "}
                  <strong>
                    {weeksRange(preview.timeline.weeksLow, preview.timeline.weeksHigh)}
                  </strong>
                  . Det er et usikkert skøn, ikke et løfte.
                </p>
              ) : null}
              <EvaluateButton disabled={!preview || Boolean(pending)} />
              {data.recommendations.length ? (
                <details>
                  <summary className="text-muted-foreground cursor-pointer">
                    Tidligere vurderinger
                  </summary>
                  <ul className="mt-2 divide-y">
                    {data.recommendations.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                        <span>
                          {formatDate(r.createdAt)}:{" "}
                          {r.decision === "adjust"
                            ? `${formatInt(r.previousTargetKcal)} → ${formatInt(r.recommendedTargetKcal)} kcal`
                            : "Behold mål"}
                        </span>
                        <Badge variant={r.status === "accepted" ? "success" : "secondary"}>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Registrér vægt</CardTitle>
              <CardDescription>
                Vej dig gerne om morgenen efter toiletbesøg for sammenlignelige tal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WeightForm today={today} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Kropsmål</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <MeasurementForm today={today} />
              {data.measurements.length ? (
                <ul className="divide-y text-sm">
                  {data.measurements.slice(0, 10).map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span>
                        {formatDate(m.measuredAt)}:{" "}
                        {m.waistCm !== null ? `talje ${formatAmount(m.waistCm)} cm` : ""}
                        {m.waistCm !== null && m.bodyFatPercent !== null ? " · " : ""}
                        {m.bodyFatPercent !== null
                          ? `fedt ${formatAmount(m.bodyFatPercent)} %`
                          : ""}
                      </span>
                      <DeleteButton
                        id={m.id}
                        kind="measurement"
                        label={`måling fra ${formatDate(m.measuredAt)}`}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Seneste vejninger</CardTitle>
            </CardHeader>
            <CardContent>
              {data.weights.length === 0 ? (
                <p className="text-muted-foreground text-sm">Ingen vejninger endnu.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {[...data.weights]
                    .reverse()
                    .slice(0, 14)
                    .map((w) => (
                      <li key={w.id} className="flex items-center justify-between gap-2 py-1.5">
                        <span>
                          {formatDateTime(w.measuredAt)} · <strong>{formatKg(w.weightKg)}</strong>
                          {w.note ? (
                            <span className="text-muted-foreground"> · {w.note}</span>
                          ) : null}
                        </span>
                        <DeleteButton
                          id={w.id}
                          kind="weight"
                          label={`vejning ${formatKg(w.weightKg)}`}
                        />
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
