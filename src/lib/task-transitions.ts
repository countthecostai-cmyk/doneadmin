import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskActor, TaskStatus } from "@/lib/task-state-machine";
import { canActorTransition } from "@/lib/task-state-machine";

export class TransitionConflictError extends Error {
  constructor(taskId: string, expected: TaskStatus) {
    super(
      `Task ${taskId} was not in status "${expected}" — someone else already moved it. Refresh and try again.`
    );
    this.name = "TransitionConflictError";
  }
}

export class IllegalTransitionError extends Error {
  constructor(from: TaskStatus, to: TaskStatus, actor: TaskActor) {
    super(`${actor} may not move a task from "${from}" to "${to}".`);
    this.name = "IllegalTransitionError";
  }
}

/**
 * The one place every status-changing write goes through: validates the
 * move against the state machine, performs an ATOMIC conditional update
 * (.eq('status', expectedCurrent)) so two concurrent requests can never
 * both succeed, and appends a status-history row. Zero rows affected means
 * a concurrent request already moved it — callers get a conflict error
 * instead of silently re-running side effects (notifications, payouts).
 *
 * `client` should be the RLS-scoped server client for requester/doer-
 * initiated transitions, or the service-role client for genuine
 * system/admin transitions — the caller decides, per the architecture doc's
 * "RLS is the real boundary" rule.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function transitionTask<T extends Record<string, any>>(
  client: SupabaseClient,
  opts: {
    taskId: string;
    from: TaskStatus;
    to: TaskStatus;
    actor: TaskActor;
    changedByUser: string | null;
    note?: string;
    extraPatch?: T;
  }
) {
  const { taskId, from, to, actor, changedByUser, note, extraPatch } = opts;

  if (!canActorTransition(from, to, actor)) {
    throw new IllegalTransitionError(from, to, actor);
  }

  const { data, error } = await client
    .from("tasks")
    .update({ status: to, ...(extraPatch ?? {}) })
    .eq("id", taskId)
    .eq("status", from)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new TransitionConflictError(taskId, from);

  const { error: historyError } = await client.from("task_status_history").insert({
    task_id: taskId,
    status: to,
    note: note ?? null,
    changed_by_actor: actor,
    changed_by_user: changedByUser,
  });
  if (historyError) {
    // The transition itself already committed — log and continue rather
    // than throwing away a successful state change over an audit-log write.
    console.error("status history insert failed:", historyError.message);
  }

  return data;
}
