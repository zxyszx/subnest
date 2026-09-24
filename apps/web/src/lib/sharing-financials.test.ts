import { describe, expect, it } from "vitest";

import { assertDateOnly } from "@/lib/time/date-only";
import { sharingUpcomingRenewalCount } from "@/lib/sharing-financials";

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
