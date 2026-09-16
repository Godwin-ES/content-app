import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

interface MarkdownBodyProps {
  children: string;
  className?: string;
}

/**
 * Renders generated body text as actual formatted markdown (headers,
 * bullets, bold, links) instead of raw source text — every article/channel
 * body previously showed literal `##`/`**`/`*` characters via
 * `whitespace-pre-wrap` over the raw string, which is what made the AI's
 * `**bold**` syntax look broken rather than emphasized.
 */
export function MarkdownBody({ children, className }: MarkdownBodyProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 text-sm leading-relaxed",
        "[&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:leading-relaxed",
        "[&_a]:text-primary [&_a]:underline [&_strong]:font-semibold",
        className
      )}
    >
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
