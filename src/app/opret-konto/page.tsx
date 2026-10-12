import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { SignUpForm } from "@/features/auth/forms";

export const metadata: Metadata = { title: "Opret konto" };

export default function SignUpPage() {
  return (
    <AuthShell title="Opret konto" subtitle="Det tager under et minut. Derefter sætter vi dine mål op.">
      <SignUpForm />
    </AuthShell>
  );
}
