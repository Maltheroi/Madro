export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-lg font-semibold tracking-tight ${className ?? ""}`}
    >
      <svg aria-hidden viewBox="0 0 32 32" className="size-7">
        <circle cx="16" cy="16" r="15" className="fill-primary" />
        <path
          d="M9 19c2.5 3 11.5 3 14 0"
          className="stroke-primary-foreground"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M16 8c-3 2-3 6 0 8 3-2 3-6 0-8z" className="fill-primary-foreground" />
      </svg>
      Madro
    </span>
  );
}
