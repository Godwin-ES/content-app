import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @testing-library/react's automatic cleanup registers itself against a
// global `afterEach`, which only exists when Vitest's `test.globals` option
// is enabled. This project imports test globals explicitly instead, so
// cleanup is wired up here to avoid DOM from one component test leaking
// into the next.
afterEach(() => {
  cleanup();
});
