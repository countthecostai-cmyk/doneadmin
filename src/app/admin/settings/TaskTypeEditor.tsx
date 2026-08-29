"use client";

import { useActionState, useState } from "react";
import { updateTaskTypePricing } from "@/app/admin/settings/actions";
import type { TaskType } from "@/lib/database.types";

export function TaskTypeEditor({ taskType }: { taskType: TaskType }) {
  const [open, setOpen] = useState(false);
  const boundAction = async (prevState: { error?: string } | undefined, formData: FormData) =>
    updateTaskTypePricing(taskType.id, formData);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Edit pricing
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 sm:grid-cols-4">
      <NumberField label="Base price (¢)" name="base_price_cents" defaultValue={taskType.base_price_cents} />
      <NumberField label="Minimum price (¢)" name="min_price_cents" defaultValue={taskType.min_price_cents} />
      <NumberField
        label="Per-unit price (¢)"
        name="price_per_unit_cents"
        defaultValue={taskType.price_per_unit_cents ?? ""}
      />
      <div>
        <label className="block text-xs font-medium text-neutral-600">Unit label</label>
        <input
          name="unit_label"
          defaultValue={taskType.unit_label ?? ""}
          placeholder="hour, item, mile…"
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <label className="col-span-2 flex items-center gap-2 text-xs font-medium text-neutral-600 sm:col-span-4">
        <input type="checkbox" name="requires_photo_proof" defaultChecked={taskType.requires_photo_proof} />
        Requires completion photo proof
      </label>
      {state?.error && <p className="col-span-full text-sm text-red-600">{state.error}</p>}
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

function NumberField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: number | string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-600">{label}</label>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={0}
        className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
      />
    </div>
  );
}
