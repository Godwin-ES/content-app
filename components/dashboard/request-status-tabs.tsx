"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequestList } from "@/components/dashboard/request-list";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";
import type { PipelineProgress } from "@/lib/workspace/next-action";

type ContentRequestRow = Database["public"]["Tables"]["content_requests"]["Row"];
type RequestStatus = ContentRequestRow["status"];
type TabKey = "in-progress" | "needs-changes" | "awaiting-approval" | "approved" | "archived";

/**
 * Every status maps to exactly one tab. Written as an exhaustive Record
 * rather than a list of statuses per tab so that adding a status (a
 * "published" one is the obvious next) is a compile error here until it has
 * been given a home — no request can quietly become invisible on the
 * dashboard.
 */
const TAB_FOR_STATUS: Record<RequestStatus, TabKey> = {
  draft: "in-progress",
  source_review: "in-progress",
  content_development: "in-progress",
  changes_requested: "needs-changes",
  pending_approval: "awaiting-approval",
  approved: "approved",
  archived: "archived",
};

const TABS: Array<{ key: TabKey; label: string; emptyTitle: string; emptyDescription: string; hideWhenEmpty?: boolean }> = [
  {
    key: "in-progress",
    label: "In Progress",
    emptyTitle: "Nothing in progress",
    emptyDescription: "Drafts and requests you are still working on will show up here.",
  },
  {
    key: "needs-changes",
    label: "Needs Changes",
    emptyTitle: "Nothing needs changes",
    emptyDescription: "Requests a reviewer sent back, with their feedback, will show up here.",
  },
  {
    key: "awaiting-approval",
    label: "Awaiting Approval",
    emptyTitle: "Nothing awaiting approval",
    emptyDescription: "Requests you have submitted for review will show up here.",
  },
  {
    key: "approved",
    label: "Approved / Ready",
    emptyTitle: "Nothing approved yet",
    emptyDescription: "Approved requests, ready to queue or schedule, will show up here.",
  },
  {
    key: "archived",
    label: "Archived",
    emptyTitle: "Nothing archived",
    emptyDescription: "Archived requests will show up here.",
    hideWhenEmpty: true,
  },
];

export function RequestStatusTabs({
  requests,
  pendingReviewIdByRequest,
  progressByRequest,
}: {
  requests: ContentRequestRow[];
  pendingReviewIdByRequest: Record<string, string>;
  progressByRequest: Record<string, PipelineProgress>;
}) {
  const byTab = (key: TabKey) => requests.filter((request) => TAB_FOR_STATUS[request.status] === key);
  const visibleTabs = TABS.filter((tab) => !tab.hideWhenEmpty || byTab(tab.key).length > 0);

  return (
    <Tabs defaultValue="in-progress" className="gap-0">
      <TabsList
        variant="line"
        className="h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-0"
      >
        {visibleTabs.map((tab) => (
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

      {visibleTabs.map((tab) => (
        <TabsContent key={tab.key} value={tab.key} className="mt-4">
          <RequestList
            requests={byTab(tab.key)}
            pendingReviewIdByRequest={pendingReviewIdByRequest}
            progressByRequest={progressByRequest}
            emptyTitle={tab.emptyTitle}
            emptyDescription={tab.emptyDescription}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
