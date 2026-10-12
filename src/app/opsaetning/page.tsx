import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = { title: "Opsætning mangler" };

/** Shown when required environment variables are missing. */
export default function SetupPage() {
  return (
    <AuthShell title="Opsætning mangler" subtitle="Appen er ikke forbundet til en database endnu.">
      <div className="space-y-3 text-sm">
        <p>
          Sæt miljøvariablerne fra <code>.env.example</code> (Supabase-URL, publishable key og
          DATABASE_URL), og genstart serveren. Se <code>docs/LOCAL_DEVELOPMENT.md</code>.
        </p>
      </div>
    </AuthShell>
  );
}
