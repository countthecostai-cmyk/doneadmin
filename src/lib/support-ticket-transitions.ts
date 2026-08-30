import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportTicketActor, SupportTicketStatus } from "@/lib/support-ticket-state-machine";
import { canActorTransition } from "@/lib/support-ticket-state-machine";

export class TicketTransitionConflictError extends Error {
  constructor(ticketId: string, expected: SupportTicketStatus) {
    super(
      `Ticket ${ticketId} was not in status "${expected}" — someone else already moved it. Refresh and try again.`
    );
    this.name = "TicketTransitionConflictError";
  }
}

export class TicketIllegalTransitionError extends Error {
  constructor(from: SupportTicketStatus, to: SupportTicketStatus, actor: SupportTicketActor) {
    super(`${actor} may not move a ticket from "${from}" to "${to}".`);
    this.name = "TicketIllegalTransitionError";
  }
}

/**
 * The one place every ticket status-changing write goes through — same
 * shape as transitionTask() in task-transitions.ts: validates the move
 * against the state machine, performs an ATOMIC conditional update
 * (.eq('status', expectedCurrent)) so two concurrent requests (e.g. an
 * admin resolving while the creator is simultaneously trying to reopen)
 * can never both succeed, and appends a status-history row.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function transitionTicket<T extends Record<string, any>>(
  client: SupabaseClient,
  opts: {
    ticketId: string;
    from: SupportTicketStatus;
    to: SupportTicketStatus;
    actor: SupportTicketActor;
    changedByUser: string | null;
    note?: string;
    extraPatch?: T;
  }
) {
  const { ticketId, from, to, actor, changedByUser, note, extraPatch } = opts;

  if (!canActorTransition(from, to, actor)) {
    throw new TicketIllegalTransitionError(from, to, actor);
  }

  const patch: Record<string, unknown> = { status: to, ...(extraPatch ?? {}) };
  // Track when a ticket became resolved / clear it on reopen, without
  // making every caller remember to pass it explicitly.
  if (to === "resolved") patch.resolved_at = new Date().toISOString();
  if (to === "open") patch.resolved_at = null;

  const { data, error } = await client
    .from("support_tickets")
    .update(patch)
    .eq("id", ticketId)
    .eq("status", from)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new TicketTransitionConflictError(ticketId, from);

  const { error: historyError } = await client.from("support_ticket_status_history").insert({
    ticket_id: ticketId,
    status: to,
    note: note ?? null,
    changed_by_actor: actor,
    changed_by_user: changedByUser,
  });
  if (historyError) {
    // The transition itself already committed — log and continue rather
    // than throwing away a successful state change over an audit-log write.
    console.error("ticket status history insert failed:", historyError.message);
  }

  return data;
}
