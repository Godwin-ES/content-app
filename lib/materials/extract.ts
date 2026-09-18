import mammoth from "mammoth";

export const SUPPORTED_MATERIAL_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
] as const;

export type SupportedMaterialMimeType = (typeof SUPPORTED_MATERIAL_MIME_TYPES)[number];

export interface MaterialExtractionResult {
  status: "ready" | "failed";
  text: string | null;
  error: string | null;
}

function ready(text: string): MaterialExtractionResult {
  return { status: "ready", text, error: null };
}

function failed(error: string): MaterialExtractionResult {
  return { status: "failed", text: null, error };
}

/**
 * Deterministic text extraction for the four supported material formats
 * (SYSTEM-DESIGN-NEXTJS.md §8). A failed file must never silently become an
 * empty valid source: any error, or text that trims to nothing, is reported
 * as `failed`, never `ready` with blank text. No OCR.
 *
 * pdf-parse is intentionally loaded only inside the PDF branch. Its pdf.js
 * runtime expects DOM/canvas globals in some server environments; importing
 * it at module scope made unrelated server actions that happened to share
 * the request-action module fail during initialization on Vercel.
 */
export async function extractMaterialText(buffer: Buffer, mimeType: string): Promise<MaterialExtractionResult> {
  try {
    let rawText: string;

    switch (mimeType) {
      case "application/pdf": {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buffer });
        try {
          const result = await parser.getText();
          rawText = result.text;
        } finally {
          await parser.destroy();
        }
        break;
      }
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value;
        break;
      }
      case "text/markdown":
      case "text/plain":
        rawText = buffer.toString("utf-8");
        break;
      default:
        return failed(`Unsupported file type: ${mimeType}. Supported types are PDF, DOCX, Markdown, and TXT.`);
    }

    const trimmed = rawText.trim();
    if (trimmed.length === 0) {
      return failed("No extractable text was found in this file.");
    }

    return ready(trimmed);
  } catch (error) {
    return failed(error instanceof Error ? error.message : "Extraction failed.");
  }
}
