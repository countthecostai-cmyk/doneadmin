"use client";

import { useActionState, useState } from "react";
import { createPromotion } from "@/app/admin/settings/actions";

export function NewPromotionForm() {
  const [open, setOpen] = useState(false);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [state, formAction, pending] = useActionState(
    async (prevState: { error?: string } | undefined, formData: FormData) => createPromotion(formData),
    undefined
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        + New promotion
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-4"
    >
      <div>
        <label className="block text-xs font-medium text-neutral-600">Code</label>
        <input
          name="code"
          placeholder="WELCOME10"
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm uppercase"
        />
      </div>
      <div className="sm:col-span-3">
        <label className="block text-xs font-medium text-neutral-600">Description (internal)</label>
        <input
          name="description"
          placeholder="Launch-week 10% off"
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-600">Type</label>
        <select
          name="discount_type"
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="percent">Percent off</option>
          <option value="fixed">Fixed amount off</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">
          {discountType === "percent" ? "Percent (1-100)" : "Cents off"}
        </label>
        <input
          name="discount_value"
          type="number"
          min="1"
          max={discountType === "percent" ? 100 : undefined}
          placeholder={discountType === "percent" ? "10" : "500"}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Max discount, cents (percent only)</label>
        <input
          name="max_discount_cents"
          type="number"
          min="1"
          placeholder="optional cap"
          disabled={discountType !== "percent"}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm disabled:bg-neutral-100"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Min subtotal, cents</label>
        <input
          name="min_subtotal_cents"
          type="number"
          min="0"
          placeholder="0"
          defaultValue={0}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-600">Max total redemptions</label>
        <input
          name="max_redemptions"
          type="number"
          min="1"
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
          defaultValue={1}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Starts (optional)</label>
        <input
          name="starts_at"
          type="datetime-local"
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600">Expires (optional)</label>
        <input
          name="expires_at"
          type="datetime-local"
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>

      {state?.error && <p className="col-span-full text-sm text-red-600">{state.error}</p>}
      <div className="col-span-full flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create promotion"}
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
