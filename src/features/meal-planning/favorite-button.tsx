"use client";

import { useOptimistic, useTransition } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleFavoriteAction } from "./actions";

export function FavoriteButton({ recipeId, initial }: { recipeId: string; initial: boolean }) {
  const [fav, setFav] = useOptimistic(initial);
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      aria-pressed={fav}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setFav(!fav);
          await toggleFavoriteAction(recipeId);
        })
      }
    >
      <Heart aria-hidden className={fav ? "fill-primary text-primary" : ""} />
      {fav ? "Favorit" : "Gem som favorit"}
    </Button>
  );
}
