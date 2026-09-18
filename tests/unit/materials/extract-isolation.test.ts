import { describe, expect, it, vi } from "vitest";

describe("material extractor dependency isolation", () => {
  it("does not load the PDF runtime for plain-text extraction", async () => {
    vi.resetModules();
    vi.doMock("pdf-parse", () => {
      throw new Error("pdf-parse should not load for non-PDF extraction");
    });

    const { extractMaterialText } = await import("@/lib/materials/extract");
    const result = await extractMaterialText(Buffer.from("plain supporting material", "utf-8"), "text/plain");

    expect(result).toEqual({
      status: "ready",
      text: "plain supporting material",
      error: null,
    });
  });
});
