"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border bg-card p-6">
      <h1 className="text-lg font-semibold">Noget gik galt</h1>
      <p className="mt-1 text-muted-foreground">Siden kunne ikke indlæses. Dine data er ikke gået tabt.</p>
      <Button className="mt-4" onClick={reset}>
        Prøv igen
      </Button>
    </div>
  );
}
