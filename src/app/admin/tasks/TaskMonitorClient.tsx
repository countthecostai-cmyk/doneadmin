"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeToAllTasks } from "@/lib/realtime";
import { STATUS_LABELS, type TaskStatus } from "@/lib/task-state-machine";
import { formatCents } from "@/lib/pricing";

export interface MonitorTask {
  id: string;
  title: string;
  status: TaskStatus;
  address: string;
  price_cents: number;
  currency: string;
  requester_id: string;
  doer_id: string | null;
  requester_name: string | null;
  doer_name: string | null;
  task_type_name: string | null;
  created_at: string;
  updated_at: string;
}

export function TaskMonitorClient({
  initialTasks,
  statusFilter,
  allStatuses,
}: {
  initialTasks: MonitorTask[];
  statusFilter: string;
  allStatuses: TaskStatus[];
}) {
  const [tasks, setTasks] = useState<MonitorTask[]>(initialTasks);
  const [prevInitialTasks, setPrevInitialTasks] = useState(initialTasks);
  const [q, setQ] = useState("");
  const [live, setLive] = useState(false);
  const router = useRouter();

  // Reset local state whenever the server-filtered initial set changes (i.e.
  // the admin picked a different status filter and the page re-fetched).
  // Adjusted during render (React's recommended pattern for "derive state
  // from a changed prop") rather than in an effect, which would set state
  // synchronously on mount and trigger an extra cascading render.
  if (initialTasks !== prevInitialTasks) {
    setPrevInitialTasks(initialTasks);
    setTasks(initialTasks);
  }

  useEffect(() => {
    const supabase = createClient();
    const unsubscribe = subscribeToAllTasks<MonitorTask>(supabase, (payload) => {
      setLive(true);
      if (payload.eventType === "DELETE") {
        const oldId = payload.old?.id;
        if (oldId) setTasks((prev) => prev.filter((t) => t.id !== oldId));
        return;
      }
      const incoming = payload.new;
      if (!incoming?.id) return;
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === incoming.id);
        if (idx === -1) {
          // A brand-new task via realtime — we don't have the joined
          // requester/doer/task-type names from a bare postgres_changes
          // payload, so this row starts minimal; clicking into it shows
          // the full detail immediately.
          return [{ ...incoming } as MonitorTask, ...prev];
        }
        const next = [...prev];
        next[idx] = { ...next[idx], ...incoming };
        return next;
      });
    });
    return unsubscribe;
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return tasks;
    const needle = q.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        t.address.toLowerCase().includes(needle) ||
        (t.requester_name ?? "").toLowerCase().includes(needle) ||
        (t.doer_name ?? "").toLowerCase().includes(needle)
    );
  }, [tasks, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => router.push(`/admin/tasks?status=${e.target.value}`)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
        >
          <option value="active">Active only</option>
          <option value="all">All statuses</option>
          {allStatuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter loaded tasks by title, address, or person…"
          className="w-72 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <span className={`text-xs ${live ? "text-green-600" : "text-neutral-500"}`}>
          {live ? "● live" : "○ connecting…"}
        </span>
        <span className="text-xs text-neutral-500">{filtered.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Task</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Requester</th>
              <th className="px-4 py-3">Doer</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  No tasks match.
                </td>
              </tr>
            )}
            {filtered.map((task) => (
              <tr key={task.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/tasks/${task.id}`} className="font-medium text-neutral-900 hover:underline">
                    {task.task_type_name ?? task.title}
                  </Link>
                  <p className="text-xs text-neutral-500">{task.address}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={task.status} />
                </td>
                <td className="px-4 py-3 text-neutral-600">{task.requester_name ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600">{task.doer_name ?? (task.doer_id ? "—" : "Unclaimed")}</td>
                <td className="px-4 py-3 text-neutral-600">{formatCents(task.price_cents, task.currency)}</td>
                <td className="px-4 py-3 text-neutral-500">{new Date(task.updated_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const DISPUTE_LIKE: TaskStatus[] = ["disputed"];
const TERMINAL_BAD: TaskStatus[] = ["cancelled", "declined", "expired", "refunded"];

function StatusBadge({ status }: { status: TaskStatus }) {
  const tone = DISPUTE_LIKE.includes(status)
    ? "bg-red-100 text-red-700"
    : TERMINAL_BAD.includes(status)
      ? "bg-neutral-100 text-neutral-500"
      : status === "payout_completed"
        ? "bg-green-100 text-green-700"
        : "bg-blue-50 text-blue-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{STATUS_LABELS[status]}</span>;
}
