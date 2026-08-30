import { describe, it, expect, vi } from "vitest";
import { logAdminAction } from "./audit-log";

/**
 * Minimal fake of the SupabaseClient surface logAdminAction uses:
 * .from("admin_audit_log").insert(row).
 */
function makeMockClient(insertResult: { error: unknown }) {
  const insert = vi.fn(async () => insertResult);
  const from = vi.fn((table: string) => {
    if (table !== "admin_audit_log") throw new Error(`unexpected table: ${table}`);
    return { insert };
  });
  return { from, insert };
}

describe("logAdminAction", () => {
  it("inserts a row shaped exactly like the admin_audit_log schema", async () => {
    const client = makeMockClient({ error: null });

    await logAdminAction(client as never, "admin-1", "user_suspended", "profile", "user-9", {
      reason: "spam",
    });

    expect(client.insert).toHaveBeenCalledWith({
      admin_id: "admin-1",
      action: "user_suspended",
      target_type: "profile",
      target_id: "user-9",
      detail: { reason: "spam" },
    });
  });

  it("defaults detail to {} when omitted", async () => {
    const client = makeMockClient({ error: null });

    await logAdminAction(client as never, "admin-1", "task_force_transition", "task", "task-1");

    expect(client.insert).toHaveBeenCalledWith(
      expect.objectContaining({ detail: {} })
    );
  });

  it("allows a null target_id (actions with no single target row, e.g. category creation)", async () => {
    const client = makeMockClient({ error: null });

    await logAdminAction(client as never, "admin-1", "category_created", "category", null, {
      slug: "yard-work",
    });

    expect(client.insert).toHaveBeenCalledWith(
      expect.objectContaining({ target_id: null })
    );
  });

  it("logs and swallows an insert failure instead of throwing — the admin action it accompanies already committed", async () => {
    const client = makeMockClient({ error: new Error("insert failed") });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      logAdminAction(client as never, "admin-1", "user_suspended", "profile", "user-9")
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
