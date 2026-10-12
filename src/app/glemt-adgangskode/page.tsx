import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ResetRequestForm } from "@/features/auth/forms";

export const metadata: Metadata = { title: "Glemt adgangskode" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Glemt adgangskode" subtitle="Vi sender dig et link til at vælge en ny adgangskode.">
      <ResetRequestForm />
    </AuthShell>
  );
}
