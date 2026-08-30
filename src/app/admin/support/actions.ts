"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/require-admin";
import { transitionTicket } from "@/lib/support-ticket-transitions";
import type { SupportTicketStatus } from "@/lib/support-ticket-state-machine";
import { notify } from "@/lib/notify";
import { logAdminAction } from "@/lib/audit-log";
import { revalidatePath } from "next/cache";

const STATUS_NOTIFY_TEXT: Record<SupportTicketStatus, string> = {
  open: "reopened",
  in_progress: "picked up",
  resolved: "marked resolved",
  closed: "closed",
};

/**
 * Admin support-ticket actions. RLS-scoped client throughout (like
 * disputes/actions.ts) — support_tickets_update + support_ticket_messages_
 * insert (0012) already grant is_admin(auth.uid()) full access, so there's
 * no need to drop to the service-role client here.
 */
export async function changeTicketStatus(
  ticketId: string,
  from: SupportTicketStatus,
  to: SupportTicketStatus,
  note: string | null
): Promise<void> {
  const gate = await requireAdmin();
  if (!gate.ok) throw new Error("You must be an admin to do this.");

  const supabase = await createClient();
  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, created_by")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) throw new Error("Ticket not found.");

  // Deliberately unhandled: an IllegalTransitionError/TransitionConflictError
  // here means the button that triggered this shouldn't have been shown
  // (status changed since page load) — propagate to the error boundary
  // rather than inventing a friendly-string UI for a case that shouldn't
  // happen, same as resolveDispute in ../disputes/actions.ts.
  await transitionTicket(supabase, {
    ticketId,
    from,
    to,
    actor: "admin",
    changedByUser: gate.userId,
    note: note || undefined,
  });

  await logAdminAction(supabase, gate.userId, "support_ticket_status_changed", "support_ticket", ticketId, {
    from,
    to,
    note: note || null,
  });

  await notify(
    ticket.created_by,
    "support_ticket_updated",
    `Your support ticket was ${STATUS_NOTIFY_TEXT[to]}`,
    note ?? undefined
  );

  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
}

export async function assignTicketToSelf(ticketId: string): Promise<void> {
  const gate = await requireAdmin();
  if (!gate.ok) throw new Error("You must be an admin to do this.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("support_tickets")
    .update({ assigned_admin: gate.userId })
    .eq("id", ticketId);
  if (error) throw new Error(error.message);

  await logAdminAction(supabase, gate.userId, "support_ticket_assigned", "support_ticket", ticketId, {
    assigned_admin: gate.userId,
  });

  revalidatePath(`/admin/support/${ticketId}`);
}

export async function replyToTicket(ticketId: string, formData: FormData): Promise<{ error?: string }> {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: "You must be an admin to do this." };

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Message can't be empty." };
  if (body.length > 4000) return { error: "Message is too long (4000 characters max)." };
  const isInternalNote = formData.get("is_internal_note") === "on";

  const supabase = await createClient();
  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, created_by, status")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return { error: "Ticket not found." };

  const { error } = await supabase.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    sender_id: gate.userId,
    sender_role: "admin",
    body,
    is_internal_note: isInternalNote,
  });
  if (error) return { error: error.message };

  // A first public reply on a still-open ticket quietly starts progress —
  // ordinary support-tool behavior. Still goes through the real state
  // machine (transitionTicket), not a bypass; if the ticket has already
  // moved on since this page loaded, this just no-ops rather than failing
  // the reply that already succeeded.
  if (!isInternalNote && ticket.status === "open") {
    try {
      await transitionTicket(supabase, {
        ticketId,
        from: "open",
        to: "in_progress",
        actor: "admin",
        changedByUser: gate.userId,
        note: "Auto: first admin reply",
      });
    } catch (e) {
      console.error("auto in_progress transition after reply failed:", e);
    }
  }

  if (!isInternalNote) {
    await notify(
      ticket.created_by,
      "support_ticket_reply",
      "New reply on your support ticket",
      body.slice(0, 200)
    );
  }

  revalidatePath(`/admin/support/${ticketId}`);
  return {};
}
