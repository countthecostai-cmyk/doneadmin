import { createClient } from "@/lib/supabase/server";
import { resolveDispute } from "@/app/admin/disputes/actions";
import type { Dispute, Task } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type Row = Dispute & { tasks: Task | null };

export default async function AdminDisputesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("disputes")
    .select("*, tasks(*)")
    .eq("status", "open")
    .order("created_at", { ascending: true });

  const rows = (data as Row[]) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Open disputes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Release pays the Doer, refund returns the Requester&apos;s money, cancel closes the task with neither.
        </p>
      </div>
      <ul className="space-y-4">
        {rows.length === 0 && (
          <p className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
            No open disputes.
          </p>
        )}
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="font-medium text-neutral-900">{row.tasks?.title ?? row.task_id}</p>
            <p className="mt-1 text-sm text-neutral-600">{row.reason}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={resolveDispute.bind(null, row.id, row.task_id, "resolved_release", "Released to Doer")}>
                <button className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
                  Release payout
                </button>
              </form>
              <form action={resolveDispute.bind(null, row.id, row.task_id, "resolved_refund", "Refunded Requester")}>
                <button className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
                  Refund Requester
                </button>
              </form>
              <form action={resolveDispute.bind(null, row.id, row.task_id, "resolved_other", "Cancelled")}>
                <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                  Cancel task
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
