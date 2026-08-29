"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { transitionTask, TransitionConflictError, IllegalTransitionError } from "@/lib/task-transitions";
import { notify } from "@/lib/notify";
import type { TaskStatus } from "@/lib/task-state-machine";
import type { Task } from "@/lib/database.types";

/**
 * Generic operational tool for unsticking a task — NOT a replacement for
 * the Disputes flow. Deliberately excludes targets that imply money moved
 * or should move (`payout_completed`, `refunded`) and `disputed` itself
 * (entering a dispute must also create a `disputes` row, which only the
 * requester/doer report-a-problem flow and the Disputes page do — see
 * admin/disputes/actions.ts) so this can't silently orphan the disputes
 * system or fake a payout that never happened server-side.
 */
export async function adminForceTransition(
  taskId: string,
  from: TaskStatus,
  to: TaskStatus,
  note: string
): Promise<{ error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: "You must be an admin to do this." };

  if (to === "disputed" || to === "payout_completed") {
    return { error: `"${to}" can't be set from here — use the Disputes page.` };
  }

  const supabase = await createClient();
  const { data: taskRow } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
  const task = taskRow as Task | null;
  if (!task) return { error: "Task not found." };

  if (to === "accepted" && !task.doer_id) {
    return { error: "Can't force to \"accepted\" without a Doer already assigned." };
  }

  try {
    const extraPatch: Partial<Task> =
      to === "cancelled" ? { cancellation_reason: note || "Cancelled by admin" } : {};
    if (to === "matching" && (from === "declined" || from === "expired")) {
      // Requeue paths clear doer_id back to the open pool.
      extraPatch.doer_id = null;
    }

    const updated = await transitionTask<Partial<Task>>(supabase, {
      taskId,
      from,
      to,
      actor: "admin",
      changedByUser: gate.userId,
      note: note || `Admin override: ${from} → ${to}`,
      extraPatch,
    });

    await notify(updated.requester_id, "admin_task_update", "An admin updated your task", note || undefined);
    if (updated.doer_id) {
      await notify(updated.doer_id, "admin_task_update", "An admin updated a task", note || undefined);
    }
  } catch (e) {
    if (e instanceof TransitionConflictError || e instanceof IllegalTransitionError) {
      return { error: e.message };
    }
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath(`/admin/tasks/${taskId}`);
  revalidatePath("/admin/tasks");
  return {};
}
