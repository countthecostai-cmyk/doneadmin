import { describe, it, expect } from "vitest";
import {
  TRANSITIONS,
  TRANSITION_ACTORS,
  TERMINAL_STATUSES,
  STATUS_LABELS,
  ACTIVE_TASK_STATUSES,
  PROMO_LOCKED_STATUSES,
  isStructurallyValid,
  canActorTransition,
  isTerminal,
  type TaskStatus,
  type TaskActor,
} from "./task-state-machine";

const ALL_STATUSES = Object.keys(TRANSITIONS) as TaskStatus[];
const ALL_ACTORS: TaskActor[] = ["requester", "doer", "admin", "system"];

describe("isStructurallyValid", () => {
  it("allows every edge literally declared in TRANSITIONS", () => {
    for (const from of ALL_STATUSES) {
      for (const to of TRANSITIONS[from]) {
        expect(isStructurallyValid(from, to)).toBe(true);
      }
    }
  });

  it("rejects a same-status no-op transition unless explicitly declared", () => {
    for (const status of ALL_STATUSES) {
      expect(isStructurallyValid(status, status)).toBe(TRANSITIONS[status].includes(status));
    }
  });

  it("rejects skipping straight from requested to completed", () => {
    expect(isStructurallyValid("requested", "completed")).toBe(false);
  });

  it("rejects moving out of a terminal status", () => {
    for (const terminal of TERMINAL_STATUSES) {
      for (const to of ALL_STATUSES) {
        expect(isStructurallyValid(terminal, to)).toBe(false);
      }
    }
  });
});

describe("TRANSITIONS / TRANSITION_ACTORS consistency", () => {
  // Regression guard for exactly the failure mode the architecture doc warns
  // about: two enforcement layers (structural graph + actor map) silently
  // drifting apart until one becomes dead code that looks like protection
  // but isn't.

  it("every TRANSITION_ACTORS entry refers to a structurally valid edge", () => {
    for (const key of Object.keys(TRANSITION_ACTORS)) {
      const [from, to] = key.split("->") as [TaskStatus, TaskStatus];
      expect(
        isStructurallyValid(from, to),
        `TRANSITION_ACTORS has "${key}" but TRANSITIONS does not allow ${from} -> ${to}`
      ).toBe(true);
    }
  });

  it("every non-admin-only structurally valid edge has an actor entry", () => {
    // If a real (non-system-only) edge exists in TRANSITIONS with no actor
    // entry, canActorTransition silently denies it for every non-admin actor
    // — a transition nobody but admin could ever perform, which usually
    // means a missing map entry rather than an intentional admin-only move.
    for (const from of ALL_STATUSES) {
      for (const to of TRANSITIONS[from]) {
        const key = `${from}->${to}`;
        expect(
          TRANSITION_ACTORS[key],
          `TRANSITIONS allows ${key} but TRANSITION_ACTORS has no entry for it`
        ).toBeDefined();
      }
    }
  });

  it("every TaskStatus appears as a key in TRANSITIONS (no orphaned status)", () => {
    // ALL_STATUSES is derived from TRANSITIONS' own keys, so this really
    // checks that STATUS_LABELS and TERMINAL_STATUSES don't reference a
    // status TRANSITIONS forgot to declare (which would silently type-check
    // as `[]` via optional chaining in isStructurallyValid and hide a bug).
    for (const status of Object.keys(STATUS_LABELS)) {
      expect(ALL_STATUSES).toContain(status);
    }
  });

  it("every terminal status has zero outgoing transitions", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(TRANSITIONS[status]).toEqual([]);
    }
  });

  it("every non-terminal status has at least one outgoing transition", () => {
    for (const status of ALL_STATUSES) {
      if (!TERMINAL_STATUSES.includes(status)) {
        expect(
          TRANSITIONS[status].length,
          `${status} is not terminal but has no outgoing transitions`
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("canActorTransition", () => {
  it("admin bypasses the actor check but never the structural one", () => {
    // Legal structurally, no actor listed for admin explicitly -> still allowed.
    expect(canActorTransition("payout_pending", "disputed", "admin")).toBe(true);
    // Illegal structurally -> admin still can't do it.
    expect(canActorTransition("payout_completed", "matching", "admin")).toBe(false);
    expect(canActorTransition("requested", "payout_completed", "admin")).toBe(false);
  });

  it("only the doer can mark in_progress -> completed", () => {
    expect(canActorTransition("in_progress", "completed", "doer")).toBe(true);
    expect(canActorTransition("in_progress", "completed", "requester")).toBe(false);
    expect(canActorTransition("in_progress", "completed", "system")).toBe(false);
  });

  it("only the requester can confirm completed -> payout_pending (the payout trust gate)", () => {
    expect(canActorTransition("completed", "payout_pending", "requester")).toBe(true);
    expect(canActorTransition("completed", "payout_pending", "doer")).toBe(false);
    expect(canActorTransition("completed", "payout_pending", "system")).toBe(false);
  });

  it("only the requester can report a completion problem into disputed", () => {
    expect(canActorTransition("completed", "disputed", "requester")).toBe(true);
    expect(canActorTransition("completed", "disputed", "doer")).toBe(false);
  });

  it("only the system can finalize payout_pending -> payout_completed", () => {
    expect(canActorTransition("payout_pending", "payout_completed", "system")).toBe(true);
    for (const actor of ["requester", "doer", "admin"] as TaskActor[]) {
      // admin bypasses the actor check entirely, so it's still allowed for admin
      if (actor === "admin") continue;
      expect(canActorTransition("payout_pending", "payout_completed", actor)).toBe(false);
    }
  });

  it("rejects any actor on a structurally illegal move", () => {
    for (const actor of ALL_ACTORS) {
      expect(canActorTransition("requested", "in_progress", actor)).toBe(false);
    }
  });

  it("declined and expired requeue to matching only via system", () => {
    expect(canActorTransition("declined", "matching", "system")).toBe(true);
    expect(canActorTransition("expired", "matching", "system")).toBe(true);
    expect(canActorTransition("declined", "matching", "doer")).toBe(false);
  });
});

describe("isTerminal", () => {
  it("flags exactly the declared terminal statuses", () => {
    for (const status of ALL_STATUSES) {
      expect(isTerminal(status)).toBe(TERMINAL_STATUSES.includes(status));
    }
  });
});

describe("ACTIVE_TASK_STATUSES", () => {
  it("excludes every terminal status", () => {
    for (const status of ACTIVE_TASK_STATUSES) {
      expect(TERMINAL_STATUSES).not.toContain(status);
    }
  });

  it("together with TERMINAL_STATUSES covers every declared status exactly once", () => {
    const combined = [...ACTIVE_TASK_STATUSES, ...TERMINAL_STATUSES].sort();
    expect(combined).toEqual([...ALL_STATUSES].sort());
  });
});

describe("PROMO_LOCKED_STATUSES", () => {
  it("includes every terminal status — a promo code can never be touched after a task ends", () => {
    for (const status of TERMINAL_STATUSES) {
      expect(PROMO_LOCKED_STATUSES).toContain(status);
    }
  });

  it("leaves every pre-payment status open to applying/removing a code", () => {
    const openStatuses: TaskStatus[] = [
      "requested",
      "matching",
      "quoted",
      "accepted",
      "scheduled",
      "en_route",
      "arrived",
      "in_progress",
      "completed",
    ];
    for (const status of openStatuses) {
      expect(PROMO_LOCKED_STATUSES).not.toContain(status);
    }
  });

  it("locks the moment payout starts, and for disputed/declined/expired", () => {
    expect(PROMO_LOCKED_STATUSES).toEqual(
      expect.arrayContaining(["payout_pending", "disputed", "declined", "expired"])
    );
  });
});
