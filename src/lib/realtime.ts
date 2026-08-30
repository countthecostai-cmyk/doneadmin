/**
 * Shared Supabase Realtime subscription helpers, used identically across
 * Done (customer), Doer (worker), and Done Admin. All three apps read the
 * same Postgres tables via `postgres_changes` on the `supabase_realtime`
 * publication (enabled in 0006_messaging_tips_availability_moderation.sql
 * for: tasks, task_status_history, messages, notifications, payouts,
 * payments) — there is no separate realtime backend to keep in sync, the
 * broadcast IS the single shared database.
 *
 * These helpers only subscribe to change *events* and call back into
 * caller-owned state (React state, a re-fetch, etc.) — they never own data,
 * so there's no risk of a realtime-only cache disagreeing with the RLS-
 * filtered source of truth a page loads on mount.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export type ChangeHandler<T = Record<string, unknown>> = (payload: {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T | null;
  old: Partial<T> | null;
}) => void;

/**
 * Subscribe to all changes on one table, optionally filtered
 * (e.g. `requester_id=eq.<uuid>` or `task_id=eq.<uuid>`). Returns an
 * unsubscribe function — always call it in a `useEffect` cleanup / on
 * unmount, Supabase channels are not automatically garbage collected.
 */
export function subscribeToTable<T = Record<string, unknown>>(
  client: AnyClient,
  opts: {
    table: string;
    filter?: string;
    channelName?: string;
    onChange: ChangeHandler<T>;
  }
): () => void {
  const channel = client
    .channel(opts.channelName ?? `${opts.table}:${opts.filter ?? "all"}:${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: opts.table,
        ...(opts.filter ? { filter: opts.filter } : {}),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        opts.onChange({
          eventType: payload.eventType,
          new: payload.new ?? null,
          old: payload.old ?? null,
        });
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

/** A single task's row + status-history stream — the task detail page in all 3 apps. */
export function subscribeToTask<T = Record<string, unknown>>(
  client: AnyClient,
  taskId: string,
  onChange: ChangeHandler<T>
): () => void {
  return subscribeToTable(client, {
    table: "tasks",
    filter: `id=eq.${taskId}`,
    channelName: `task:${taskId}`,
    onChange,
  });
}

/** Every task belonging to a Requester — the Done (customer) dashboard/history list. */
export function subscribeToRequesterTasks<T = Record<string, unknown>>(
  client: AnyClient,
  requesterId: string,
  onChange: ChangeHandler<T>
): () => void {
  return subscribeToTable(client, {
    table: "tasks",
    filter: `requester_id=eq.${requesterId}`,
    channelName: `requester-tasks:${requesterId}`,
    onChange,
  });
}

/** Every task assigned to a Doer — the Doer app's active-job view. */
export function subscribeToDoerTasks<T = Record<string, unknown>>(
  client: AnyClient,
  doerId: string,
  onChange: ChangeHandler<T>
): () => void {
  return subscribeToTable(client, {
    table: "tasks",
    filter: `doer_id=eq.${doerId}`,
    channelName: `doer-tasks:${doerId}`,
    onChange,
  });
}

/**
 * The open job pool — Doer app's "available jobs" list. Deliberately
 * unfiltered on the server side (RLS already restricts this to
 * `status = 'matching' and doer_id is null` for approved, non-suspended
 * doers only, per 0006) — a Postgres `filter` string can't express that
 * compound condition, so callers should still coarse-filter the payload's
 * `new.status` client-side for UI purposes only, never as a security
 * boundary (RLS already is one).
 */
export function subscribeToOpenPool<T = Record<string, unknown>>(
  client: AnyClient,
  onChange: ChangeHandler<T>
): () => void {
  return subscribeToTable(client, {
    table: "tasks",
    channelName: "open-pool",
    onChange,
  });
}

/** Messages for one task — the in-task chat thread in Done + Doer (+ read-only in Admin). */
export function subscribeToTaskMessages<T = Record<string, unknown>>(
  client: AnyClient,
  taskId: string,
  onChange: ChangeHandler<T>
): () => void {
  return subscribeToTable(client, {
    table: "messages",
    filter: `task_id=eq.${taskId}`,
    channelName: `messages:${taskId}`,
    onChange,
  });
}

/** A user's own notification feed — bell icon in all 3 apps. */
export function subscribeToNotifications<T = Record<string, unknown>>(
  client: AnyClient,
  userId: string,
  onChange: ChangeHandler<T>
): () => void {
  return subscribeToTable(client, {
    table: "notifications",
    filter: `user_id=eq.${userId}`,
    channelName: `notifications:${userId}`,
    onChange,
  });
}

/** A user's own support tickets list — the Support inbox in Done + Doer. */
export function subscribeToMySupportTickets<T = Record<string, unknown>>(
  client: AnyClient,
  userId: string,
  onChange: ChangeHandler<T>
): () => void {
  return subscribeToTable(client, {
    table: "support_tickets",
    filter: `created_by=eq.${userId}`,
    channelName: `support-tickets:${userId}`,
    onChange,
  });
}

/** One support ticket's row (status/assignment) — the ticket detail page. */
export function subscribeToSupportTicket<T = Record<string, unknown>>(
  client: AnyClient,
  ticketId: string,
  onChange: ChangeHandler<T>
): () => void {
  return subscribeToTable(client, {
    table: "support_tickets",
    filter: `id=eq.${ticketId}`,
    channelName: `support-ticket:${ticketId}`,
    onChange,
  });
}

/** One support ticket's message thread — the ticket detail page in all 3 apps. */
export function subscribeToSupportTicketMessages<T = Record<string, unknown>>(
  client: AnyClient,
  ticketId: string,
  onChange: ChangeHandler<T>
): () => void {
  return subscribeToTable(client, {
    table: "support_ticket_messages",
    filter: `ticket_id=eq.${ticketId}`,
    channelName: `support-ticket-messages:${ticketId}`,
    onChange,
  });
}

/** Admin: every support ticket's live changes, unfiltered — the support queue. RLS already scopes this to admins only. */
export function subscribeToAllSupportTickets<T = Record<string, unknown>>(
  client: AnyClient,
  onChange: ChangeHandler<T>
): () => void {
  return subscribeToTable(client, { table: "support_tickets", channelName: "admin-all-support-tickets", onChange });
}

/** Admin: every task's live changes, unfiltered — the live-jobs monitor. RLS already scopes this to admins only. */
export function subscribeToAllTasks<T = Record<string, unknown>>(
  client: AnyClient,
  onChange: ChangeHandler<T>
): () => void {
  return subscribeToTable(client, { table: "tasks", channelName: "admin-all-tasks", onChange });
}

/** Admin: payments + payouts streams for the live revenue/transactions dashboard. */
export function subscribeToPayments<T = Record<string, unknown>>(
  client: AnyClient,
  onChange: ChangeHandler<T>
): () => void {
  return subscribeToTable(client, { table: "payments", channelName: "admin-payments", onChange });
}

export function subscribeToPayouts<T = Record<string, unknown>>(
  client: AnyClient,
  onChange: ChangeHandler<T>
): () => void {
  return subscribeToTable(client, { table: "payouts", channelName: "admin-payouts", onChange });
}
