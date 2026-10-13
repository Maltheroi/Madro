import type { Metadata } from "next";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Ingen forbindelse" };

export default function OfflinePage() {
  return (
    <main id="indhold" className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-4 px-4">
      <Logo />
      <h1 className="text-2xl font-semibold tracking-tight">Du er offline</h1>
      <p className="text-muted-foreground">
        Madro skal have forbindelse til internettet for at vise dine data. Prøv igen, når du er
        online.
      </p>
      <a href="/oversigt" className="font-medium underline underline-offset-4">
        Prøv igen
      </a>
    </main>
  );
}
