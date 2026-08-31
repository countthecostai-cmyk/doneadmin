import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminTaskActions } from "@/app/admin/tasks/[id]/AdminTaskActions";
import { STATUS_LABELS, type TaskStatus } from "@/lib/task-state-machine";
import { formatCents, formatChargeBreakdown } from "@/lib/pricing";
import type { Message, Profile, Task, TaskStatusHistoryRow, TaskType } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type TaskRow = Task & {
  task_types: TaskType | null;
  requester: Profile | null;
  doer: Profile | null;
};

type MessageRow = Message & {
  sender: Pick<Profile, "full_name"> | null;
  recipient: Pick<Profile, "full_name"> | null;
};

export default async function AdminTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: taskData } = await supabase
    .from("tasks")
    .select(
      "*, task_types(*), requester:profiles!tasks_requester_id_fkey(*), doer:profiles!tasks_doer_id_fkey(*)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!taskData) notFound();
  const task = taskData as unknown as TaskRow;

  const [{ data: history }, { data: messages }, { data: photoSigned }] = await Promise.all([
    supabase
      .from("task_status_history")
      .select("*")
      .eq("task_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("messages")
      .select("*, sender:profiles!messages_sender_id_fkey(full_name), recipient:profiles!messages_recipient_id_fkey(full_name)")
      .eq("task_id", id)
      .order("created_at", { ascending: true }),
    task.completion_photo_url
      ? supabase.storage.from("task-photos").createSignedUrl(task.completion_photo_url, 3600)
      : Promise.resolve({ data: null }),
  ]);

  const photoUrl = photoSigned?.signedUrl ?? null;

  return (
    <div className="space-y-6">
      <Link href="/admin/tasks" className="text-sm text-neutral-500 hover:underline">
        ← Live jobs
      </Link>

      <div className="flex items-start justify-between rounded-lg border border-neutral-200 bg-white p-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{task.task_types?.name ?? task.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">{task.address}</p>
          <p className="mt-1 text-xs text-neutral-500">id {task.id}</p>
        </div>
        <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white">
          {STATUS_LABELS[task.status]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-neutral-200 bg-white p-6 text-sm sm:grid-cols-4">
        <Field label="Price + tip">{formatChargeBreakdown(task.price_cents, task.tip_cents, task.currency)}</Field>
        <Field label="Platform fee">{formatCents(task.platform_fee_cents, task.currency)}</Field>
        <Field label="Doer payout">{formatCents(task.doer_payout_cents + task.tip_cents, task.currency)}</Field>
        <Field label="Photo proof required">{task.requires_photo_proof ? "Yes" : "No"}</Field>
        <Field label="Requester">
          {task.requester ? (
            <Link href={`/admin/users/${task.requester.id}`} className="underline">
              {task.requester.full_name ?? task.requester.id}
            </Link>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Doer">
          {task.doer ? (
            <Link href={`/admin/users/${task.doer.id}`} className="underline">
              {task.doer.full_name ?? task.doer.id}
            </Link>
          ) : (
            "Unclaimed"
          )}
        </Field>
        <Field label="Created">{new Date(task.created_at).toLocaleString()}</Field>
        <Field label="Last updated">{new Date(task.updated_at).toLocaleString()}</Field>
      </div>

      {task.description && (
        <p className="rounded-lg bg-white p-4 text-sm text-neutral-700 ring-1 ring-neutral-200">{task.description}</p>
      )}

      {photoUrl && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-neutral-700">Completion photo</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="Completion proof" className="max-w-md rounded-lg border border-neutral-200" />
          {task.completion_note && <p className="mt-2 text-sm text-neutral-600">{task.completion_note}</p>}
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">Admin actions</h2>
        <AdminTaskActions taskId={task.id} status={task.status} hasDoer={!!task.doer_id} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">Status history</h2>
          <ol className="space-y-3 border-l border-neutral-200 pl-4">
            {((history as TaskStatusHistoryRow[]) ?? []).map((h) => (
              <li key={h.id} className="text-sm">
                <p className="font-medium text-neutral-900">{STATUS_LABELS[h.status as TaskStatus] ?? h.status}</p>
                <p className="text-xs text-neutral-500">
                  {new Date(h.created_at).toLocaleString()} · {h.changed_by_actor}
                </p>
                {h.note && <p className="text-xs text-neutral-600">{h.note}</p>}
              </li>
            ))}
            {(!history || history.length === 0) && <p className="text-sm text-neutral-500">No history yet.</p>}
          </ol>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">Message thread (read-only)</h2>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {((messages as MessageRow[]) ?? []).map((m) => (
              <div key={m.id} className="rounded-lg bg-neutral-50 p-3 text-sm">
                <p className="text-xs font-medium text-neutral-500">
                  {m.sender?.full_name ?? "Someone"} → {m.recipient?.full_name ?? "someone"} ·{" "}
                  {new Date(m.created_at).toLocaleString()}
                </p>
                <p className="mt-1 text-neutral-800">{m.body}</p>
              </div>
            ))}
            {(!messages || messages.length === 0) && <p className="text-sm text-neutral-500">No messages yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-neutral-500">{label}</p>
      <p className="mt-0.5 font-medium text-neutral-900">{children}</p>
    </div>
  );
}
