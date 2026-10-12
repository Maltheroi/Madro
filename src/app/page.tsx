import Link from "next/link";
import { ArrowRight, Calculator, ChefHat, ShoppingBasket, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

const features = [
  {
    icon: Calculator,
    title: "Mål, du kan forstå",
    body: "Et dokumenteret kalorie- og makroestimat ud fra dine oplysninger. Vi viser altid, hvordan tallet er beregnet.",
  },
  {
    icon: ChefHat,
    title: "En uges madplan",
    body: "Syv dage med opskrifter, der passer til dine mål, allergier, din tid og din husstand. Ernæringen beregnes ud fra de faktiske ingredienser.",
  },
  {
    icon: ShoppingBasket,
    title: "Én butik, hele kurven",
    body: "Vi sammenligner den samlede kurv butik for butik og viser, hvilke priser der er aktuelle, forældede eller estimerede.",
  },
  {
    icon: TrendingDown,
    title: "Tilpasser sig dig",
    body: "Når du har vejet dig og registreret din mad i et par uger, foreslår vi forsigtige justeringer, som du selv godkender.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Logo />
        <nav aria-label="Konto" className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/log-ind">Log ind</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/opret-konto">Kom i gang</Link>
          </Button>
        </nav>
      </header>
      <main id="indhold">
        <section className="mx-auto max-w-5xl px-4 pt-10 pb-16 md:pt-20">
          <p className="text-primary text-sm font-medium tracking-wide uppercase">
            Madplan · makroer · indkøb
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl leading-tight font-semibold tracking-tight md:text-5xl">
            Spis efter dine mål. Handl efter dit budget.
          </h1>
          <p className="text-muted-foreground mt-5 max-w-xl text-lg">
            Sæt dine ernæringsmål og dit ugentlige madbudget. Få en personlig madplan, den bedste
            enkelte butik til din kurv og en indkøbsliste med gennemsigtige priser.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/opret-konto">
                Opret gratis konto <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/log-ind">Jeg har en konto</Link>
            </Button>
          </div>
        </section>
        <section aria-labelledby="funktioner" className="bg-card border-t">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 id="funktioner" className="sr-only">
              Funktioner
            </h2>
            <ul className="grid gap-8 md:grid-cols-2">
              {features.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-4">
                  <span className="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="text-muted-foreground mt-1">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="text-muted-foreground mx-auto max-w-5xl px-4 py-12 text-sm">
          <h2 className="text-foreground font-medium">Ærlige data</h2>
          <p className="mt-2 max-w-2xl">
            Madro er i udvikling. Priser fra butikker vises kun, når vi har adgang til dem fra en
            godkendt kilde, og hver pris er mærket som aktuel, forældet, estimeret eller syntetisk
            testdata. Kalorieberegninger er estimater, ikke målinger, og erstatter ikke rådgivning
            fra en læge eller klinisk diætist.
          </p>
        </section>
      </main>
      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-5xl flex-wrap gap-4 px-4 py-6 text-sm">
          <span>© {new Date().getFullYear()} Madro</span>
          <Link href="/privatlivspolitik" className="underline-offset-4 hover:underline">
            Privatlivspolitik
          </Link>
        </div>
      </footer>
    </div>
  );
}
