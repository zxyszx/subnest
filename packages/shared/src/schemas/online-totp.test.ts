import { describe, expect, it } from "vitest";

import { onlineTotpAccountCreateSchema } from "./online-totp";

const validAccount = {
  platformName: "GitHub",
  serviceName: "Work",
  accountNumber: 1,
  account: "person@example.com",
  secret: "JBSWY3DPEHPK3PXP",
  enabled: true,
  sharingEnabled: true,
};

describe("online 2FA logo contract", () => {
  it.each([
    "",
    "/api/app/assets/private-logo_123",
    "https://cdn.example.com/github.png",
    "http://localhost:8787/logo.png",
  ])("accepts supported logo reference %s", (logo) => {
    expect(onlineTotpAccountCreateSchema.parse({ ...validAccount, logo }).logo).toBe(logo);
  });

  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1) />",
    "https://user:password@example.com/logo.png",
    "/api/app/assets/../secret",
  ])("rejects unsafe logo reference %s", (logo) => {
    expect(() => onlineTotpAccountCreateSchema.parse({ ...validAccount, logo })).toThrow();
  });
});
