import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="indhold" className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold">Siden findes ikke</h1>
      <p className="text-muted-foreground mt-2">Linket kan være forkert, eller siden er flyttet.</p>
      <Button asChild className="mt-6">
        <Link href="/oversigt">Til oversigten</Link>
      </Button>
    </main>
  );
}
