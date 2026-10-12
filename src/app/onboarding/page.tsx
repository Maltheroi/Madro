import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { ProfileForm } from "@/features/profile/profile-form";
import { requireUser } from "@/server/auth";
import { withUser } from "@/lib/database/db";
import { getProfile } from "@/server/repositories/profile";

export const metadata: Metadata = { title: "Kom i gang" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const profile = await withUser(user.id, (tx) => getProfile(tx, user.id));
  if (profile?.onboardingCompletedAt) redirect("/oversigt");
  return (
    <main id="indhold" className="mx-auto w-full max-w-xl px-4 py-8">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">Lad os sætte dine mål op</h1>
      <p className="text-muted-foreground mt-1">
        Felter markeret som valgfrie kan du springe over og udfylde senere.
      </p>
      <div className="mt-8">
        <ProfileForm mode="wizard" defaults={{}} />
      </div>
    </main>
  );
}
