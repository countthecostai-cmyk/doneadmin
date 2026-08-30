"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { notify } from "@/lib/notify";
import { logAdminAction } from "@/lib/audit-log";
import { revalidatePath } from "next/cache";

export async function setDoerStatus(
  userId: string,
  status: "approved" | "rejected" | "suspended"
): Promise<void> {
  const gate = await requireAdmin();
  if (!gate.ok) throw new Error("You must be an admin to do this.");

  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "approved") patch.approved_at = new Date().toISOString();

  const { error } = await supabase.from("doer_profiles").update(patch).eq("user_id", userId);
  if (error) throw new Error(error.message);

  await logAdminAction(supabase, gate.userId, "doer_status_changed", "doer_profile", userId, { status });

  if (status === "approved") {
    await notify(userId, "doer_approved", "You're approved!", "You can now claim open tasks.");
  } else if (status === "rejected") {
    await notify(userId, "doer_rejected", "Application update", "Your Doer application was not approved.");
  }

  revalidatePath("/admin/doers");
}
