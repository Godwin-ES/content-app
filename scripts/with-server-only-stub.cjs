// Node has no client/server bundling target the way Next.js's bundler does,
// so the real `server-only` package (which unconditionally throws) is
// redirected here to a no-op — the same substitution vitest.config.ts makes
// for tests, needed here because scripts/run-live-benchmark.ts imports
// lib/benchmark/service.ts and lib/ai/provider.ts directly.
const Module = require("node:module");
const path = require("node:path");

const stubPath = path.join(__dirname, "server-only-stub.cjs");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return stubPath;
  return originalResolve.call(this, request, ...rest);
};

require("tsx/cjs");
require(process.argv[2]);
