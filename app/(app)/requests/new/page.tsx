import { requireCurrentUser } from "@/lib/auth/session";
import { RequestForm } from "@/components/requests/request-form";

export default async function NewRequestPage() {
  await requireCurrentUser();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">New content request</h1>
        <p className="text-sm text-muted-foreground">
          Give us a topic and we will research it, find sources, and prepare article options for your review.
        </p>
      </div>
      <RequestForm testModeEnabled={process.env.ENABLE_AI_TEST_MODE === "true"} />
    </div>
  );
}
