import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One call site for every privileged admin write to land a row in
 * admin_audit_log (0010_admin_audit_log.sql) — who did what, to what, and
 * why. Mirrors the notify()/transitionTask() convention: the write this
 * accompanies has already committed by the time this runs, so a logging
 * failure is reported (console.error) and swallowed rather than thrown —
 * never unwind an already-successful admin action over an audit-log write.
 *
 * `client` should be the caller's normal RLS-scoped server client (every
 * admin action in this app already uses one) — admin_audit_log's insert
 * policy requires `is_admin(auth.uid()) and admin_id = auth.uid()`, so
 * passing anything other than the acting admin's own id here will simply
 * fail closed rather than mis-attribute the entry.
 */
export async function logAdminAction(
  client: SupabaseClient,
  adminId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  detail: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await client.from("admin_audit_log").insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    detail,
  });
  if (error) {
    console.error("logAdminAction() failed:", error.message, { action, targetType, targetId });
  }
}
