import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Privatlivspolitik" };

/**
 * Draft privacy notice. Must be reviewed by a qualified person before
 * commercial launch (see docs/SECURITY_AND_PRIVACY.md).
 */
export default function PrivacyPage() {
  return (
    <main id="indhold" className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" aria-label="Til forsiden">
        <Logo />
      </Link>
      <h1 className="mt-8 text-2xl font-semibold">Privatlivspolitik (udkast)</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Dette er et udkast, som skal gennemgås juridisk før kommerciel lancering.
      </p>
      <div className="mt-6 space-y-5 leading-relaxed">
        <section>
          <h2 className="font-semibold">Hvilke oplysninger behandler vi?</h2>
          <p>
            E-mail og adgangskode (krypteret af vores login-udbyder), fødselsår, køn til beregning, højde, vægt, mål,
            kostpræferencer, allergier, madregistreringer, kropsmål, indkøbslister og budget. Vægt, kropsmål, kost og
            allergier er helbredsoplysninger (særlige kategorier efter GDPR art. 9), som vi kun behandler med dit
            udtrykkelige samtykke.
          </p>
        </section>
        <section>
          <h2 className="font-semibold">Hvorfor?</h2>
          <p>
            For at beregne dine mål, lave madplaner, sammenligne indkøbskurve og vise din udvikling. Vi sælger ikke dine
            data og bruger dem ikke til reklame.
          </p>
        </section>
        <section>
          <h2 className="font-semibold">Hvem deler vi med?</h2>
          <p>
            Hosting og database (Supabase) og hosting af webappen. Hvis AI-assistance er slået til, sendes kun de
            oplysninger, der er nødvendige for forespørgslen (fx ingredienser og allergener), uden navn eller e-mail.
            Butikspriser hentes fra eksterne kilder, men vi sender ingen personoplysninger til dem.
          </p>
        </section>
        <section>
          <h2 className="font-semibold">Dine rettigheder</h2>
          <p>
            Du kan til enhver tid se, rette, eksportere og slette dine data under Profil → Privatliv og konto. Sletning
            af kontoen fjerner alle dine personlige data permanent.
          </p>
        </section>
        <section>
          <h2 className="font-semibold">Ikke medicinsk rådgivning</h2>
          <p>
            Madro giver estimater og generelle anbefalinger. Er du gravid, ammer, har en spiseforstyrrelse, diabetes
            eller en anden sygdom, bør du søge rådgivning hos din læge eller en autoriseret klinisk diætist.
          </p>
        </section>
      </div>
    </main>
  );
}
