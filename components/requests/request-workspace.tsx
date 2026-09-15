"use client";

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface RequestWorkspaceProps {
  overview: ReactNode;
  research: ReactNode;
  articles: ReactNode;
  channels: ReactNode;
  approval: ReactNode;
  publishing: ReactNode;
  activity: ReactNode;
}

/**
 * Request workspace tabs (SYSTEM-DESIGN-NEXTJS.md §34.3): Overview,
 * Research, Articles, Channels, Approval, Publishing, Activity. Each
 * section's content is fetched and rendered server-side in the page and
 * passed in here as children — this component only owns the interactive
 * tab switching, not data loading.
 */
export function RequestWorkspace({ overview, research, articles, channels, approval, publishing, activity }: RequestWorkspaceProps) {
  return (
    <Tabs defaultValue="overview">
      <div className="overflow-x-auto">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="approval">Approval</TabsTrigger>
          <TabsTrigger value="publishing">Publishing</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="overview">
        <div className="flex flex-col gap-6 pt-4">{overview}</div>
      </TabsContent>
      <TabsContent value="research">
        <div className="flex flex-col gap-6 pt-4">{research}</div>
      </TabsContent>
      <TabsContent value="articles">
        <div className="flex flex-col gap-6 pt-4">{articles}</div>
      </TabsContent>
      <TabsContent value="channels">
        <div className="flex flex-col gap-6 pt-4">{channels}</div>
      </TabsContent>
      <TabsContent value="approval">
        <div className="flex flex-col gap-6 pt-4">{approval}</div>
      </TabsContent>
      <TabsContent value="publishing">
        <div className="flex flex-col gap-6 pt-4">{publishing}</div>
      </TabsContent>
      <TabsContent value="activity">
        <div className="flex flex-col gap-6 pt-4">{activity}</div>
      </TabsContent>
    </Tabs>
  );
}
