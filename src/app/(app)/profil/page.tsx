import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth";
import { withUser } from "@/lib/database/db";
import { getLatestWeightKg, getProfile } from "@/server/repositories/profile";
import { ProfileForm } from "@/features/profile/profile-form";
import type { ProfileInput } from "@/features/profile/schema";
import { signOut } from "@/features/auth/actions";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await requireUser();
  const { profile, weight, isAdmin } = await withUser(user.id, async (tx) => {
    const [profile, weight, [admin]] = await Promise.all([
      getProfile(tx, user.id),
      getLatestWeightKg(tx, user.id),
      tx`select public.is_admin() as a`,
    ]);
    return { profile, weight, isAdmin: Boolean(admin?.a) };
  });
  const p = profile!;
  const str = (n: number | null | undefined) =>
    n === null || n === undefined ? "" : String(n).replace(".", ",");
  const defaults: Partial<ProfileInput> = {
    displayName: p.displayName ?? "",
    birthYear: str(p.birthYear),
    sex: p.sex ?? "unspecified",
    heightCm: str(p.heightCm),
    weightKg: str(weight),
    goalWeightKg: str(p.goalWeightKg),
    targetBodyFatPercent: str(p.targetBodyFatPercent),
    activityLevel: p.activityLevel ?? "light",
    trainingDaysPerWeek: str(p.trainingDaysPerWeek ?? 0),
    goal: p.goal ?? "maintenance",
    weeklyRatePercent: str(p.weeklyRatePercent),
    diet: p.diet,
    allergens: p.allergens as ProfileInput["allergens"],
    excludedIngredients: p.excludedIngredients.join(", "),
    dislikedIngredients: p.dislikedIngredients.join(", "),
    allowCalorieEstimate: p.allowCalorieEstimate,
    mealsPerDay: str(p.mealsPerDay),
    maxCookingMinutes: str(p.maxCookingMinutes),
    cookingSkill: p.cookingSkill,
    householdSize: str(p.householdSize),
    weeklyBudgetKr: str(p.weeklyBudgetOre === null ? null : p.weeklyBudgetOre / 100),
    postalCode: p.postalCode ?? "",
  };
  const links = [
    { href: "/profil/mal", label: "Ernæringsmål og tolerancer" },
    { href: "/profil/yndlingsretter", label: "Yndlingsretter" },
    { href: "/spisekammer", label: "Spisekammer" },
    { href: "/profil/privatliv", label: "Privatliv, dataeksport og sletning" },
    ...(isAdmin ? [{ href: "/admin/datakilder", label: "Datakilder (administrator)" }] : []),
  ];
  return (
    <>
      <PageHeader title="Profil" description={user.email ?? undefined} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ProfileForm mode="edit" defaults={defaults} />
        <div className="grid content-start gap-4">
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="hover:bg-muted flex items-center justify-between px-4 py-3 text-sm"
                    >
                      {l.label} <ChevronRight aria-hidden className="size-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <form action={signOut}>
            <Button type="submit" variant="outline" className="w-full">
              Log ud
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
