"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequestList } from "@/components/dashboard/request-list";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";
import type { PipelineProgress } from "@/lib/workspace/next-action";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];
type RequestStatus = ContentRequestRow["status"];
type TabKey = "in-progress" | "published" | "deleted";

/**
 * Three tabs, because a request has three states that matter to the person
 * running it: still being made, done, or thrown away.
 *
 * The five it replaced — Needs Changes, Awaiting Approval, Approved/Ready,
 * Archived — described a package moving between two people. With one
 * account, "awaiting approval" meant waiting for yourself and "needs
 * changes" meant a note you wrote to yourself about work you were about to
 * do anyway.
 *
 * Every live status maps to exactly one tab. Written as an exhaustive
 * Record rather than a list of statuses per tab so adding a status is a
 * compile error here until it has been given a home — no request can
 * quietly become invisible on the dashboard, which is a mistake this
 * dashboard has actually made before.
 */
const TAB_FOR_STATUS: Record<RequestStatus, TabKey> = {
  draft: "in-progress",
  source_review: "in-progress",
  content_development: "in-progress",
  approved: "published",
};

const TABS: Array<{ key: TabKey; label: string; note?: string; emptyTitle: string; emptyDescription: string }> = [
  {
    key: "in-progress",
    label: "In Progress",
    emptyTitle: "Nothing in progress",
    emptyDescription: "Drafts and requests you are still working on will show up here.",
  },
  {
    key: "published",
    label: "Published",
    // Said once, here, rather than left for someone to discover: the app
    // schedules, it does not post. The README calls this out as a
    // deliberate scope boundary and the tab should not quietly contradict it.
    note: "Approved and queued for their channels. Koya schedules — it never posts on your behalf.",
    emptyTitle: "Nothing published yet",
    emptyDescription: "Approve a package and its channels will be queued from here.",
  },
  {
    key: "deleted",
    label: "Deleted",
    note: "Deleted requests can be restored for 30 days. After that they are removed for good.",
    emptyTitle: "Nothing deleted",
    emptyDescription: "Requests you delete land here first, in case you change your mind.",
  },
];

export function RequestStatusTabs({
  requests,
  deletedRequests,
  progressByRequest,
}: {
  requests: ContentRequestRow[];
  deletedRequests: ContentRequestRow[];
  progressByRequest: Record<string, PipelineProgress>;
}) {
  const byTab = (key: TabKey) =>
    key === "deleted" ? deletedRequests : requests.filter((request) => TAB_FOR_STATUS[request.status] === key);

  return (
    <Tabs defaultValue="in-progress" className="gap-0">
      <TabsList
        variant="line"
        className="h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-0"
      >
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            className={cn(
              "group h-10 flex-none shrink-0 items-center gap-2 rounded-none border-0 border-b-2 border-transparent",
              "bg-transparent px-4 text-sm font-medium text-muted-foreground shadow-none after:hidden",
              "data-active:border-b-foreground data-active:bg-transparent data-active:text-foreground data-active:shadow-none"
            )}
          >
            <span>{tab.label}</span>
            <span
              className={cn(
                "flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground",
                "group-data-active:bg-foreground group-data-active:text-background"
              )}
            >
              {byTab(tab.key).length}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map((tab) => (
        <TabsContent key={tab.key} value={tab.key} className="mt-4 flex flex-col gap-3">
          {tab.note ? <p className="text-sm text-muted-foreground">{tab.note}</p> : null}
          <RequestList
            requests={byTab(tab.key)}
            progressByRequest={tab.key === "deleted" ? {} : progressByRequest}
            deleted={tab.key === "deleted"}
            emptyTitle={tab.emptyTitle}
            emptyDescription={tab.emptyDescription}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
