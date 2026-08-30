"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { transitionTask } from "@/lib/task-transitions";
import { notify } from "@/lib/notify";
import { logAdminAction } from "@/lib/audit-log";
import { getStripe } from "@/lib/stripe";
import { revalidatePath } from "next/cache";

export async function resolveDispute(
  disputeId: string,
  taskId: string,
  resolution: "resolved_release" | "resolved_refund" | "resolved_other",
  note: string
): Promise<void> {
  const gate = await requireAdmin();
  if (!gate.ok) throw new Error("You must be an admin to do this.");
  const user = { id: gate.userId };

  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
  if (!task) throw new Error("Task not found.");

  // The RLS-scoped client is enough here — tasks_update and
  // task_status_history_insert (0002) both already grant is_admin(auth.uid())
  // full access, so there's no need to drop to the service-role client and
  // widen the blast radius of a bug in this action.
  if (resolution === "resolved_release") {
    // Route back into the normal payout path.
    await transitionTask(supabase, {
      taskId,
      from: "disputed",
      to: "payout_pending",
      actor: "admin",
      changedByUser: user.id,
      note: note || "Dispute resolved: released to Doer",
    });
  } else if (resolution === "resolved_refund") {
    // Only a payment that actually succeeded needs a real Stripe refund — a
    // dispute raised before the Requester ever confirmed+paid (the common
    // path: `completed -> disputed` via reportCompletionProblem happens
    // before a charge exists) has nothing to refund at Stripe, just a
    // status to record. Never fake success: if a charge exists but the
    // refund call fails, surface that instead of silently marking refunded.
    const { data: payment } = await supabase
      .from("payments")
      .select("id, stripe_payment_intent_id, status")
      .eq("task_id", taskId)
      .eq("status", "succeeded")
      .maybeSingle();

    if (payment?.stripe_payment_intent_id) {
      try {
        await getStripe().refunds.create({
          payment_intent: payment.stripe_payment_intent_id,
          reason: "requested_by_customer",
        });
      } catch (err) {
        throw new Error(
          `Stripe refund failed, task NOT moved to refunded: ${
            err instanceof Error ? err.message : "unknown error"
          }`
        );
      }
      await supabase.from("payments").update({ status: "refunded" }).eq("id", payment.id);
    }

    await transitionTask(supabase, {
      taskId,
      from: "disputed",
      to: "refunded",
      actor: "admin",
      changedByUser: user.id,
      note: note || "Dispute resolved: refunded",
    });
  } else {
    await transitionTask(supabase, {
      taskId,
      from: "disputed",
      to: "cancelled",
      actor: "admin",
      changedByUser: user.id,
      note: note || "Dispute resolved",
    });
  }

  const { error } = await supabase
    .from("disputes")
    .update({
      status: resolution,
      resolution_note: note || null,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", disputeId);
  if (error) throw new Error(error.message);

  await logAdminAction(supabase, user.id, "dispute_resolved", "dispute", disputeId, {
    resolution,
    note: note || null,
    task_id: taskId,
  });

  await notify(task.requester_id, "dispute_resolved", "Dispute resolved", note);
  if (task.doer_id) await notify(task.doer_id, "dispute_resolved", "Dispute resolved", note);

  revalidatePath("/admin/disputes");
}
