import { describe, expect, it } from "vitest";

import { sharingBillingAmounts } from "./sharing";

describe("sharing billing amounts", () => {
  it("keeps an annual charge exact while deriving its monthly equivalent", () => {
    expect(sharingBillingAmounts("1.66", "20", 12)).toEqual({
      monthlyPrice: "1.666667",
      amount: "20",
    });
  });

  it("keeps legacy monthly-price requests compatible", () => {
    expect(sharingBillingAmounts("15", undefined, 3)).toEqual({
      monthlyPrice: "15",
      amount: "45",
    });
  });
});
