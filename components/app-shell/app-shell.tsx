import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/domain/status";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-4">
          <span className="text-sm font-semibold tracking-wide text-neutral-900">{APP_NAME}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
