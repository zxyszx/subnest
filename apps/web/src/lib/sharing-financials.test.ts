import { describe, expect, it } from "vitest";

import { assertDateOnly } from "@/lib/time/date-only";
import { sharingUpcomingRenewalCount, sharingUpcomingSeatRenewals } from "@/lib/sharing-financials";
import type { SharingAccountDetail } from "@renewlet/shared/schemas/sharing";

describe("sharingUpcomingRenewalCount", () => {
  it("counts renewals from today through the next seven days", () => {
    const accounts = [
      { nextBillingDate: assertDateOnly("2026-09-23") },
      { nextBillingDate: assertDateOnly("2026-09-24") },
      { nextBillingDate: assertDateOnly("2026-10-01") },
      { nextBillingDate: assertDateOnly("2026-10-02") },
    ];

    expect(sharingUpcomingRenewalCount(accounts, assertDateOnly("2026-09-24"))).toBe(2);
  });
});

describe("sharingUpcomingSeatRenewals", () => {
  it("returns assigned seats in the next seven days ordered by urgency", () => {
    const detail = {
      account: { id: "account-1", accountNumber: 1 },
      seats: [
        { id: "seat-7", seatNumber: 2, memberName: "Seven", expiresAt: "2026-10-01", status: "active" },
        { id: "seat-vacant", seatNumber: 3, memberName: null, expiresAt: null, status: "vacant" },
        { id: "seat-today", seatNumber: 1, memberName: "Today", expiresAt: "2026-09-24", status: "active" },
        { id: "seat-later", seatNumber: 4, memberName: "Later", expiresAt: "2026-10-02", status: "active" },
      ],
    } as SharingAccountDetail;

    expect(sharingUpcomingSeatRenewals([detail], assertDateOnly("2026-09-24"))).toMatchObject([
      { seat: { id: "seat-today" }, daysUntilExpiry: 0 },
      { seat: { id: "seat-7" }, daysUntilExpiry: 7 },
    ]);
  });
});
