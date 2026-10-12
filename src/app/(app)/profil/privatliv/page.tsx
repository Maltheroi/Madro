import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth";
import { DeleteAccountForm } from "@/features/profile/account-forms";

export const metadata: Metadata = { title: "Privatliv og data" };

export default async function PrivacyPage() {
  await requireUser();
  return (
    <>
      <PageHeader
        title="Privatliv og data"
        description="Dine helbredsoplysninger er dine. Her kan du hente eller slette dem."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hent dine data</CardTitle>
            <CardDescription>
              Download alle dine oplysninger som en JSON-fil: profil, mål, vægt, kropsmål,
              madregistreringer, madplaner, indkøbslister og priser, du selv har indtastet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href="/api/eksport" download>
                Download mine data
              </a>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Slet konto</CardTitle>
            <CardDescription>
              Din konto og alle personlige data slettes straks og permanent. Anonyme sikkerhedslogs
              uden personoplysninger kan blive gemt i op til 30 dage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteAccountForm />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sådan bruger vi dine data</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              Vægt, kropsmål og kost er helbredsoplysninger. De bruges kun til at beregne dine mål,
              madplaner og indkøbslister og deles ikke med butikker eller andre.
            </p>
            <p>
              Hvis AI-funktioner slås til, sendes kun de oplysninger, der er nødvendige for
              forespørgslen, og aldrig dit navn eller din e-mail.
            </p>
            <p>
              Læs hele{" "}
              <Link href="/privatlivspolitik" className="text-primary underline">
                privatlivspolitikken
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
