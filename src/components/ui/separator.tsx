import { cn } from "@/lib/utils";

function Separator({ className }: { className?: string }) {
  return <hr className={cn("border-border", className)} />;
}

export { Separator };
