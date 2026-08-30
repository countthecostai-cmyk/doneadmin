import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import type { Profile, SupportTicket, SupportTicketMessage, Task } from "@/lib/database.types";
import { STATUS_LABELS, CATEGORY_LABELS } from "@/lib/support-ticket-state-machine";
import { changeTicketStatus, assignTicketToSelf } from "@/app/admin/support/actions";
import { TicketReplyForm } from "@/app/admin/support/TicketReplyForm";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<SupportTicket["status"], string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-neutral-100 text-neutral-500",
};

export default async function AdminSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireAdmin();
  if (!gate.ok && gate.reason === "signed-out") redirect("/sign-in?next=/dashboard");
  if (!gate.ok) {
    return (
      <p className="text-sm text-neutral-500">This is the Done Admin console. Your account doesn&apos;t have admin access.</p>
    );
  }

  const supabase = await createClient();

  const [{ data: ticketData }, { data: messagesData }] = await Promise.all([
    supabase.from("support_tickets").select("*").eq("id", id).maybeSingle(),
    supabase.from("support_ticket_messages").select("*").eq("ticket_id", id).order("created_at"),
  ]);
  const ticket = ticketData as SupportTicket | null;
  if (!ticket) notFound();

  const [{ data: creatorData }, { data: assignedAdminData }, { data: relatedTaskData }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, phone").eq("id", ticket.created_by).maybeSingle(),
    ticket.assigned_admin
      ? supabase.from("profiles").select("id, full_name").eq("id", ticket.assigned_admin).maybeSingle()
      : Promise.resolve({ data: null }),
    ticket.related_task_id
      ? supabase.from("tasks").select("id, title, status").eq("id", ticket.related_task_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const creator = creatorData as Pick<Profile, "id" | "full_name" | "phone"> | null;
  const assignedAdmin = assignedAdminData as Pick<Profile, "id" | "full_name"> | null;
  const relatedTask = relatedTaskData as Pick<Task, "id" | "title" | "status"> | null;
  const messages = (messagesData as SupportTicketMessage[]) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-neutral-500">
          <Link href="/admin/support" className="hover:underline">
            Support
          </Link>{" "}
          / {CATEGORY_LABELS[ticket.category]}
        </p>
        <div className="mt-1 flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold text-neutral-900">{ticket.subject}</h1>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${STATUS_TONE[ticket.status]}`}>
            {STATUS_LABELS[ticket.status]}
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {creator?.full_name ?? "Unknown"} ({ticket.created_by_role})
          {creator?.phone && ` · ${creator.phone}`}
          {relatedTask && (
            <>
              {" "}
              · related task:{" "}
              <Link href="/admin/tasks" className="underline">
                {relatedTask.title}
              </Link>{" "}
              ({relatedTask.status})
            </>
          )}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Assigned to: {assignedAdmin?.full_name ?? "Unassigned"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ticket.assigned_admin !== gate.userId && (
          <form action={assignTicketToSelf.bind(null, ticket.id)}>
            <button className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              Assign to me
            </button>
          </form>
        )}
        <StatusActions ticket={ticket} />
      </div>

      <ul className="space-y-3">
        {messages.length === 0 && (
          <p className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
            No messages yet.
          </p>
        )}
        {messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-lg border p-3 text-sm ${
              m.is_internal_note
                ? "border-amber-200 bg-amber-50"
                : m.sender_role === "admin"
                  ? "border-neutral-200 bg-neutral-50"
                  : "border-blue-100 bg-blue-50"
            }`}
          >
            <p className="mb-1 text-xs font-medium text-neutral-500">
              {m.is_internal_note
                ? "Internal note"
                : m.sender_role === "admin"
                  ? "Done Support"
                  : ticket.created_by_role === "requester"
                    ? "Requester"
                    : "Doer"}{" "}
              · {new Date(m.created_at).toLocaleString()}
            </p>
            <p className="whitespace-pre-wrap text-neutral-900">{m.body}</p>
          </li>
        ))}
      </ul>

      <TicketReplyForm ticketId={ticket.id} />
    </div>
  );
}

/**
 * Buttons offered depend only on the ticket's current status — every move
 * shown here is legal per TICKET_TRANSITIONS (support-ticket-state-machine.ts);
 * changeTicketStatus() re-validates through the real state machine
 * regardless, this just avoids ever showing a button that would 400.
 */
function StatusActions({ ticket }: { ticket: SupportTicket }) {
  const s = ticket.status;
  const buttons: { label: string; to: SupportTicket["status"]; tone: string }[] = [];

  if (s === "open" || s === "in_progress") {
    if (s === "open") {
      buttons.push({ label: "Start progress", to: "in_progress", tone: "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50" });
    } else {
      buttons.push({ label: "Back to open", to: "open", tone: "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50" });
    }
    buttons.push({ label: "Resolve", to: "resolved", tone: "bg-green-600 text-white hover:bg-green-700" });
    buttons.push({ label: "Close", to: "closed", tone: "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50" });
  } else if (s === "resolved") {
    buttons.push({ label: "Reopen", to: "open", tone: "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50" });
    buttons.push({ label: "Close", to: "closed", tone: "bg-neutral-900 text-white hover:bg-neutral-800" });
  } else if (s === "closed") {
    buttons.push({ label: "Reopen", to: "open", tone: "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50" });
  }

  return (
    <>
      {buttons.map((b) => (
        <form key={b.to} action={changeTicketStatus.bind(null, ticket.id, s, b.to, null)}>
          <button type="submit" className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${b.tone}`}>
            {b.label}
          </button>
        </form>
      ))}
    </>
  );
}
