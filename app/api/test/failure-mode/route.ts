import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { isFailureInjectionEnabled, isValidFailureMode, FAILURE_MODE_COOKIE, FAILURE_MODES } from "@/lib/test-support/failure-injection";

/**
 * Dev-only failure injection control (SYSTEM-DESIGN-NEXTJS.md §39, Task 20
 * Step 1). Returns 404 unless every one of these holds: not production,
 * ENABLE_FAILURE_INJECTION=true, and a request header matching
 * TEST_FAILURE_TOKEN — a 404 rather than 403 so an unauthorized caller
 * cannot even tell this endpoint exists. Only ever accepts one of the
 * enumerated failure modes; never arbitrary exception text or provider
 * names from the browser.
 */
function isAuthorized(request: NextRequest): boolean {
  if (!isFailureInjectionEnabled()) return false;
  const token = request.headers.get("x-koya-test-token");
  const expected = process.env.TEST_FAILURE_TOKEN;
  return Boolean(expected) && token === expected;
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return notFound();
  const cookieStore = await cookies();
  const mode = cookieStore.get(FAILURE_MODE_COOKIE)?.value ?? null;
  return NextResponse.json({ mode: mode && isValidFailureMode(mode) ? mode : null, availableModes: FAILURE_MODES });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return notFound();

  const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;
  const mode = body?.mode;
  if (typeof mode !== "string" || !isValidFailureMode(mode)) {
    return NextResponse.json({ error: "mode must be one of the enumerated failure modes" }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(FAILURE_MODE_COOKIE, mode, { httpOnly: true, sameSite: "lax", path: "/" });
  return NextResponse.json({ ok: true, mode });
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return notFound();

  const cookieStore = await cookies();
  cookieStore.delete(FAILURE_MODE_COOKIE);
  return NextResponse.json({ ok: true });
}
