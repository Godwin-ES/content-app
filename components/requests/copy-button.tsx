"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Copies a piece of the package to the clipboard.
 *
 * This is how the content actually leaves the application. Nothing here
 * publishes anything, so the package's whole job is to hand over text in a
 * state fit to paste into LinkedIn, X, or an email tool — which means
 * copying has to be one obvious click per thing you would paste
 * separately, not a select-and-drag across a rendered page that would take
 * the surrounding furniture with it.
 *
 * Falls back to a hidden textarea and execCommand where the async
 * clipboard is unavailable, which is every insecure origin — including a
 * plain-http dev server on a LAN address, where the modern API is simply
 * not defined and an unguarded call throws.
 */
export function CopyButton({
  text,
  label = "Copy",
  className,
  size = "sm",
  variant = "outline",
}: {
  text: string;
  label?: string;
  className?: string;
  size?: "sm" | "default";
  variant?: "outline" | "ghost" | "secondary";
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Nothing useful to say: the text is on screen and can be selected
      // by hand. An error banner over a failed convenience is noise.
    }
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={copy} className={className}>
      {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
