import { describe, expect, it } from "vitest";
import type { SharingSeat } from "@renewlet/shared/schemas/sharing";
import { sharingAccountHasVacancy, sharingSeatDisplayState, sharingSeatLinkEligible } from "./sharing-seat-state";

const seat = (status: SharingSeat["status"], expiresAt: string | null, memberName: string | null = "Alice") => ({ status, expiresAt, memberName });

describe("sharing seat state", () => {
  it("keeps a scheduled-stop seat link usable through its expiry date", () => {
    expect(sharingSeatLinkEligible(seat("paused", "2026-10-21"), "2026-10-13")).toBe(true);
    expect(sharingSeatLinkEligible(seat("paused", "2026-10-13"), "2026-10-13")).toBe(true);
    expect(sharingSeatLinkEligible(seat("paused", "2026-10-12"), "2026-10-13")).toBe(false);
  });

  it("derives the four states shown in the account list", () => {
    expect(sharingSeatDisplayState(seat("active", "2026-10-21"), "2026-10-13")).toBe("active");
    expect(sharingSeatDisplayState(seat("active", "2026-10-12"), "2026-10-13")).toBe("expired");
    expect(sharingSeatDisplayState(seat("paused", "2026-10-21"), "2026-10-13")).toBe("paused");
    expect(sharingSeatDisplayState(seat("vacant", null, null), "2026-10-13")).toBe("vacant");
  });

  it("treats expired, stopped, and vacant seats as vacancy candidates", () => {
    expect(sharingAccountHasVacancy([seat("active", "2026-10-21")], "2026-10-13")).toBe(false);
    expect(sharingAccountHasVacancy([seat("active", "2026-10-21"), seat("paused", "2026-10-30")], "2026-10-13")).toBe(true);
  });
});
