import { describe, expect, it } from "vitest";
import { findOnlineTotpPlatform, onlineTotpAccountNumberExists } from "@/lib/online-totp-form";
import type { OnlineTotpAccount } from "@renewlet/shared/schemas/online-totp";

const accounts = [
  { id: "prime-1", platformName: "PrimeVideo", accountNumber: 1, logo: "/prime.png" },
  { id: "google-1", platformName: "Google", accountNumber: 1, logo: "/google.png" },
] as OnlineTotpAccount[];

describe("online 2FA platform identity", () => {
  it("matches existing platforms case-insensitively so their logo can be reused", () => {
    expect(findOnlineTotpPlatform(accounts, " primevideo ")?.logo).toBe("/prime.png");
  });

  it("requires account numbers to be unique only within the same platform", () => {
    expect(onlineTotpAccountNumberExists(accounts, "PrimeVideo", 1)).toBe(true);
    expect(onlineTotpAccountNumberExists(accounts, "PrimeVideo", 2)).toBe(false);
    expect(onlineTotpAccountNumberExists(accounts, "Netflix", 1)).toBe(false);
    expect(onlineTotpAccountNumberExists(accounts, "PrimeVideo", 1, "prime-1")).toBe(false);
  });
});
