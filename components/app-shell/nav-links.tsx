"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavLinksProps {
  links: { href: string; label: string }[];
}

/**
 * Primary nav with an unmistakable current-section state: the active link
 * is a filled pill, not merely a slightly darker text colour (which read
 * as "nothing is highlighted" at a glance).
 */
export function NavLinks({ links }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <>
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
              active
                ? "bg-secondary font-semibold text-foreground shadow-xs"
                : "font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
