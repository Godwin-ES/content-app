import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { LocalDateTime } from "@/components/shared/local-date-time";
import type { ReviewerQueue, ReviewQueueCard } from "@/lib/approvals/service";

interface ReviewQueueProps {
  queue: ReviewerQueue;
}

function QueueCardList({ cards, emptyMessage }: { cards: ReviewQueueCard[]; emptyMessage: string }) {
  if (cards.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {cards.map((card) => (
        <li key={card.reviewId}>
          <Link href={`/reviews/${card.requestId}`} className="flex flex-col gap-1 rounded-lg border p-4 hover:bg-muted/50">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{card.topic}</p>
              <Badge variant="outline">Package v{card.packageVersion}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Submitted by {card.submitterName} · {card.sourceCount} source(s) · <LocalDateTime value={card.submittedAt} />
            </p>
            {card.comment ? <p className="text-sm text-muted-foreground">&ldquo;{card.comment}&rdquo;</p> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Reviewer queue split into clearly separated tabs/badges
 * (SYSTEM-DESIGN-NEXTJS.md §34.2, Task 17 Step 3).
 */
export function ReviewQueue({ queue }: ReviewQueueProps) {
  return (
    <Tabs defaultValue="awaiting">
      <TabsList>
        <TabsTrigger value="awaiting">Awaiting Review ({queue.awaitingReview.length})</TabsTrigger>
        <TabsTrigger value="changes">Changes Requested ({queue.changesRequested.length})</TabsTrigger>
        <TabsTrigger value="approved">Approved ({queue.approved.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="awaiting">
        <QueueCardList cards={queue.awaitingReview} emptyMessage="No packages awaiting review." />
      </TabsContent>
      <TabsContent value="changes">
        <QueueCardList cards={queue.changesRequested} emptyMessage="No packages with requested changes." />
      </TabsContent>
      <TabsContent value="approved">
        <QueueCardList cards={queue.approved} emptyMessage="No approved packages yet." />
      </TabsContent>
    </Tabs>
  );
}
