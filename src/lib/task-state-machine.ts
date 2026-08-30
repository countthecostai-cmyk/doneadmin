/**
 * Single source of truth for task lifecycle. Every badge, timeline, and
 * button-gate in the UI reads from this module — never re-derive the graph
 * inline. Mirrors the `task_status` enum and the ownership rules enforced
 * again (independently) by RLS/triggers in supabase/migrations/0002.
 *
 * RLS is the real security boundary (a user literally cannot write rows they
 * don't own). This module is what decides whether a *legal* write is being
 * attempted in the first place, and drives the UI.
 */

export type TaskStatus =
  | "requested"
  | "matching"
  | "quoted"
  | "accepted"
  | "scheduled"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "payout_pending"
  | "payout_completed"
  | "cancelled"
  | "declined"
  | "expired"
  | "disputed"
  | "refunded";

export type TaskActor = "requester" | "doer" | "admin" | "system";

/** Structurally valid moves, regardless of who initiates them. */
export const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  requested: ["matching", "cancelled"],
  matching: ["quoted", "accepted", "cancelled", "expired"],
  quoted: ["accepted", "declined", "cancelled", "expired"],
  accepted: ["scheduled", "en_route", "in_progress", "declined", "cancelled"],
  scheduled: ["en_route", "declined", "cancelled"],
  en_route: ["arrived", "cancelled"],
  arrived: ["in_progress", "cancelled"],
  in_progress: ["completed", "disputed", "cancelled"],
  completed: ["payout_pending", "disputed"],
  payout_pending: ["payout_completed", "disputed", "refunded"],
  payout_completed: [],
  cancelled: [],
  declined: ["matching"], // requeued to the open pool, doer_id cleared
  expired: ["matching"],
  disputed: ["payout_pending", "refunded", "cancelled"],
  refunded: [],
};

/** Which role(s) may *initiate* each transition. Admin bypasses this check
 *  (never the structural TRANSITIONS check above). */
export const TRANSITION_ACTORS: Record<string, TaskActor[]> = {
  "requested->matching": ["system"],
  "requested->cancelled": ["requester", "admin"],

  "matching->quoted": ["doer"],
  "matching->accepted": ["doer"],
  "matching->cancelled": ["requester", "admin"],
  "matching->expired": ["system"],

  "quoted->accepted": ["requester"],
  "quoted->declined": ["doer"],
  "quoted->cancelled": ["requester", "admin"],
  "quoted->expired": ["system"],

  "accepted->scheduled": ["doer", "requester"],
  "accepted->en_route": ["doer"],
  "accepted->in_progress": ["doer"],
  "accepted->declined": ["doer"],
  "accepted->cancelled": ["requester", "doer", "admin"],

  "scheduled->en_route": ["doer"],
  "scheduled->declined": ["doer"],
  "scheduled->cancelled": ["requester", "doer", "admin"],

  "en_route->arrived": ["doer"],
  "en_route->cancelled": ["requester", "doer", "admin"],

  "arrived->in_progress": ["doer"],
  "arrived->cancelled": ["requester", "doer", "admin"],

  "in_progress->completed": ["doer"],
  "in_progress->disputed": ["requester", "doer", "admin"],
  "in_progress->cancelled": ["requester", "doer", "admin"],

  "completed->payout_pending": ["requester"], // confirmTaskCompletion
  "completed->disputed": ["requester"], // reportCompletionProblem

  "payout_pending->payout_completed": ["system"],
  "payout_pending->disputed": ["admin"],
  "payout_pending->refunded": ["admin"],

  "declined->matching": ["system"],
  "expired->matching": ["system"],

  "disputed->payout_pending": ["admin"],
  "disputed->refunded": ["admin"],
  "disputed->cancelled": ["admin"],
};

export function isStructurallyValid(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function canActorTransition(
  from: TaskStatus,
  to: TaskStatus,
  actor: TaskActor
): boolean {
  if (!isStructurallyValid(from, to)) return false;
  if (actor === "admin") return true; // bypasses actor check, never structural
  const allowed = TRANSITION_ACTORS[`${from}->${to}`];
  return allowed?.includes(actor) ?? false;
}

export const TERMINAL_STATUSES: TaskStatus[] = [
  "payout_completed",
  "cancelled",
  "refunded",
];

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  requested: "Requested",
  matching: "Finding a Doer",
  quoted: "Quoted",
  accepted: "Accepted",
  scheduled: "Scheduled",
  en_route: "Doer en route",
  arrived: "Doer arrived",
  in_progress: "In progress",
  completed: "Completed — awaiting confirmation",
  payout_pending: "Payment processing",
  payout_completed: "Done",
  cancelled: "Cancelled",
  declined: "Declined",
  expired: "Expired",
  disputed: "Disputed",
  refunded: "Refunded",
};

export const ACTIVE_TASK_STATUSES: TaskStatus[] = [
  "requested",
  "matching",
  "quoted",
  "accepted",
  "scheduled",
  "en_route",
  "arrived",
  "in_progress",
  "completed",
  "payout_pending",
  // Every non-terminal status counts as "active" — including these three,
  // which are easy to forget because they're not on the happy path. A
  // disputed task in particular is NOT terminal (an admin still has to
  // resolve it via disputed->payout_pending/refunded/cancelled) and must
  // stay visible in every "active tasks" view — dashboards, job lists, and
  // especially the admin job monitor — rather than silently falling into
  // a "past tasks" bucket where nobody notices it needs attention.
  // declined/expired are normally momentary (the system requeues them to
  // "matching" immediately), but they're included on the same principle:
  // no non-terminal status should be able to fall out of every "active"
  // view just because nobody thought to list it here.
  "declined",
  "expired",
  "disputed",
];
