import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/features/auth/forms";

export const metadata: Metadata = { title: "Log ind" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; fejl?: string }>;
}) {
  const { next, fejl } = await searchParams;
  return (
    <AuthShell title="Log ind" subtitle="Velkommen tilbage.">
      {fejl === "link" ? (
        <p role="alert" className="bg-warning text-warning-foreground mb-4 rounded-md p-3 text-sm">
          Linket er ugyldigt eller udløbet. Prøv igen.
        </p>
      ) : null}
      <LoginForm next={next} />
    </AuthShell>
  );
}
