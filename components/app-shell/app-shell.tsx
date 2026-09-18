import type { ReactNode } from "react";
import Link from "next/link";
import { APP_NAME } from "@/lib/domain/status";
import { getCurrentUser } from "@/lib/auth/session";
import { NavLinks } from "@/components/app-shell/nav-links";
import { UserMenu } from "@/components/app-shell/user-menu";

/**
 * Nav shell. The brand is a logo mark plus wordmark sitting in its own
 * group, divided from the nav by a rule and real space, so it never reads
 * as the first tab; the nav itself highlights the current section as a
 * filled pill.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  const links: { href: string; label: string }[] = user
    ? [
        { href: "/dashboard", label: "Dashboard" },
      ]
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-muted/30 text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-5 px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80">
            <span
              aria-hidden
              className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
            >
              K
            </span>
            <span className="hidden text-[0.9375rem] font-semibold tracking-tight sm:inline">{APP_NAME}</span>
          </Link>

          {links.length > 0 ? (
            <>
              <span aria-hidden className="h-7 w-px shrink-0 bg-border" />
              <nav aria-label="Main" className="flex min-w-0 items-center gap-1 overflow-x-auto">
                <NavLinks links={links} />
              </nav>
            </>
          ) : null}

          {user ? <UserMenu displayName={user.displayName} email={user.email} /> : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
