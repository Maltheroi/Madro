import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { FavoritesPicker } from "@/features/favorites/favorites-picker";
import { requireUser } from "@/server/auth";
import { getFavoritesPicker } from "@/server/services/favorites";

export const metadata: Metadata = { title: "Yndlingsretter" };

export default async function FavoriteDishesPage() {
  const user = await requireUser();
  const picker = await getFavoritesPicker(user);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Yndlingsretter"
        description="Vælg 5–10 retter. Madplanen bruger dem oftere og vælger flere retter fra de samme køkkener."
      />
      <FavoritesPicker {...picker} mode="edit" />
    </div>
  );
}
