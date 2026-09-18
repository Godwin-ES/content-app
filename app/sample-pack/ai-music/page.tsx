import type { Metadata } from "next";
import { SamplePackView } from "@/components/requests/sample-pack-view";
import { AI_MUSIC_SUBMISSION_PACK } from "@/lib/sample-pack/submission-snapshot";

export const metadata: Metadata = {
  title: "AI Music Content Sample Pack | Koya Content Studio",
  description: "Week 4 content sample pack showing the reviewed sources, article, and channel-ready content produced by Koya Content Studio.",
};

/**
 * Standalone submission artifact. It intentionally lives outside the
 * authenticated app route group and renders only a frozen package snapshot,
 * so reviewers can inspect the deliverables without entering the account or
 * gaining access to any private workspace state.
 */
export default function PublicAiMusicSamplePackPage() {
  return (
    <main className="min-h-screen bg-background py-8">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="[&>article>div:first-child]:hidden">
          <SamplePackView pack={AI_MUSIC_SUBMISSION_PACK} interactive />
        </div>
      </div>
    </main>
  );
}
