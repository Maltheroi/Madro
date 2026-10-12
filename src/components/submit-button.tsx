"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function SubmitButton({ children, pendingText, className, variant }: { children: React.ReactNode; pendingText?: string; className?: string; variant?: "default" | "outline" | "secondary" | "destructive" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className={className} variant={variant}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending ? (pendingText ?? "Gemmer …") : children}
    </Button>
  );
}
