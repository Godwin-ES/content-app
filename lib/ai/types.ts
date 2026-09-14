import type { z } from "zod";

export interface GenerateStructuredInput<T> {
  modelId: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
}

/**
 * Provider-neutral AI contract (SYSTEM-DESIGN-NEXTJS.md §12.1). Every
 * operation asks for one structured, schema-validated result; the adapter
 * is responsible for whatever provider-specific mechanism (tool use,
 * response schema, etc.) gets there, and for re-validating the result
 * against `schema` at the application boundary before returning it.
 */
export interface AIProvider {
  generateStructured<T>(input: GenerateStructuredInput<T>): Promise<T>;
}
