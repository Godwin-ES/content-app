import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractMaterialText } from "@/lib/materials/extract";

const FIXTURES_DIR = path.resolve(__dirname, "../../fixtures/materials");

async function fixture(name: string) {
  return readFile(path.join(FIXTURES_DIR, name));
}

describe("extractMaterialText", () => {
  it("extracts text from a plain text file", async () => {
    const result = await extractMaterialText(await fixture("sample.txt"), "text/plain");
    expect(result.status).toBe("ready");
    expect(result.text).toContain("Koya Content Studio supporting material sample text");
  });

  it("extracts text from a markdown file", async () => {
    const result = await extractMaterialText(await fixture("sample.md"), "text/markdown");
    expect(result.status).toBe("ready");
    expect(result.text).toContain("Koya Content Studio supporting material sample text");
  });

  it("extracts text from a DOCX file", async () => {
    const result = await extractMaterialText(await fixture("sample.docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(result.status).toBe("ready");
    expect(result.text).toContain("Koya Content Studio supporting material sample text");
  });

  it("extracts text from a PDF file", async () => {
    const result = await extractMaterialText(await fixture("sample.pdf"), "application/pdf");
    expect(result.status).toBe("ready");
    expect(result.text).toContain("Koya Content Studio supporting material sample text");
  });

  it("returns failed for an unsupported MIME type instead of throwing", async () => {
    const result = await extractMaterialText(await fixture("sample.txt"), "application/zip");
    expect(result.status).toBe("failed");
    expect(result.text).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("returns failed rather than ready-with-blank-text for a corrupt PDF", async () => {
    const corrupt = Buffer.from("this is not a real pdf file", "utf-8");
    const result = await extractMaterialText(corrupt, "application/pdf");
    expect(result.status).toBe("failed");
    expect(result.text).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("returns failed rather than ready-with-blank-text for a corrupt DOCX", async () => {
    const corrupt = Buffer.from("this is not a real docx file", "utf-8");
    const result = await extractMaterialText(
      corrupt,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(result.status).toBe("failed");
    expect(result.text).toBeNull();
  });

  it("returns failed for a text file with no extractable content", async () => {
    const blank = Buffer.from("   \n\n   \t  ", "utf-8");
    const result = await extractMaterialText(blank, "text/plain");
    expect(result.status).toBe("failed");
    expect(result.text).toBeNull();
  });
});
