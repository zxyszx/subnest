import { describe, expect, it } from "vitest";
import { SHARING_BILLING_MONTH_PRESETS, sharingExpiryDate, sharingRenewalDates } from "@/lib/sharing-billing";

describe("sharingExpiryDate", () => {
  it("includes one- and two-month renewal presets", () => {
    expect(SHARING_BILLING_MONTH_PRESETS).toEqual([1, 2, 3, 6, 12]);
  });

  it("renews from the current expiry date instead of today", () => {
    expect(sharingRenewalDates("2026-10-24", 2)).toEqual({
      startDate: "2026-10-24",
      expiresAt: "2026-12-24",
    });
  });

  it("adds the selected number of calendar months", () => {
    expect(sharingExpiryDate("2026-09-24", 3)).toBe("2026-12-24");
    expect(sharingExpiryDate("2026-09-24", 6)).toBe("2027-03-24");
    expect(sharingExpiryDate("2026-09-24", 12)).toBe("2027-09-24");
  });

  it("constrains month-end and leap-day dates", () => {
    expect(sharingExpiryDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(sharingExpiryDate("2024-02-29", 12)).toBe("2025-02-28");
  });

  it("returns an empty value for incomplete form input", () => {
    expect(sharingExpiryDate("", 3)).toBe("");
    expect(sharingExpiryDate("2026-09-24", 0)).toBe("");
  });
});
