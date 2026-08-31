"use client";

import { useActionState, useState } from "react";
import { setUserSuspension } from "@/app/admin/users/actions";

export function SuspendControl({
  userId,
  isSuspended,
  suspendedReason,
}: {
  userId: string;
  isSuspended: boolean;
  suspendedReason: string | null;
}) {
  const [open, setOpen] = useState(false);

  const boundAction = async (
    prevState: { error?: string } | undefined,
    formData: FormData
  ) => setUserSuspension(userId, true, String(formData.get("reason") ?? ""));
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  const reactivateAction = async () => {
    await setUserSuspension(userId, false, "");
  };

  if (isSuspended) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-800">Account suspended</p>
        {suspendedReason && <p className="mt-1 text-sm text-red-700">{suspendedReason}</p>}
        <form action={reactivateAction} className="mt-3">
          <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
            Reactivate account
          </button>
        </form>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Suspend account
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
      <label className="block text-xs font-medium text-neutral-600" htmlFor="reason">
        Reason (shown to the user)
      </label>
      <textarea
        id="reason"
        name="reason"
        rows={2}
        required
        placeholder="Why is this account being suspended?"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
      />
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Suspending…" : "Confirm suspend"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
