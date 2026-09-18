import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getErrorMessage } from "@/lib/domain/errors";
import { createOperationRun, updateOperationRun } from "@/lib/repositories/operations";

type OperationType = Database["public"]["Tables"]["operation_runs"]["Insert"]["operation_type"];

export interface TrackedOperation {
  requestId: string;
  operationType: OperationType;
  modelId: string;
}

/**
 * Runs `work` with an `operation_runs` row open for its whole duration.
 *
 * That table is what the workspace reads to know something is happening:
 * it is the only record of in-flight work that outlives the tab that
 * started it, so an operation with no row is an operation the interface
 * cannot see. Research, article generation, and channel adaptation each
 * grew their own copy of this bookkeeping; plan generation and targeted
 * revision never did, which is precisely why those two were the ones that
 * came back looking idle.
 *
 * The row is closed in a finally, because a failed operation that leaves
 * its row saying `running` is worse than one that was never tracked — it
 * locks every control in the workspace behind work that is not happening.
 */
export async function withOperationRun<T>(
  supabase: SupabaseClient<Database>,
  operation: TrackedOperation,
  work: () => Promise<T>
): Promise<T> {
  const run = await createOperationRun(supabase, {
    request_id: operation.requestId,
    operation_type: operation.operationType,
    status: "running",
    model: operation.modelId,
    started_at: new Date().toISOString(),
  });

  try {
    const result = await work();
    await updateOperationRun(supabase, run.id, { status: "succeeded", finished_at: new Date().toISOString() });
    return result;
  } catch (error) {
    await updateOperationRun(supabase, run.id, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: getErrorMessage(error),
    });
    throw error;
  }
}
