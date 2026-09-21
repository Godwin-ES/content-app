import "server-only";

function normalizeUrl(value: string): string {
  const withProtocol = value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

/**
 * Returns the public origin Supabase Auth should send users back to.
 *
 * Production prefers an explicitly configured canonical site URL, then
 * Vercel's production URL. Request headers are only a fallback so local
 * development and non-Vercel environments still work without hardcoding a
 * localhost redirect into production confirmation emails.
 */
export function resolveAuthSiteUrl(requestHeaders?: Pick<Headers, "get">): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return normalizeUrl(configured);

  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProduction) return normalizeUrl(vercelProduction);

  const forwardedHost = requestHeaders?.get("x-forwarded-host")?.trim();
  const host = forwardedHost || requestHeaders?.get("host")?.trim();
  if (host) {
    const forwardedProto = requestHeaders?.get("x-forwarded-proto")?.trim();
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    return `${forwardedProto || (isLocal ? "http" : "https")}://${host}`;
  }

  const vercelDeployment = process.env.VERCEL_URL?.trim() || process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (vercelDeployment) return normalizeUrl(vercelDeployment);

  return "http://localhost:3000";
}
