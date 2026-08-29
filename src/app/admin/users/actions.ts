"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";

/**
 * profiles_update_own (0007_admin_profile_rls.sql) now grants
 * `is_admin(auth.uid())` a real RLS path to update another user's row, so
 * this runs on the normal RLS-scoped client like every other admin write —
 * RLS stays the actual authorization boundary instead of this action being
 * a service-role escape hatch. profiles_lock_privileged_fields() (0002,
 * 0006) still independently enforces which *fields* a write may touch
 * (is_admin, is_suspended, suspended_reason/at/by are admin-or-service-role
 * only) — this policy only widens which *rows* an admin session can reach.
 * requireAdmin() still re-verifies profiles.is_admin server-side on every
 * call as a UX-layer guard on top of RLS.
 */
export async function setUserSuspension(
  userId: string,
  suspended: boolean,
  reason: string
): Promise<{ error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: "You must be an admin to do this." };

  if (suspended && userId === gate.userId) {
    return { error: "You can't suspend your own account." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      is_suspended: suspended,
      suspended_reason: suspended ? reason || null : null,
      suspended_at: suspended ? new Date().toISOString() : null,
      suspended_by: suspended ? gate.userId : null,
    })
    .eq("id", userId);

  if (error) return { error: error.message };

  await notify(
    userId,
    suspended ? "account_suspended" : "account_reactivated",
    suspended ? "Your account has been suspended" : "Your account has been reactivated",
    suspended ? reason || "Contact support for details." : "You can use Done again."
  );

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return {};
}
