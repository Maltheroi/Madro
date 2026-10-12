"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  NotebookPen,
  Scale,
  ShoppingCart,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/oversigt", label: "Oversigt", icon: LayoutDashboard },
  { href: "/madplan", label: "Madplan", icon: CalendarDays },
  { href: "/madregistrering", label: "Madregistrering", short: "Mad", icon: NotebookPen },
  { href: "/vaegt", label: "Vægt og mål", short: "Vægt", icon: Scale },
  { href: "/indkobsliste", label: "Indkøbsliste", short: "Indkøb", icon: ShoppingCart },
  { href: "/profil", label: "Profil", icon: UserRound },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Sidebar on wide screens, bottom tab bar on mobile. */
export function AppNav() {
  const pathname = usePathname();
  return (
    <>
      <nav aria-label="Hovedmenu" className="hidden md:block">
        <ul className="grid gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={cn(
                  "text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                  isActive(pathname, href) && "bg-accent text-accent-foreground",
                )}
              >
                <Icon aria-hidden className="size-5" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav
        aria-label="Hovedmenu"
        className="bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-6 pb-[env(safe-area-inset-bottom)]">
          {NAV_ITEMS.map((item) => {
            const { href, label, icon: Icon } = item;
            const short = "short" in item ? item.short : label;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-label={label}
                  aria-current={isActive(pathname, href) ? "page" : undefined}
                  className={cn(
                    "text-muted-foreground flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
                    isActive(pathname, href) && "text-primary font-semibold",
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                  <span aria-hidden>{short}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
