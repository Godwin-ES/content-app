import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdf.js) resolves its worker module relative to its own
  // location on disk at runtime. Letting Next.js's server bundler process it
  // breaks that resolution (Task 6 build note has the failure mode); keeping
  // it external makes the server use Node's normal require instead.
  serverExternalPackages: ["pdf-parse"],

  // Next.js blocks its dev-only resources (notably the Fast Refresh / HMR
  // websocket at /_next/hmr) from any origin it doesn't consider same-origin,
  // which under WSL2 silently kills hot reload whenever the browser reaches
  // the server as 127.0.0.1 or the WSL network IP rather than as localhost.
  // The visible symptom is not "hot reload is slow" but a page whose client
  // bundle has drifted out of sync with the server: buttons and tabs stop
  // responding entirely until a hard reload. Dev-only; ignored by next build.
  allowedDevOrigins: ["localhost", "127.0.0.1", "10.255.255.254"],
};

export default nextConfig;
