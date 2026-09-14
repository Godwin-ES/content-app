import Link from "next/link";
import { APP_NAME } from "@/lib/domain/status";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center">
      <h1 className="text-2xl font-semibold text-neutral-900">{APP_NAME}</h1>
      <p className="max-w-md text-neutral-600">
        AI-assisted content research, review, and publishing preparation.
      </p>
      <Link
        href="/dashboard"
        className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
