import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * No standalone landing page — this is a tool you sign into, and its
 * owner already knows what it is. `/` just routes to the work.
 */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
