"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { uploadSupportingMaterialAction, deleteSupportingMaterialAction } from "@/actions/materials";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Database } from "@/lib/supabase/database.types";

type SupportingMaterialRow = Database["public"]["Tables"]["supporting_materials"]["Row"];

interface SupportingMaterialUploadProps {
  requestId: string;
  initialMaterials: SupportingMaterialRow[];
  locked?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

const STATUS_LABEL: Record<SupportingMaterialRow["extraction_status"], string> = {
  pending: "Processing...",
  ready: "Ready",
  failed: "Failed",
};

/**
 * The "Add file" trigger for the Research tab's unified source list. A
 * material that extracts successfully immediately becomes a `pending`
 * source (lib/materials/service.ts) and shows up there instead — so this
 * panel only ever lists materials still processing or that failed to
 * extract, never a "Ready" one (that would just be the same file shown
 * twice, once here and once as its source card).
 */
export function SupportingMaterialUpload({ requestId, initialMaterials, locked = false, onBusyChange }: SupportingMaterialUploadProps) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const pendingOrFailed = materials.filter((m) => m.extraction_status !== "ready");

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    onBusyChange?.(true);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadSupportingMaterialAction(requestId, formData);
      onBusyChange?.(false);
      if (result.ok) {
        setMaterials((prev) => [...prev, result.data]);
        router.refresh();
      } else {
        setError(result.error.message);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  function handleRemove(materialId: string) {
    setError(null);
    setRemovingId(materialId);
    onBusyChange?.(true);
    startTransition(async () => {
      const result = await deleteSupportingMaterialAction(materialId);
      setRemovingId(null);
      onBusyChange?.(false);
      if (result.ok) {
        setMaterials((prev) => prev.filter((m) => m.id !== materialId));
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  const disabled = isPending || locked;

  return (
    <div className="flex flex-col gap-3">
      <label
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit cursor-pointer", disabled && "pointer-events-none opacity-50")}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Uploading...
          </>
        ) : (
          "Add file"
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />
      </label>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {pendingOrFailed.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {pendingOrFailed.map((material) => (
            <li key={material.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{material.filename}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={material.extraction_status === "failed" ? "destructive" : "outline"}>
                    {STATUS_LABEL[material.extraction_status]}
                  </Badge>
                  <Badge variant="secondary">{material.classification}</Badge>
                </div>
                {material.extraction_status === "failed" && material.extraction_error ? (
                  <span className="text-xs text-destructive">{material.extraction_error}</span>
                ) : null}
              </div>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => handleRemove(material.id)}>
                {removingId === material.id ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Removing...
                  </>
                ) : (
                  "Remove"
                )}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
