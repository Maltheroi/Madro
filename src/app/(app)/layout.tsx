import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth";
import { withUser } from "@/lib/database/db";
import { getProfile } from "@/server/repositories/profile";
import { signOut } from "@/features/auth/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const profile = await withUser(user.id, (tx) => getProfile(tx, user.id));
  if (!profile?.onboardingCompletedAt) redirect("/onboarding");
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl md:gap-8 md:px-6">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col py-6 md:flex">
        <Link href="/oversigt" className="mb-8 px-3" aria-label="Til oversigten">
          <Logo />
        </Link>
        <AppNav />
        <form action={signOut} className="mt-auto px-1">
          <Button
            type="submit"
            variant="ghost"
            className="text-muted-foreground w-full justify-start"
          >
            <LogOut aria-hidden /> Log ud
          </Button>
        </form>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between px-4 pt-4 md:hidden">
          <Logo />
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" aria-label="Log ud">
              <LogOut aria-hidden />
            </Button>
          </form>
        </header>
        <main id="indhold" className="px-4 pt-4 pb-28 md:px-0 md:py-8">
          {children}
        </main>
      </div>
      <div className="md:hidden">
        <AppNav />
      </div>
    </div>
  );
}
