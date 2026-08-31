"use client";

import { useActionState, useState } from "react";
import { replyToTicket } from "@/app/admin/support/actions";

export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const [isInternal, setIsInternal] = useState(false);
  const boundAction = async (prevState: { error?: string } | undefined, formData: FormData) =>
    replyToTicket(ticketId, formData);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div>
        <label htmlFor="body" className="mb-1 block text-sm font-medium text-neutral-900">
          {isInternal ? "Internal note" : "Reply"}
        </label>
        <textarea
          id="body"
          name="body"
          required
          maxLength={4000}
          rows={4}
          placeholder={
            isInternal
              ? "Only other admins can see this — e.g. \"verified refund eligibility, waiting on Stripe\""
              : "Visible to the Requester/Doer who opened this ticket."
          }
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input
          type="checkbox"
          name="is_internal_note"
          checked={isInternal}
          onChange={(e) => setIsInternal(e.target.checked)}
        />
        Internal note (never visible to the Requester/Doer)
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className={`rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 ${
          isInternal ? "bg-amber-600" : "bg-neutral-900"
        }`}
      >
        {pending ? "Sending…" : isInternal ? "Save internal note" : "Send reply"}
      </button>
    </form>
  );
}
