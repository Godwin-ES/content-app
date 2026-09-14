"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
}

const STATUS_LABEL: Record<SupportingMaterialRow["extraction_status"], string> = {
  pending: "Processing...",
  ready: "Ready",
  failed: "Failed",
};

export function SupportingMaterialUpload({ requestId, initialMaterials }: SupportingMaterialUploadProps) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadSupportingMaterialAction(requestId, formData);
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
    startTransition(async () => {
      const result = await deleteSupportingMaterialAction(materialId);
      if (result.ok) {
        setMaterials((prev) => prev.filter((m) => m.id !== materialId));
        router.refresh();
      } else {
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Supporting material</h3>
        <label
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "cursor-pointer",
            isPending && "pointer-events-none opacity-50"
          )}
        >
          {isPending ? "Uploading..." : "Add file"}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
            className="hidden"
            onChange={handleFileChange}
            disabled={isPending}
          />
        </label>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {materials.length === 0 ? (
        <p className="text-sm text-muted-foreground">No supporting material uploaded yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {materials.map((material) => (
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => handleRemove(material.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
