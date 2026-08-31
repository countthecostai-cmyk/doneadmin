import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { DoerProfile, Profile } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type Row = Profile & {
  doer_profile: Pick<DoerProfile, "status" | "rating_avg" | "rating_count" | "is_available"> | null;
};

const ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "doer", label: "Doers" },
  { value: "requester", label: "Requesters only" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All accounts" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; status?: string; q?: string }>;
}) {
  const { role = "all", status = "all", q = "" } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (role === "doer") query = query.eq("is_doer", true);
  if (role === "requester") query = query.eq("is_doer", false);
  if (status === "active") query = query.eq("is_suspended", false);
  if (status === "suspended") query = query.eq("is_suspended", true);
  if (q.trim()) query = query.ilike("full_name", `%${q.trim()}%`);

  const { data, error } = await query;
  const profiles = (data as Profile[] | null) ?? [];

  // Fetched separately (rather than a `profiles(*, doer_profiles(...))`
  // embed) since doer_profiles.user_id is that table's primary key —
  // PostgREST's array-vs-object shape for a reverse one-to-one embed here
  // isn't worth gambling on without a live schema to check it against; a
  // plain second query + in-memory join is unambiguous either way.
  const doerIds = profiles.filter((p) => p.is_doer).map((p) => p.id);
  const doerProfilesById = new Map<string, Pick<DoerProfile, "status" | "rating_avg" | "rating_count" | "is_available">>();
  if (doerIds.length > 0) {
    const { data: doerProfilesData } = await supabase
      .from("doer_profiles")
      .select("user_id, status, rating_avg, rating_count, is_available")
      .in("user_id", doerIds);
    for (const dp of (doerProfilesData as (DoerProfile & { user_id: string })[] | null) ?? []) {
      doerProfilesById.set(dp.user_id, dp);
    }
  }

  const rows: Row[] = profiles.map((p) => ({ ...p, doer_profile: doerProfilesById.get(p.id) ?? null }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Users</h1>
        <p className="mt-1 text-sm text-neutral-500">Requesters and Doers, joined from one profiles table.</p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        <Field label="Search by name">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Jane Doe"
            className="w-48 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
          />
        </Field>
        <Field label="Role">
          <select name="role" defaultValue={role} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <button className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800">
          Filter
        </button>
        {(role !== "all" || status !== "all" || q) && (
          <Link href="/admin/users" className="text-sm text-neutral-500 underline">
            Clear
          </Link>
        )}
      </form>

      {error && <p role="alert" className="text-sm text-red-600">Failed to load users: {error.message}</p>}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Doer status</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  No users match these filters.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${row.id}`} className="font-medium text-neutral-900 hover:underline">
                    {row.full_name ?? "(no name)"}
                  </Link>
                  {row.is_admin && (
                    <span className="ml-2 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-medium text-white">
                      ADMIN
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-600">{row.is_doer ? "Doer" : "Requester"}</td>
                <td className="px-4 py-3 text-neutral-600">{row.doer_profile?.status ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {row.doer_profile?.rating_avg
                    ? `${row.doer_profile.rating_avg.toFixed(2)} (${row.doer_profile.rating_count})`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {row.is_suspended ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Suspended
                    </span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500">{new Date(row.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
      {label}
      {children}
    </label>
  );
}
