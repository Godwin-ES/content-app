import "server-only";

/**
 * Posts a plain-text message to a Discord incoming webhook. A missing
 * webhook URL is a silent no-op — Discord is a supplementary transparency
 * surface, not workflow authority, and an unconfigured channel must not
 * break anything (SYSTEM-DESIGN-NEXTJS.md §28.2, §28.3).
 */
export async function sendDiscordMessage(webhookUrl: string | undefined, content: string): Promise<void> {
  if (!webhookUrl) return;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook responded with status ${response.status}`);
  }
}
