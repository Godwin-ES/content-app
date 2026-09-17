"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { addSourceUrlAction } from "@/actions/research";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AddUrlControlProps {
  requestId: string;
  locked?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Adds one URL at a time: click "Add URL", paste one link, click Add —
 * repeat for another. It only ever creates a `pending` source row (no
 * retrieval happens here); the source card's own "Start Research" button
 * is what actually processes it, same as any other pending source.
 */
export function AddUrlControl({ requestId, locked = false, onBusyChange }: AddUrlControlProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function add() {
    setError(null);
    onBusyChange?.(true);
    startTransition(async () => {
      const result = await addSourceUrlAction(requestId, url);
      onBusyChange?.(false);
      if (result.ok) {
        setUrl("");
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  const disabled = isPending || locked;

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)} className="w-fit">
        Add URL
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/article"
          disabled={disabled}
          className="w-72"
          autoFocus
        />
        <Button type="button" size="sm" disabled={disabled || !url.trim()} onClick={add}>
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Adding...
            </>
          ) : (
            "Add"
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            setUrl("");
            setError(null);
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
