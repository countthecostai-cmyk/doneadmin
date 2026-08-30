/**
 * Single source of truth for the support-ticket lifecycle — same shape and
 * same reasoning as task-state-machine.ts, deliberately kept as a second,
 * separate module rather than reusing TaskStatus: a ticket's lifecycle is
 * shorter and its actor rules are different in one important way (a
 * non-admin, the ticket's own creator, gets exactly two self-service
 * moves — see TICKET_TRANSITION_ACTORS below), so folding it into the task
 * graph would either loosen the task graph's guarantees or force awkward
 * unused branches into it. Mirrors support_tickets_guard_update() in
 * supabase/migrations/0012_support_tickets.sql — change one, change the
 * other in the same commit.
 */

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type SupportTicketCategory =
  | "account"
  | "billing"
  | "task_issue"
  | "safety"
  | "bug"
  | "other";

/** Reuses the same actor vocabulary as tasks; "system" is unused here — no
 *  automated transition currently touches a ticket's status. */
export type SupportTicketActor = "requester" | "doer" | "admin" | "system";

export const TICKET_TRANSITIONS: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  open: ["in_progress", "resolved", "closed"],
  in_progress: ["open", "resolved", "closed"],
  resolved: ["open", "closed"],
  closed: ["open"],
};

/** Which role(s) may *initiate* each transition. Admin bypasses this check
 *  (never the structural TICKET_TRANSITIONS check above). "requester" and
 *  "doer" here mean specifically the ticket's own creator — enforced by
 *  RLS (created_by = auth.uid()) and the guard trigger, not by this map. */
export const TICKET_TRANSITION_ACTORS: Record<string, SupportTicketActor[]> = {
  "open->in_progress": ["admin"],
  "open->resolved": ["admin"],
  "open->closed": ["admin"],

  "in_progress->open": ["admin"],
  "in_progress->resolved": ["admin"],
  "in_progress->closed": ["admin"],

  // Self-service: the ticket's own creator confirming "yes, that fixed it"
  // or "no, reopen this" — the only two moves a non-admin ever initiates.
  "resolved->closed": ["admin", "requester", "doer"],
  "resolved->open": ["admin", "requester", "doer"],

  "closed->open": ["admin"],
};

export function isStructurallyValid(from: SupportTicketStatus, to: SupportTicketStatus): boolean {
  return TICKET_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canActorTransition(
  from: SupportTicketStatus,
  to: SupportTicketStatus,
  actor: SupportTicketActor
): boolean {
  if (!isStructurallyValid(from, to)) return false;
  if (actor === "admin") return true; // bypasses actor check, never structural
  const allowed = TICKET_TRANSITION_ACTORS[`${from}->${to}`];
  return allowed?.includes(actor) ?? false;
}

export const OPEN_TICKET_STATUSES: SupportTicketStatus[] = ["open", "in_progress"];

export function isOpenTicket(status: SupportTicketStatus): boolean {
  return OPEN_TICKET_STATUSES.includes(status);
}

export const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  account: "Account",
  billing: "Billing",
  task_issue: "Task issue",
  safety: "Safety concern",
  bug: "App bug",
  other: "Other",
};
