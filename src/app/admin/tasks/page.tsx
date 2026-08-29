import { createClient } from "@/lib/supabase/server";
import { TaskMonitorClient, type MonitorTask } from "@/app/admin/tasks/TaskMonitorClient";
import { ACTIVE_TASK_STATUSES, STATUS_LABELS, type TaskStatus } from "@/lib/task-state-machine";
import type { Profile, Task, TaskType } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const ALL_STATUSES = Object.keys(STATUS_LABELS) as TaskStatus[];

type Row = Task & {
  task_types: Pick<TaskType, "name"> | null;
  requester: Pick<Profile, "full_name"> | null;
  doer: Pick<Profile, "full_name"> | null;
};

export default async function AdminLiveJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "active" } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("tasks")
    .select(
      "*, task_types(name), requester:profiles!tasks_requester_id_fkey(full_name), doer:profiles!tasks_doer_id_fkey(full_name)"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (status === "active") {
    query = query.in("status", ACTIVE_TASK_STATUSES);
  } else if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  const rows = (data as Row[] | null) ?? [];

  const initialTasks: MonitorTask[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    address: r.address,
    price_cents: r.price_cents,
    currency: r.currency,
    requester_id: r.requester_id,
    doer_id: r.doer_id,
    requester_name: r.requester?.full_name ?? null,
    doer_name: r.doer?.full_name ?? null,
    task_type_name: r.task_types?.name ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Live jobs monitor</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every task, updating in real time. Filtered server-side to {status === "all" ? "all statuses" : status}.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">Failed to load tasks: {error.message}</p>}
      </div>

      <TaskMonitorClient initialTasks={initialTasks} statusFilter={status} allStatuses={ALL_STATUSES} />
    </div>
  );
}
