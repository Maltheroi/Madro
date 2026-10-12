"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deletePantryAction } from "./actions";

export function DeletePantryButton({ id, label }: { id: string; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Fjern ${label}`}
      disabled={pending}
      onClick={() => startTransition(() => deletePantryAction(id))}
    >
      <Trash2 aria-hidden />
    </Button>
  );
}
