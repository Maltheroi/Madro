import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { FavoritesPicker } from "@/features/favorites/favorites-picker";
import { requireUser } from "@/server/auth";
import { withUser } from "@/lib/database/db";
import { getProfile } from "@/server/repositories/profile";
import { getFavoritesPicker } from "@/server/services/favorites";

export const metadata: Metadata = { title: "Dine yndlingsretter" };

export default async function OnboardingDishesPage() {
  const user = await requireUser();
  const profile = await withUser(user.id, (tx) => getProfile(tx, user.id));
  if (!profile?.onboardingCompletedAt) redirect("/onboarding");
  const picker = await getFavoritesPicker(user);
  return (
    <main id="indhold" className="mx-auto w-full max-w-2xl px-4 py-8">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Hvad kan du lide at spise?</h1>
      <p className="text-muted-foreground mt-1">
        Vælg 5–10 af dine yndlingsretter eller retter, du ofte laver. Madplanen bruger dem oftere og
        vælger flere retter fra de samme køkkener.
      </p>
      <div className="mt-6">
        <FavoritesPicker {...picker} mode="onboarding" />
      </div>
    </main>
  );
}
