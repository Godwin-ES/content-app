/**
 * The request workspace's tabs, as data.
 *
 * Kept out of the component because the server needs them too: the page
 * reads `?tab=` to decide which one opens, and auto mode's notifications
 * name one so their link lands on the stage that just finished. Exporting
 * this from the `"use client"` component compiled fine and then failed at
 * request time with "attempted to call parseWorkspaceTab() from the server
 * but it is on the client" — a boundary a build cannot check.
 */
export const WORKSPACE_TABS = ["overview", "research", "plan", "articles", "channels", "package", "publishing"] as const;

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

/** Narrows an arbitrary `?tab=` value, so a bad link opens the Overview. */
export function parseWorkspaceTab(value: string | undefined): WorkspaceTab {
  return WORKSPACE_TABS.includes(value as WorkspaceTab) ? (value as WorkspaceTab) : "overview";
}
