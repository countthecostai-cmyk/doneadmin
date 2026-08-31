"use client";

import { useActionState, useState } from "react";
import { createCategory } from "@/app/admin/settings/actions";

export function NewCategoryForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prevState: { error?: string } | undefined, formData: FormData) => createCategory(formData),
    undefined
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        + New category
      </button>
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-4">
      <TextField label="Slug" name="slug" placeholder="home-services" />
      <TextField label="Name" name="name" placeholder="Home Services" />
      <TextField label="Icon (emoji)" name="icon" placeholder="🏠" />
      <TextField label="Description" name="description" placeholder="Optional" />
      {state?.error && <p role="alert" className="col-span-full text-sm text-red-600">{state.error}</p>}
      <div className="col-span-full flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create category"}
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
      <input
        name={name}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
      />
    </div>
  );
}
