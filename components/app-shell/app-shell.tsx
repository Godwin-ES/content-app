import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/domain/status";
import { getCurrentUser } from "@/lib/auth/session";
import { NavLinks } from "@/components/app-shell/nav-links";
import { UserMenu } from "@/components/app-shell/user-menu";

/**
 * Role-aware nav shell (Phase 1 of the post-Task-22 UX pass): the brand
 * mark is visually separated from the nav links (its own border-right
 * rather than sharing a flex gap with them, which previously made it read
 * as one of the tabs), links highlight when active, and identity/sign-out
 * are now reachable (the signOut() action already existed with nothing in
 * the UI calling it).
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  const links: { href: string; label: string }[] = [];
  if (user?.role === "content_manager") {
    links.push({ href: "/dashboard", label: "Dashboard" }, { href: "/publishing", label: "Publishing Queue" });
    if (process.env.ENABLE_AI_TEST_MODE === "true") {
      links.push({ href: "/test-benchmark", label: "Test & Benchmark" });
    }
  }
  if (user?.role === "reviewer") {
    links.push({ href: "/reviews", label: "Reviewer Queue" });
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-4">
          <span className="mr-6 border-r border-neutral-200 pr-6 text-sm font-semibold tracking-wide text-neutral-900">
            {APP_NAME}
          </span>
          <nav className="flex items-center gap-6">
            <NavLinks links={links} />
          </nav>
          {user ? <UserMenu displayName={user.displayName} email={user.email} /> : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
