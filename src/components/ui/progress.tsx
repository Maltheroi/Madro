import * as React from "react";
import { cn } from "@/lib/utils";

/** Accessible progress bar. `value` and `max` are numbers; overflow is shown as full. */
function Progress({
  value,
  max = 100,
  label,
  className,
  indicatorClassName,
}: {
  value: number;
  max?: number;
  label: string;
  className?: string;
  indicatorClassName?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      className={cn("bg-muted h-2.5 w-full overflow-hidden rounded-full", className)}
    >
      <div
        className={cn("bg-primary h-full rounded-full transition-all", indicatorClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export { Progress };
