import { describe, expect, it } from "vitest";

import { sharingSeatUpdateSchema } from "./sharing";

describe("sharing seat billing contract", () => {
  const legacyInput = {
    memberName: "Annual member",
    contact: "",
    contactType: "",
    monthlyPrice: "1.66",
    currency: "CNY",
    billingMonths: 12,
    startDate: "2026-01-01",
    expiresAt: "2027-01-01",
    status: "active" as const,
    paymentStatus: "paid" as const,
    notes: "",
  };

  it("accepts and canonicalizes an exact period amount", () => {
    expect(sharingSeatUpdateSchema.parse({ ...legacyInput, billingAmount: "020.000000" }).billingAmount).toBe("20");
  });

  it("accepts forum and marketplace contact types", () => {
    expect(sharingSeatUpdateSchema.parse({ ...legacyInput, contactType: "ns" }).contactType).toBe("ns");
    expect(sharingSeatUpdateSchema.parse({ ...legacyInput, contactType: "xianyu" }).contactType).toBe("xianyu");
  });

  it("keeps older clients compatible", () => {
    expect(sharingSeatUpdateSchema.parse(legacyInput).billingAmount).toBeUndefined();
  });
});
