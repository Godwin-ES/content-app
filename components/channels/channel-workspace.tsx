"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateChannelsAction, retryChannelAction, evaluateChannelAction } from "@/actions/channels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EvaluationSummary } from "@/components/articles/evaluation-summary";
import { EvaluationDrawer } from "@/components/articles/evaluation-drawer";
import { LinkedinEditor } from "@/components/channels/linkedin-editor";
import { XEditor } from "@/components/channels/x-editor";
import { NewsletterEditor } from "@/components/channels/newsletter-editor";
import type { Database } from "@/lib/supabase/database.types";
import type { LinkedinPost, XPost, Newsletter } from "@/lib/ai/schemas/channel";

type ContentArtifactRow = Database["public"]["Tables"]["content_artifacts"]["Row"];
type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];
type EvaluationRow = Database["public"]["Tables"]["evaluations"]["Row"];

interface ChannelWorkspaceProps {
  requestId: string;
  channelArtifacts: ContentArtifactRow[];
  currentVersionsByArtifact: Record<string, ArtifactVersionRow | null>;
  evaluationsByArtifact: Record<string, EvaluationRow | null>;
  canGenerate: boolean;
}

const CHANNEL_LABEL: Record<string, string> = { linkedin: "LinkedIn", x: "X", newsletter: "Newsletter" };

function ChannelCard({
  artifact,
  currentVersion,
  evaluation,
}: {
  artifact: ContentArtifactRow;
  currentVersion: ArtifactVersionRow | null;
  evaluation: EvaluationRow | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const hasVersion = Boolean(currentVersion);

  function retry() {
    setError(null);
    startTransition(async () => {
      const result = await retryChannelAction(artifact.id);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  function evaluate() {
    if (!currentVersion) return;
    setError(null);
    startTransition(async () => {
      const result = await evaluateChannelAction(currentVersion.id);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase text-muted-foreground">{CHANNEL_LABEL[artifact.kind] ?? artifact.kind}</span>
        <Badge variant={hasVersion ? "outline" : "destructive"}>{hasVersion ? "Generated" : "Failed"}</Badge>
      </div>

      {currentVersion ? (
        <>
          <EvaluationSummary evaluation={evaluation} />
          {evaluation ? <EvaluationDrawer evaluation={evaluation} /> : null}
          {artifact.kind === "linkedin" ? (
            <LinkedinEditor artifactId={artifact.id} content={currentVersion.content as unknown as LinkedinPost} />
          ) : null}
          {artifact.kind === "x" ? <XEditor artifactId={artifact.id} content={currentVersion.content as unknown as XPost} /> : null}
          {artifact.kind === "newsletter" ? (
            <NewsletterEditor artifactId={artifact.id} content={currentVersion.content as unknown as Newsletter} />
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Generation failed for this channel.</p>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        {!hasVersion ? (
          <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={retry} className="w-fit">
            {isPending ? "Retrying..." : "Retry"}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={evaluate} className="w-fit">
            {isPending ? "Evaluating..." : evaluation ? "Re-evaluate" : "Evaluate"}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Channel generation trigger + independent LinkedIn/X/Newsletter workspace
 * (SYSTEM-DESIGN-NEXTJS.md §21). Each channel adapts, validates, evaluates,
 * and edits independently — one channel's failure or manual edit never
 * touches the article or the other two channels.
 */
export function ChannelWorkspace({
  requestId,
  channelArtifacts,
  currentVersionsByArtifact,
  evaluationsByArtifact,
  canGenerate,
}: ChannelWorkspaceProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generateChannelsAction(requestId);
      if (result.ok) router.refresh();
      else setError(result.error.message);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Channel Assets</h3>
        {channelArtifacts.length === 0 || channelArtifacts.some((a) => !a.current_version_id) ? (
          <Button type="button" size="sm" onClick={generate} disabled={!canGenerate || isPending}>
            {isPending ? "Generating..." : channelArtifacts.length === 0 ? "Generate channel assets" : "Retry all"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {channelArtifacts.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {channelArtifacts.map((artifact) => (
            <ChannelCard
              key={artifact.id}
              artifact={artifact}
              currentVersion={currentVersionsByArtifact[artifact.id] ?? null}
              evaluation={evaluationsByArtifact[artifact.id] ?? null}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No channel assets generated yet.</p>
      )}
    </div>
  );
}
