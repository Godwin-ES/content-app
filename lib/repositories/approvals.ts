import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { throwFromRpcError } from "@/lib/supabase/rpc";

type PackageApprovalRow = Database["public"]["Tables"]["package_approvals"]["Row"];

/**
 * The approval on a request, if it has one. At most one row exists per
 * package version, and a request is only ever `approved` while its current
 * package has one — editing anything creates a new version, which returns
 * the request to development and leaves the old approval standing as
 * history.
 */
export async function getLatestApproval(
  supabase: SupabaseClient<Database>,
  requestId: string
): Promise<PackageApprovalRow | null> {
  const { data, error } = await supabase
    .from("package_approvals")
    .select()
    .eq("request_id", requestId)
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Approves the request's current package: the human gate the brief
 * requires, in one act. The RPC re-checks ownership, that the request is
 * actually in development, and that the package being approved is still
 * the current one.
 */
export async function approvePackage(
  supabase: SupabaseClient<Database>,
  requestId: string,
  packageId: string
): Promise<PackageApprovalRow> {
  const { data, error } = await supabase.rpc("approve_package", { p_request_id: requestId, p_package_id: packageId });
  if (error) throwFromRpcError(error, "approve_package");
  if (!data) throw new Error("approve_package returned no data");
  return data;
}
