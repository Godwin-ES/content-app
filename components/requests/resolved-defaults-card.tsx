import { DEFAULT_REQUEST_SETTINGS } from "@/lib/domain/defaults";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ResolvedDefaultsCardProps {
  audience: string;
  objective: string;
  tone: string;
  materialCount: number;
  urlCount: number;
}

/**
 * Shows the visible defaults that will be used for any optional field left
 * blank (SYSTEM-DESIGN-NEXTJS.md §7.3). Updates live as the Content Manager
 * fills in optional fields, so it is always clear what is supplied versus
 * resolved. CTA and primary keyword are not listed: both are always
 * AI-derived, so naming them here only invited the reader to look for an
 * input that does not exist.
 */
export function ResolvedDefaultsCard({ audience, objective, tone, materialCount, urlCount }: ResolvedDefaultsCardProps) {
  const rows = [
    { label: "Audience", value: audience || DEFAULT_REQUEST_SETTINGS.audience },
    { label: "Objective", value: objective || DEFAULT_REQUEST_SETTINGS.objective },
    { label: "Tone", value: tone || DEFAULT_REQUEST_SETTINGS.tone },
    {
      label: "Supporting materials",
      value: materialCount > 0 ? `${materialCount} provided by user` : "None provided by user",
    },
    { label: "Source URLs", value: urlCount > 0 ? `${urlCount} provided by user` : "None provided by user" },
  ];

  return (
    <Card className="bg-muted/30">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">Defaults that will be used</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="text-right font-medium">{row.value}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
