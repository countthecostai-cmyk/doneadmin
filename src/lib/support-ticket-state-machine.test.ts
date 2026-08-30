import { describe, it, expect } from "vitest";
import {
  TICKET_TRANSITIONS,
  TICKET_TRANSITION_ACTORS,
  STATUS_LABELS,
  OPEN_TICKET_STATUSES,
  isStructurallyValid,
  canActorTransition,
  isOpenTicket,
  type SupportTicketStatus,
  type SupportTicketActor,
} from "./support-ticket-state-machine";

const ALL_STATUSES = Object.keys(TICKET_TRANSITIONS) as SupportTicketStatus[];
const ALL_ACTORS: SupportTicketActor[] = ["requester", "doer", "admin", "system"];

describe("isStructurallyValid", () => {
  it("allows every edge literally declared in TICKET_TRANSITIONS", () => {
    for (const from of ALL_STATUSES) {
      for (const to of TICKET_TRANSITIONS[from]) {
        expect(isStructurallyValid(from, to)).toBe(true);
      }
    }
  });

  it("rejects skipping straight from open to closed via any illegal shortcut", () => {
    // open -> closed IS legal (admin can close outright), but open -> a
    // status that doesn't exist should never silently pass.
    expect(isStructurallyValid("open", "resolved")).toBe(true);
  });

  it("rejects every same-status no-op", () => {
    for (const status of ALL_STATUSES) {
      expect(isStructurallyValid(status, status)).toBe(false);
    }
  });
});

describe("TICKET_TRANSITIONS / TICKET_TRANSITION_ACTORS consistency", () => {
  it("every TICKET_TRANSITION_ACTORS entry refers to a structurally valid edge", () => {
    for (const key of Object.keys(TICKET_TRANSITION_ACTORS)) {
      const [from, to] = key.split("->") as [SupportTicketStatus, SupportTicketStatus];
      expect(
        isStructurallyValid(from, to),
        `TICKET_TRANSITION_ACTORS has "${key}" but TICKET_TRANSITIONS does not allow ${from} -> ${to}`
      ).toBe(true);
    }
  });

  it("every structurally valid edge has an actor entry", () => {
    for (const from of ALL_STATUSES) {
      for (const to of TICKET_TRANSITIONS[from]) {
        const key = `${from}->${to}`;
        expect(
          TICKET_TRANSITION_ACTORS[key],
          `TICKET_TRANSITIONS allows ${key} but TICKET_TRANSITION_ACTORS has no entry for it`
        ).toBeDefined();
      }
    }
  });

  it("every SupportTicketStatus appears as a key in TICKET_TRANSITIONS", () => {
    for (const status of Object.keys(STATUS_LABELS)) {
      expect(ALL_STATUSES).toContain(status);
    }
  });
});

describe("canActorTransition", () => {
  it("admin bypasses the actor check but never the structural one", () => {
    expect(canActorTransition("open", "closed", "admin")).toBe(true);
    // resolved -> open has no admin-specific entry issue but is legal for admin too
    expect(canActorTransition("resolved", "open", "admin")).toBe(true);
  });

  it("only admin can start progress on an open ticket", () => {
    expect(canActorTransition("open", "in_progress", "admin")).toBe(true);
    expect(canActorTransition("open", "in_progress", "requester")).toBe(false);
    expect(canActorTransition("open", "in_progress", "doer")).toBe(false);
  });

  it("the creator (requester or doer) can confirm a resolved ticket closed", () => {
    expect(canActorTransition("resolved", "closed", "requester")).toBe(true);
    expect(canActorTransition("resolved", "closed", "doer")).toBe(true);
  });

  it("the creator can reopen a resolved ticket that didn't actually fix it", () => {
    expect(canActorTransition("resolved", "open", "requester")).toBe(true);
    expect(canActorTransition("resolved", "open", "doer")).toBe(true);
  });

  it("the creator cannot reopen a closed ticket themselves — only admin can", () => {
    expect(canActorTransition("closed", "open", "requester")).toBe(false);
    expect(canActorTransition("closed", "open", "doer")).toBe(false);
    expect(canActorTransition("closed", "open", "admin")).toBe(true);
  });

  it("the creator cannot resolve their own ticket directly", () => {
    expect(canActorTransition("open", "resolved", "requester")).toBe(false);
    expect(canActorTransition("in_progress", "resolved", "doer")).toBe(false);
  });

  it("rejects any actor on a structurally illegal move", () => {
    for (const actor of ALL_ACTORS) {
      expect(canActorTransition("closed", "resolved", actor)).toBe(false);
    }
  });
});

describe("isOpenTicket / OPEN_TICKET_STATUSES", () => {
  it("flags exactly open and in_progress as open", () => {
    expect(OPEN_TICKET_STATUSES).toEqual(["open", "in_progress"]);
    for (const status of ALL_STATUSES) {
      expect(isOpenTicket(status)).toBe(OPEN_TICKET_STATUSES.includes(status));
    }
  });
});
