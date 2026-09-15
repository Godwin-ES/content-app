import type { ReactNode } from "react";
import Link from "next/link";
import { APP_NAME } from "@/lib/domain/status";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Minimal nav, role-aware so a Reviewer can actually reach the reviewer
 * queue without knowing the URL. Task 19 replaces this with the full
 * navigation shell.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <span className="text-sm font-semibold tracking-wide text-neutral-900">{APP_NAME}</span>
          {user?.role === "content_manager" ? (
            <Link href="/dashboard" className="text-sm text-neutral-600 hover:text-neutral-900">
              Dashboard
            </Link>
          ) : null}
          {user?.role === "reviewer" ? (
            <Link href="/reviews" className="text-sm text-neutral-600 hover:text-neutral-900">
              Reviewer Queue
            </Link>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
