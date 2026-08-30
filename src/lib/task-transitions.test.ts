import { describe, it, expect, vi } from "vitest";
import {
  transitionTask,
  TransitionConflictError,
  IllegalTransitionError,
} from "./task-transitions";

/**
 * Minimal fake of the SupabaseClient surface transitionTask actually uses:
 * .from(table).update(patch).eq(a,b).eq(c,d).select().maybeSingle()
 * and .from("task_status_history").insert(row).
 * Each `.from()` call returns a fresh chainable so the two calls (update
 * the task, insert the history row) don't interfere with each other.
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
    if (table === "tasks") {
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          lastPatch = patch;
          opts.onUpdate?.(patch, eqCalls);
          return updateChain;
        }),
      };
    }
    if (table === "task_status_history") {
      return { insert };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { from, insert, updateChain, get lastPatch() { return lastPatch; }, eqCalls };
}

describe("transitionTask", () => {
  it("rejects an illegal move before ever touching the client", () => {
    const client = makeMockClient({ updateResult: { data: null, error: null } });

    return expect(
      transitionTask(client as never, {
        taskId: "t1",
        from: "requested",
        to: "in_progress",
        actor: "doer",
        changedByUser: "u1",
      })
    ).rejects.toBeInstanceOf(IllegalTransitionError).then(() => {
      expect(client.from).not.toHaveBeenCalled();
    });
  });

  it("performs an atomic conditional update: .eq('id', taskId).eq('status', from)", async () => {
    const client = makeMockClient({
      updateResult: { data: { id: "t1", status: "matching" }, error: null },
    });

    await transitionTask(client as never, {
      taskId: "t1",
      from: "requested",
      to: "matching",
      actor: "system",
      changedByUser: null,
    });

    expect(client.eqCalls).toEqual([
      ["id", "t1"],
      ["status", "requested"],
    ]);
    expect(client.lastPatch).toMatchObject({ status: "matching" });
  });

  it("merges extraPatch into the same atomic update", async () => {
    const client = makeMockClient({
      updateResult: { data: { id: "t1", status: "in_progress" }, error: null },
    });

    await transitionTask(client as never, {
      taskId: "t1",
      from: "arrived",
      to: "in_progress",
      actor: "doer",
      changedByUser: "doer-1",
      extraPatch: { started_at: "2026-08-30T00:00:00Z" },
    });

    expect(client.lastPatch).toEqual({
      status: "in_progress",
      started_at: "2026-08-30T00:00:00Z",
    });
  });

  it("throws TransitionConflictError when zero rows matched (someone else already moved it) instead of writing history", async () => {
    const client = makeMockClient({ updateResult: { data: null, error: null } });

    await expect(
      transitionTask(client as never, {
        taskId: "t1",
        from: "matching",
        to: "accepted",
        actor: "doer",
        changedByUser: "doer-1",
      })
    ).rejects.toBeInstanceOf(TransitionConflictError);

    expect(client.insert).not.toHaveBeenCalled();
  });

  it("propagates a hard database error from the update instead of swallowing it", async () => {
    const client = makeMockClient({
      updateResult: { data: null, error: new Error("connection reset") },
    });

    await expect(
      transitionTask(client as never, {
        taskId: "t1",
        from: "matching",
        to: "accepted",
        actor: "doer",
        changedByUser: "doer-1",
      })
    ).rejects.toThrow("connection reset");
  });

  it("writes a status-history row with the actor and note after a successful transition", async () => {
    const client = makeMockClient({
      updateResult: { data: { id: "t1", status: "en_route" }, error: null },
    });

    await transitionTask(client as never, {
      taskId: "t1",
      from: "accepted",
      to: "en_route",
      actor: "doer",
      changedByUser: "doer-1",
      note: "On my way",
    });

    expect(client.insert).toHaveBeenCalledWith({
      task_id: "t1",
      status: "en_route",
      note: "On my way",
      changed_by_actor: "doer",
      changed_by_user: "doer-1",
    });
  });

  it("a failed history-log insert does not undo or fail an already-committed transition", async () => {
    const client = makeMockClient({
      updateResult: { data: { id: "t1", status: "en_route" }, error: null },
      historyError: new Error("history insert failed"),
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await transitionTask(client as never, {
      taskId: "t1",
      from: "accepted",
      to: "en_route",
      actor: "doer",
      changedByUser: "doer-1",
    });

    expect(result).toEqual({ id: "t1", status: "en_route" });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("admin bypasses the actor check but a structurally illegal move is still rejected before touching the client", () => {
    const client = makeMockClient({ updateResult: { data: null, error: null } });

    return expect(
      transitionTask(client as never, {
        taskId: "t1",
        from: "payout_completed",
        to: "matching",
        actor: "admin",
        changedByUser: "admin-1",
      })
    ).rejects.toBeInstanceOf(IllegalTransitionError).then(() => {
      expect(client.from).not.toHaveBeenCalled();
    });
  });
});
