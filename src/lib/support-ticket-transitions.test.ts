import { describe, it, expect, vi } from "vitest";
import {
  transitionTicket,
  TicketTransitionConflictError,
  TicketIllegalTransitionError,
} from "./support-ticket-transitions";

/**
 * Minimal fake of the SupabaseClient surface transitionTicket actually
 * uses — same shape as task-transitions.test.ts's makeMockClient.
 */
function makeMockClient(opts: {
  updateResult: { data: unknown; error: unknown };
  historyError?: unknown;
  onUpdate?: (patch: Record<string, unknown>, eqCalls: [string, unknown][]) => void;
  onHistoryInsert?: (row: Record<string, unknown>) => void;
}) {
  const eqCalls: [string, unknown][] = [];
  let lastPatch: Record<string, unknown> = {};

  const updateChain = {
    eq(field: string, value: unknown) {
      eqCalls.push([field, value]);
      return updateChain;
    },
    select() {
      return updateChain;
    },
    maybeSingle: vi.fn(async () => opts.updateResult),
  };

  const insert = vi.fn(async (row: Record<string, unknown>) => {
    opts.onHistoryInsert?.(row);
    return { error: opts.historyError ?? null };
  });

  const from = vi.fn((table: string) => {
    if (table === "support_tickets") {
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          lastPatch = patch;
          opts.onUpdate?.(patch, eqCalls);
          return updateChain;
        }),
      };
    }
    if (table === "support_ticket_status_history") {
      return { insert };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { from, insert, updateChain, get lastPatch() { return lastPatch; }, eqCalls };
}

describe("transitionTicket", () => {
  it("rejects an illegal move before ever touching the client", () => {
    const client = makeMockClient({ updateResult: { data: null, error: null } });

    return expect(
      transitionTicket(client as never, {
        ticketId: "tk1",
        from: "open",
        to: "resolved",
        actor: "requester",
        changedByUser: "u1",
      })
    ).rejects.toBeInstanceOf(TicketIllegalTransitionError).then(() => {
      expect(client.from).not.toHaveBeenCalled();
    });
  });

  it("performs an atomic conditional update: .eq('id', ticketId).eq('status', from)", async () => {
    const client = makeMockClient({
      updateResult: { data: { id: "tk1", status: "in_progress" }, error: null },
    });

    await transitionTicket(client as never, {
      ticketId: "tk1",
      from: "open",
      to: "in_progress",
      actor: "admin",
      changedByUser: "admin-1",
    });

    expect(client.eqCalls).toEqual([
      ["id", "tk1"],
      ["status", "open"],
    ]);
    expect(client.lastPatch).toMatchObject({ status: "in_progress" });
  });

  it("stamps resolved_at when transitioning to resolved, and clears it on reopen", async () => {
    const resolvedClient = makeMockClient({
      updateResult: { data: { id: "tk1", status: "resolved" }, error: null },
    });
    await transitionTicket(resolvedClient as never, {
      ticketId: "tk1",
      from: "in_progress",
      to: "resolved",
      actor: "admin",
      changedByUser: "admin-1",
    });
    expect(resolvedClient.lastPatch.status).toBe("resolved");
    expect(typeof resolvedClient.lastPatch.resolved_at).toBe("string");

    const reopenClient = makeMockClient({
      updateResult: { data: { id: "tk1", status: "open" }, error: null },
    });
    await transitionTicket(reopenClient as never, {
      ticketId: "tk1",
      from: "resolved",
      to: "open",
      actor: "requester",
      changedByUser: "u1",
    });
    expect(reopenClient.lastPatch.status).toBe("open");
    expect(reopenClient.lastPatch.resolved_at).toBeNull();
  });

  it("does not stamp resolved_at for a move to closed", async () => {
    const client = makeMockClient({
      updateResult: { data: { id: "tk1", status: "closed" }, error: null },
    });
    await transitionTicket(client as never, {
      ticketId: "tk1",
      from: "resolved",
      to: "closed",
      actor: "doer",
      changedByUser: "u2",
    });
    expect(client.lastPatch).toEqual({ status: "closed" });
  });

  it("throws TicketTransitionConflictError when zero rows matched, and skips the history insert", async () => {
    const client = makeMockClient({ updateResult: { data: null, error: null } });

    await expect(
      transitionTicket(client as never, {
        ticketId: "tk1",
        from: "open",
        to: "in_progress",
        actor: "admin",
        changedByUser: "admin-1",
      })
    ).rejects.toBeInstanceOf(TicketTransitionConflictError);

    expect(client.insert).not.toHaveBeenCalled();
  });

  it("propagates a hard database error from the update instead of swallowing it", async () => {
    const client = makeMockClient({
      updateResult: { data: null, error: new Error("connection reset") },
    });

    await expect(
      transitionTicket(client as never, {
        ticketId: "tk1",
        from: "open",
        to: "in_progress",
        actor: "admin",
        changedByUser: "admin-1",
      })
    ).rejects.toThrow("connection reset");
  });

  it("writes a status-history row with the actor and note after a successful transition", async () => {
    const client = makeMockClient({
      updateResult: { data: { id: "tk1", status: "in_progress" }, error: null },
    });

    await transitionTicket(client as never, {
      ticketId: "tk1",
      from: "open",
      to: "in_progress",
      actor: "admin",
      changedByUser: "admin-1",
      note: "Looking into it",
    });

    expect(client.insert).toHaveBeenCalledWith({
      ticket_id: "tk1",
      status: "in_progress",
      note: "Looking into it",
      changed_by_actor: "admin",
      changed_by_user: "admin-1",
    });
  });

  it("a failed history-log insert does not undo or fail an already-committed transition", async () => {
    const client = makeMockClient({
      updateResult: { data: { id: "tk1", status: "in_progress" }, error: null },
      historyError: new Error("history insert failed"),
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await transitionTicket(client as never, {
      ticketId: "tk1",
      from: "open",
      to: "in_progress",
      actor: "admin",
      changedByUser: "admin-1",
    });

    expect(result).toEqual({ id: "tk1", status: "in_progress" });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
