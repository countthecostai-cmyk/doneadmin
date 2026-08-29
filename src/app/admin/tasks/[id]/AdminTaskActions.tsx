"use client";

import { useActionState, useState } from "react";
import { adminForceTransition } from "@/app/admin/tasks/[id]/actions";
import { STATUS_LABELS, TRANSITIONS, type TaskStatus } from "@/lib/task-state-machine";

const EXCLUDED_TARGETS = new Set<TaskStatus>(["disputed", "payout_completed"]);

export function AdminTaskActions({
  taskId,
  status,
  hasDoer,
}: {
  taskId: string;
  status: TaskStatus;
  hasDoer: boolean;
}) {
  const targets = TRANSITIONS[status].filter((to) => {
    if (EXCLUDED_TARGETS.has(to)) return false;
    if (to === "accepted" && !hasDoer) return false;
    return true;
  });

  if (status === "disputed") {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        This task is disputed — resolve it from the{" "}
        <a href="/admin/disputes" className="underline">
          Disputes page
        </a>{" "}
        so the dispute record stays in sync.
      </p>
    );
  }

  if (targets.length === 0) {
    return <p className="text-sm text-neutral-500">No admin actions available from this status.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((to) => (
        <TransitionButton key={to} taskId={taskId} from={status} to={to} />
      ))}
    </div>
  );
}

function TransitionButton({ taskId, from, to }: { taskId: string; from: TaskStatus; to: TaskStatus }) {
  const [open, setOpen] = useState(false);
  const boundAction = async (prevState: { error?: string } | undefined, formData: FormData) =>
    adminForceTransition(taskId, from, to, String(formData.get("note") ?? ""));
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  const destructive = to === "cancelled" || to === "refunded";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
          destructive
            ? "border-red-300 text-red-700 hover:bg-red-50"
            : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
        }`}
      >
        {STATUS_LABELS[to]}
      </button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-2 rounded-lg border border-neutral-200 bg-white p-3">
      <p className="text-sm font-medium text-neutral-900">
        Move to &ldquo;{STATUS_LABELS[to]}&rdquo;?
      </p>
      <input
        name="note"
        type="text"
        placeholder="Note for the status history (optional)"
        className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
      />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Applying…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
