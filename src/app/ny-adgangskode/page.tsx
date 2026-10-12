import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { UpdatePasswordForm } from "@/features/auth/forms";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Ny adgangskode" };

export default async function NewPasswordPage() {
  await requireUser();
  return (
    <AuthShell title="Vælg en ny adgangskode">
      <UpdatePasswordForm />
    </AuthShell>
  );
}
