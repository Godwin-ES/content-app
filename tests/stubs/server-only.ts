// Vitest has no client/server bundling target distinction the way Next.js's
// bundler does, so the real `server-only` package (which unconditionally
// throws) is aliased to this no-op for tests. All test code exercises
// server-side logic directly, never a client bundle.
export {};
