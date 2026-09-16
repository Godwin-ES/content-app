import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * No standalone landing page — this is an internal tool with exactly two
 * roles, both of whom already know what it is. `/` just routes straight to
 * wherever the visitor actually belongs.
 */
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(user.role === "reviewer" ? "/reviews" : "/dashboard");
}
