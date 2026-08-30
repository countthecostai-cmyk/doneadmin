import { createClient } from "@/lib/supabase/server";
import type { AdminAuditLogRow, Profile } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type Row = AdminAuditLogRow & { profiles: Pick<Profile, "full_name"> | null };

const ACTION_LABELS: Record<string, string> = {
  user_suspended: "Suspended user",
  user_reactivated: "Reactivated user",
  doer_status_changed: "Changed Doer status",
  dispute_resolved: "Resolved dispute",
  task_force_transition: "Force-transitioned task",
  category_created: "Created category",
  category_toggled: "Toggled category",
  task_type_created: "Created task type",
  task_type_toggled: "Toggled task type",
  task_type_pricing_updated: "Updated task type pricing",
};

/**
 * Read-only by design — admin_audit_log has no update/delete RLS policy for
 * any role (see 0010_admin_audit_log.sql), so there is deliberately no
 * "edit" or "delete" affordance here to build. This page only ever
 * queries the last 200 entries; older history is still in the table for
 * anyone who needs to query further back directly.
 */
export default async function AdminAuditLogPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("admin_audit_log")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data as Row[]) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Audit log</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every privileged admin action, most recent first. This log is append-only — nothing here can be edited
          or deleted, including by an admin.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Admin</Th>
              <Th>Action</Th>
              <Th>Target</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                  No admin actions logged yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-neutral-50">
                <Td className="whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</Td>
                <Td>{row.profiles?.full_name ?? row.admin_id}</Td>
                <Td>{ACTION_LABELS[row.action] ?? row.action}</Td>
                <Td className="font-mono text-xs">
                  {row.target_type}
                  {row.target_id ? `:${row.target_id}` : ""}
                </Td>
                <Td className="max-w-xs truncate font-mono text-xs">
                  <span title={JSON.stringify(row.detail)}>
                    {Object.keys(row.detail ?? {}).length > 0 ? JSON.stringify(row.detail) : "—"}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-neutral-500 bg-neutral-50">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top text-neutral-700 ${className}`}>{children}</td>;
}
