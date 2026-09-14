import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdf.js) resolves its worker module relative to its own
  // location on disk at runtime. Letting Next.js's server bundler process it
  // breaks that resolution (Task 6 build note has the failure mode); keeping
  // it external makes the server use Node's normal require instead.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
