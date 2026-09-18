"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { parseWorkspaceTab, type WorkspaceTab } from "@/lib/workspace/tabs";
import { RequestActivityProvider } from "@/components/requests/request-activity-context";

interface RequestWorkspaceProps {
  /** Needed to watch this request's running operations, workspace-wide. */
  requestId: string;
  overview: ReactNode;
  research: ReactNode;
  plan: ReactNode;
  articles: ReactNode;
  channels: ReactNode;
  /** The finished package — named `packageTab` because `package` is reserved. */
  packageTab: ReactNode;
  /**
   * Which tab to open on. Comes from `?tab=` so a link can land someone on
   * the thing it is about — auto mode's notifications point at the stage
   * that just finished, and arriving on the Overview instead would make
   * the reader hunt for it.
   */
  defaultTab?: WorkspaceTab;
}

/**
 * Request workspace tabs (SYSTEM-DESIGN-NEXTJS.md §34.3): Overview,
 * Research, Plan, Articles, Channels, Package — the five
 * pipeline stages plus the Overview. Activity moved onto the Overview as a
 * collapsible history rather than holding a tab of its own: it is context
 * about the request, not a stage of work. Each
 * section's content is fetched and rendered server-side in the page and
 * passed in here as children — this component only owns the interactive
 * tab switching, not data loading. Plan was split out from Articles (Phase
 * 3 of the post-Task-22 UX pass) so plan generation/editing has its own
 * focused space and Articles can assume a plan already exists. Approval
 * became Package: the tab now holds the assembled sample pack itself,
 * with approval submission alongside it, rather than linking out to a
 * separate printable page to see what is being approved.
 */
export function RequestWorkspace({
  requestId,
  overview,
  research,
  plan,
  articles,
  channels,
  packageTab,
  defaultTab = "overview",
}: RequestWorkspaceProps) {
  /**
   * Which tab is open, mirrored into `?tab=` so a refresh comes back here.
   *
   * The tab was client state alone, and the URL never mentioned it — so
   * reloading anywhere in a request dropped you on the Overview, which
   * during a long research or article run is exactly when you are most
   * likely to reload. The server already reads `?tab=` to decide where to
   * open; it simply was never told where you had got to.
   *
   * The URL is written with replaceState rather than a router navigation:
   * the tabs are already rendered, so a navigation would re-fetch the whole
   * page to display markup the browser is holding. And it replaces rather
   * than pushes, because Back should leave the request, not walk back
   * through every tab you happened to look at.
   */
  const [tab, setTab] = useState<WorkspaceTab>(defaultTab);

  const selectTab = useCallback((value: string) => {
    const next = parseWorkspaceTab(value);
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }, []);

  return (
    <RequestActivityProvider requestId={requestId}>
      <Tabs value={tab} onValueChange={(value) => selectTab(String(value))}>
      <div className="overflow-x-auto">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="package">Package</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="overview">
        <div className="flex flex-col gap-6 pt-4">{overview}</div>
      </TabsContent>
      <TabsContent value="research">
        <div className="flex flex-col gap-6 pt-4">{research}</div>
      </TabsContent>
      <TabsContent value="plan">
        <div className="flex flex-col gap-6 pt-4">{plan}</div>
      </TabsContent>
      <TabsContent value="articles">
        <div className="flex flex-col gap-6 pt-4">{articles}</div>
      </TabsContent>
      <TabsContent value="channels">
        <div className="flex flex-col gap-6 pt-4">{channels}</div>
      </TabsContent>
      <TabsContent value="package">
        <div className="flex flex-col gap-6 pt-4">{packageTab}</div>
      </TabsContent>
      </Tabs>
    </RequestActivityProvider>
  );
}
