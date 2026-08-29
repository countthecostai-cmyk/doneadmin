"use client";

import { useActionState, useState } from "react";
import { createTaskType } from "@/app/admin/settings/actions";
import type { Category, PricingModel } from "@/lib/database.types";

const PRICING_MODELS: PricingModel[] = [
  "flat",
  "hourly",
  "quantity",
  "distance",
  "doer_quote",
  "custom_quote",
  "minimum_charge",
];

export function NewTaskTypeForm({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prevState: { error?: string } | undefined, formData: FormData) => createTaskType(formData),
    undefined
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        + New task type
      </button>
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-4">
      <div>
        <label className="block text-xs font-medium text-neutral-600">Category</label>
        <select name="category_id" required className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <TextField label="Slug" name="slug" placeholder="dog-walking" />
      <TextField label="Name" name="name" placeholder="Dog Walking" />
      <div>
        <label className="block text-xs font-medium text-neutral-600">Pricing model</label>
        <select name="pricing_model" defaultValue="flat" className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm">
          {PRICING_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <TextField label="Description" name="description" placeholder="Optional" />
      <NumberField label="Base price (¢)" name="base_price_cents" />
      <NumberField label="Minimum price (¢)" name="min_price_cents" />
      <NumberField label="Per-unit price (¢)" name="price_per_unit_cents" />
      <TextField label="Unit label" name="unit_label" placeholder="hour, item, mile…" />
      <label className="col-span-2 flex items-center gap-2 text-xs font-medium text-neutral-600 sm:col-span-4">
        <input type="checkbox" name="requires_photo_proof" defaultChecked />
        Requires completion photo proof
      </label>
      {state?.error && <p className="col-span-full text-sm text-red-600">{state.error}</p>}
      <div className="col-span-full flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create task type"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

function TextField({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-600">{label}</label>
      <input name={name} placeholder={placeholder} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm" />
    </div>
  );
}

function NumberField({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-600">{label}</label>
      <input type="number" name={name} min={0} defaultValue={0} className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm" />
    </div>
  );
}
