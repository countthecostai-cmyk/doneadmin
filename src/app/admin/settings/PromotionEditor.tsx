"use client";

import { useActionState, useState } from "react";
import { updatePromotion } from "@/app/admin/settings/actions";
import type { Promotion } from "@/lib/database.types";

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  // datetime-local wants "YYYY-MM-DDTHH:mm" in local time, no timezone suffix.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PromotionEditor({ promotion }: { promotion: Promotion }) {
  const [open, setOpen] = useState(false);
  const boundAction = async (prevState: { error?: string } | undefined, formData: FormData) =>
    updatePromotion(promotion.id, formData);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Edit
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 sm:grid-cols-3"
    >
      <div className="sm:col-span-3">
        <label className="block text-xs font-medium text-neutral-600">Description (internal)</label>
        <input
          name="description"
          defaultValue={promotion.description ?? ""}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Max discount, cents (percent only)</label>
        <input
          name="max_discount_cents"
          type="number"
          min="1"
          defaultValue={promotion.max_discount_cents ?? ""}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Min subtotal, cents</label>
        <input
          name="min_subtotal_cents"
          type="number"
          min="0"
          defaultValue={promotion.min_subtotal_cents}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Max total redemptions</label>
        <input
          name="max_redemptions"
          type="number"
          min="1"
          defaultValue={promotion.max_redemptions ?? ""}
          placeholder="unlimited"
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Per-Requester limit</label>
        <input
          name="per_user_limit"
          type="number"
          min="1"
          defaultValue={promotion.per_user_limit}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Starts (optional)</label>
        <input
          name="starts_at"
          type="datetime-local"
          defaultValue={toLocalInputValue(promotion.starts_at)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Expires (optional)</label>
        <input
          name="expires_at"
          type="datetime-local"
          defaultValue={toLocalInputValue(promotion.expires_at)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      {state?.error && <p role="alert" className="col-span-full text-sm text-red-600">{state.error}</p>}
      <div className="col-span-full flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700"
        >
          Close
        </button>
      </div>
    </form>
  );
}
