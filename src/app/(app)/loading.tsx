export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="grid gap-4">
      <span className="sr-only">Indlæser …</span>
      <div className="bg-muted h-8 w-48 animate-pulse rounded-md" />
      <div className="bg-muted h-32 animate-pulse rounded-xl" />
      <div className="bg-muted h-32 animate-pulse rounded-xl" />
    </div>
  );
}
