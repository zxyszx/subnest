import { describe, expect, it, vi } from "vitest";
import { generateFamilySharingPassword } from "./family-sharing-password";

describe("generateFamilySharingPassword", () => {
  it("uses the SubNest-letters-digits format", () => {
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      const values = array as Uint32Array;
      values[0] = 0;
      return array;
    });

    expect(generateFamilySharingPassword()).toBe("SubNest-AAA-2222");
  });
});
