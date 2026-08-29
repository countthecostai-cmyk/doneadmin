import { createClient } from "@/lib/supabase/server";
import { setDoerStatus } from "@/app/admin/doers/actions";
import type { DoerProfile, Profile } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type Row = DoerProfile & { profiles: Pick<Profile, "full_name" | "id"> | null };

export default async function AdminDoersPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("doer_profiles")
    .select("*, profiles(id, full_name)")
    .order("applied_at", { ascending: true });

  const rows = (data as Row[]) ?? [];
  const pending = rows.filter((r) => r.status === "pending");
  const decided = rows.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Doer applications</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Approving a Doer here is what lets them see and claim tasks in the open pool.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Pending review ({pending.length})</h2>
        <ApplicationList rows={pending} showActions />
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">Decided</h2>
          <ApplicationList rows={decided} showActions={false} />
        </section>
      )}
    </div>
  );
}

function ApplicationList({ rows, showActions }: { rows: Row[]; showActions: boolean }) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">Nothing here.</p>;
  }
  return (
    <ul className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-white">
      {rows.map((row) => (
        <li key={row.user_id} className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="font-medium text-neutral-900">{row.profiles?.full_name ?? row.user_id}</p>
            <p className="text-sm text-neutral-500">
              {row.bio || "No bio provided"} · status: {row.status}
            </p>
          </div>
          {showActions ? (
            <div className="flex shrink-0 gap-2">
              <form action={setDoerStatus.bind(null, row.user_id, "approved")}>
                <button className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
                  Approve
                </button>
              </form>
              <form action={setDoerStatus.bind(null, row.user_id, "rejected")}>
                <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                  Reject
                </button>
              </form>
            </div>
          ) : (
            <StatusPill status={row.status} />
          )}
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }: { status: DoerProfile["status"] }) {
  const tone =
    status === "approved"
      ? "bg-green-100 text-green-700"
      : status === "rejected" || status === "suspended"
        ? "bg-red-100 text-red-700"
        : "bg-neutral-100 text-neutral-600";
  return <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{status}</span>;
}
