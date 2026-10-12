"use client";

import { Button } from "@/components/ui/button";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="bg-card rounded-xl border p-6">
      <h1 className="text-lg font-semibold">Noget gik galt</h1>
      <p className="text-muted-foreground mt-1">
        Siden kunne ikke indlæses. Dine data er ikke gået tabt.
      </p>
      <Button className="mt-4" onClick={reset}>
        Prøv igen
      </Button>
    </div>
  );
}
