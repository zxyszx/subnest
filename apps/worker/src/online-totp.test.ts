import { describe, expect, it } from "vitest";
import { generateOnlineTotpCode, normalizeTotpSecret } from "./online-totp";

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("online TOTP", () => {
  it("generates the RFC 6238 SHA-1 code using the product's six-digit format", () => {
    expect(generateOnlineTotpCode(RFC_SECRET, 59_000)).toBe("287082");
  });

  it("accepts Base32 and otpauth input without leaking unrelated URI fields", () => {
    expect(normalizeTotpSecret(`otpauth://totp/Prime?issuer=Example&secret=${RFC_SECRET}`)).toBe(RFC_SECRET);
    expect(normalizeTotpSecret("gezd-gnbv gy3tqojq gezdgnbvgy3tqojq====")).toBe(RFC_SECRET);
  });

  it("rejects invalid or undersized secrets", () => {
    expect(() => normalizeTotpSecret("not-a-secret")).toThrow();
    expect(() => normalizeTotpSecret("ABC2")).toThrow();
  });
});
