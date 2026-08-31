"use client";

import { useActionState, useState } from "react";
import { updateServiceAreaZips } from "@/app/admin/settings/actions";
import type { ServiceArea } from "@/lib/database.types";

export function ServiceAreaEditor({ serviceArea }: { serviceArea: ServiceArea }) {
  const [open, setOpen] = useState(false);
  const boundAction = async (prevState: { error?: string } | undefined, formData: FormData) =>
    updateServiceAreaZips(serviceArea.id, formData);
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
      <div>
        <label className="block text-xs font-medium text-neutral-600">Name</label>
        <input
          name="name"
          defaultValue={serviceArea.name}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-neutral-600">
          ZIP codes (comma or space separated)
        </label>
        <input
          name="zip_codes"
          defaultValue={serviceArea.zip_codes.join(", ")}
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
