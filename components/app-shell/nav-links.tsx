"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavLinksProps {
  links: { href: string; label: string }[];
}

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
              "text-sm transition-colors",
              active ? "font-medium text-neutral-900" : "text-neutral-600 hover:text-neutral-900"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
