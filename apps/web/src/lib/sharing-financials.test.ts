import { describe, expect, it } from "vitest";

import { assertDateOnly } from "@/lib/time/date-only";
import { sharingSubscriptionExpiryDays, sharingNearestSeatExpiry, sharingUpcomingRenewalCount, sharingUpcomingSeatRenewals, sortSharingAccountsByNearestSeatExpiry } from "@/lib/sharing-financials";
import type { SharingAccount, SharingAccountDetail } from "@renewlet/shared/schemas/sharing";

describe("subscription expiry is independent of seat expiry", () => {
  const account = { nextBillingDate: "2026-10-03", subscription: { status: "active", billingCycle: "yearly" } } as SharingAccount;
  it("shows an expired account even without assigned seats", () => {
    expect(sharingSubscriptionExpiryDays(account, assertDateOnly("2026-10-04"))).toBe(-1);
  });
  it("does not call canceled or buyout subscriptions expired", () => {
    expect(sharingSubscriptionExpiryDays({ ...account, subscription: { ...account.subscription, status: "cancelled" } }, assertDateOnly("2026-10-04"))).toBeNull();
    expect(sharingSubscriptionExpiryDays({ ...account, subscription: { ...account.subscription, billingCycle: "one-time", oneTimeTermCount: null } }, assertDateOnly("2026-10-04"))).toBeNull();
  });
});

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

  it("excludes paused seats from the seven-day renewal workload", () => {
    const detail = {
      account: { id: "account-1", accountNumber: 1 },
      seats: [{ id: "seat-paused", seatNumber: 1, memberName: "Paused", expiresAt: "2026-09-27", status: "paused" }],
    } as SharingAccountDetail;

    expect(sharingUpcomingSeatRenewals([detail], assertDateOnly("2026-09-24"), 7)).toEqual([]);
  });

  it("can include overdue seats for dashboard follow-up", () => {
    const detail = {
      account: { id: "account-1", accountNumber: 1 },
      seats: [
        { id: "seat-overdue", seatNumber: 1, memberName: "Overdue", expiresAt: "2026-09-22", status: "active" },
        { id: "seat-upcoming", seatNumber: 2, memberName: "Upcoming", expiresAt: "2026-09-25", status: "active" },
      ],
    } as SharingAccountDetail;

    expect(sharingUpcomingSeatRenewals([detail], assertDateOnly("2026-09-24"), 7, true)).toMatchObject([
      { seat: { id: "seat-overdue" }, daysUntilExpiry: -2 },
      { seat: { id: "seat-upcoming" }, daysUntilExpiry: 1 },
    ]);
  });
});

describe("sharingNearestSeatExpiry", () => {
  it("finds the earliest assigned seat and counts members sharing that date", () => {
    const detail = {
      seats: [
        { seatNumber: 3, memberName: "Later", expiresAt: "2026-10-02", status: "active" },
        { seatNumber: 1, memberName: "First", expiresAt: "2026-10-01", status: "active" },
        { seatNumber: 2, memberName: "Second", expiresAt: "2026-10-01", status: "paused" },
        { seatNumber: 4, memberName: null, expiresAt: "2026-09-25", status: "vacant" },
      ],
    } as SharingAccountDetail;

    expect(sharingNearestSeatExpiry(detail, assertDateOnly("2026-09-24"))).toEqual({
      expiresAt: "2026-10-01",
      daysUntilExpiry: 7,
      memberCount: 2,
    });
  });
});

describe("sortSharingAccountsByNearestSeatExpiry", () => {
  it("orders expired and upcoming accounts by their nearest assigned seat expiry", () => {
    const accounts = [
      { id: "future", accountNumber: 1, name: "Future" },
      { id: "missing", accountNumber: 2, name: "Missing" },
      { id: "expired", accountNumber: 3, name: "Expired" },
      { id: "same-date-later-number", accountNumber: 4, name: "Same date" },
    ] as SharingAccount[];
    const details = new Map<string, SharingAccountDetail>([
      ["future", { seats: [{ seatNumber: 1, memberName: "Future", expiresAt: "2026-10-10", status: "active" }] } as SharingAccountDetail],
      ["expired", { seats: [{ seatNumber: 1, memberName: "Expired", expiresAt: "2026-09-25", status: "active" }] } as SharingAccountDetail],
      ["same-date-later-number", { seats: [{ seatNumber: 1, memberName: "Same", expiresAt: "2026-10-10", status: "active" }] } as SharingAccountDetail],
      ["missing", { seats: [{ seatNumber: 1, memberName: null, expiresAt: null, status: "vacant" }] } as SharingAccountDetail],
    ]);

    expect(sortSharingAccountsByNearestSeatExpiry(
      accounts,
      details,
      assertDateOnly("2026-09-28"),
    ).map((account) => account.id)).toEqual([
      "expired",
      "future",
      "same-date-later-number",
      "missing",
    ]);

    expect(sortSharingAccountsByNearestSeatExpiry(
      accounts,
      details,
      assertDateOnly("2026-09-28"),
      "desc",
    ).map((account) => account.id)).toEqual([
      "future",
      "same-date-later-number",
      "expired",
      "missing",
    ]);
  });
});
