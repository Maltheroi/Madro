import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/server/auth";
import { withUser } from "@/lib/database/db";
import { listProviders } from "@/server/providers/registry";
import type { ProviderStatus } from "@/server/providers/types";
import { formatDateTime, formatInt } from "@/lib/format";

export const metadata: Metadata = { title: "Datakilder" };

const STATUS: Record<
  ProviderStatus,
  { label: string; variant: "success" | "warning" | "info" | "outline" }
> = {
  active: { label: "Aktiv", variant: "success" },
  fixture: { label: "Kun testdata", variant: "warning" },
  not_configured: { label: "Ikke konfigureret", variant: "outline" },
  awaiting_agreement: { label: "Afventer aftale", variant: "info" },
};

export default async function DataSourcesPage() {
  const user = await requireUser();
  const data = await withUser(user.id, async (tx) => {
    const [[admin]] = await Promise.all([tx`select public.is_admin() as a`]);
    if (!admin?.a) return null;
    const [jobs, prices, sources, [offerSync]] = await Promise.all([
      tx`select provider_key, job_type, status, started_at, finished_at, records_seen, records_written, error_message
         from public.data_sync_jobs order by created_at desc limit 20`,
      tx`select source_key, is_synthetic, price_type, count(*)::int as n, max(observed_at) as latest
         from public.price_observations where reported_by is null group by 1, 2, 3 order by 1, 3`,
      tx`select s.key, s.name, s.verification_status, s.version, count(f.id)::int as facts
         from public.nutrition_sources s left join public.nutrition_facts f on f.source_id = s.id group by s.id order by s.key`,
      tx`select max(finished_at) as at from public.data_sync_jobs
         where provider_key = 'shelfatlas' and status = 'succeeded'`,
    ]);
    return { jobs, prices, sources, offersSyncedAt: (offerSync?.at as Date | null) ?? null };
  });
  // Non-admins get a 404 rather than a hint that the page exists.
  if (!data) notFound();
  const providers = listProviders({ offersSyncedAt: data.offersSyncedAt });

  return (
    <>
      <PageHeader
        title="Datakilder"
        description="Status for ernærings-, produkt- og prisdata. Kun synlig for administratorer."
      />
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Udbydere</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {providers.map((p) => (
                <li key={p.key} className="grid gap-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge variant={STATUS[p.status].variant}>{STATUS[p.status].label}</Badge>
                    <span className="text-muted-foreground text-xs">{p.kinds.join(", ")}</span>
                  </div>
                  <p className="text-muted-foreground text-sm">{p.note}</p>
                  <p className="text-muted-foreground text-xs">
                    Licens: {p.licence}
                    {p.requiredEnv?.length ? ` · Miljøvariabler: ${p.requiredEnv.join(", ")}` : ""}
                    {p.docsUrl ? (
                      <>
                        {" · "}
                        <a
                          href={p.docsUrl}
                          className="text-primary underline"
                          rel="noreferrer"
                          target="_blank"
                        >
                          Dokumentation
                        </a>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Prisobservationer</CardTitle>
              <CardDescription>Brugerindtastede priser er ikke medregnet.</CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left">
                  <tr>
                    <th className="py-1 font-normal">Kilde</th>
                    <th className="py-1 font-normal">Type</th>
                    <th className="py-1 text-right font-normal">Antal</th>
                    <th className="py-1 text-right font-normal">Seneste</th>
                  </tr>
                </thead>
                <tbody>
                  {data.prices.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1.5">
                        {r.source_key}{" "}
                        {r.is_synthetic ? <Badge variant="warning">syntetisk</Badge> : null}
                      </td>
                      <td>{r.price_type}</td>
                      <td className="text-right">{formatInt(r.n)}</td>
                      <td className="text-right">{formatDateTime(new Date(r.latest))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Næringsdatakilder</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {data.sources.map((s) => (
                  <li key={s.key} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {s.name} {s.version ? `(${s.version})` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {formatInt(s.facts)} værdisæt · {s.verification_status}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Synkroniseringer</CardTitle>
          </CardHeader>
          <CardContent>
            {data.jobs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Ingen synkroniseringer er kørt endnu. Der er ingen aktive live-prisudbydere.
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {data.jobs.map((j, i) => (
                  <li key={i} className="py-1.5">
                    {j.provider_key} · {j.job_type} · {j.status} · {formatInt(j.records_written)}/
                    {formatInt(j.records_seen)}
                    {j.error_message ? (
                      <span className="text-destructive"> · {j.error_message}</span>
                    ) : null}
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
