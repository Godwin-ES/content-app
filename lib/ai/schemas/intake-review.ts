import { z } from "zod";

/**
 * Intake reviewer output: one verdict per field that was filled in.
 *
 * `plausible` is deliberately a low bar. The reviewer is asked whether an
 * answer could be a real answer to that question, not whether it is a good
 * one — judging someone's audience or tone on quality would make it an
 * editor, and it has no idea what they are trying to do.
 */
export const intakeReviewSchema = z.object({
  fields: z
    .array(
      z.object({
        field: z.enum(["topic", "audience", "objective", "tone", "primaryKeyword", "cta"]),
        plausible: z.boolean(),
        /**
         * Shown to the user when the field is flagged, so it names what is
         * wrong and what would fix it. Empty for a field that passes —
         * requiring a sentence there made every clean intake fail
         * validation, because the model quite reasonably had nothing to
         * say about a field it had just approved.
         */
        reason: z.string().max(240).optional().default(""),
      })
    )
    .max(6),
});

export type IntakeReview = z.infer<typeof intakeReviewSchema>;
