import { describe, expect, it } from "vitest";

import { platformAccountNumbers, subscriptionPlatformName, UNBOUND_PLATFORM_VALUE } from "./subscription-platform";

describe("platformAccountNumbers", () => {
  const platforms = [
    { name: "Spotify", accounts: [{ id: "a", accountNumber: 1 }, { id: "b", accountNumber: 8 }] },
    { name: "Netflix", accounts: [{ id: "c", accountNumber: 9 }] },
  ];
  it("recommends the next number on the selected platform even when cloning an earlier account", () => {
    expect(platformAccountNumbers(platforms, " spotify ")).toEqual({ used: [1, 8], suggested: 9 });
    expect(platformAccountNumbers(platforms, "Netflix")).toEqual({ used: [9], suggested: 10 });
  });
  it("excludes the current subscription during edits and starts new platforms at one", () => {
    expect(platformAccountNumbers(platforms, "Spotify", "b")).toEqual({ used: [1], suggested: 2 });
    expect(platformAccountNumbers(platforms, "New platform")).toEqual({ used: [], suggested: 1 });
  });
  it("reuses a gap when the highest supported number is occupied", () => {
    expect(platformAccountNumbers([{ name: "Spotify", accounts: [{ id: "a", accountNumber: 100000 }] }], "Spotify")).toEqual({ used: [100000], suggested: 1 });
  });
});

describe("subscriptionPlatformName", () => {
  it("preserves an explicitly managed platform name", () => {
    expect(subscriptionPlatformName({ name: "Netflix-02/高级套餐", platformName: "Netflix" })).toBe("Netflix");
  });

  it("folds legacy numbered plan names into one platform", () => {
    expect(subscriptionPlatformName({ name: "Netflix-02/高级套餐", platformName: "Netflix-02/高级套餐" })).toBe("Netflix");
    expect(subscriptionPlatformName({ name: "Prime Video #03/家庭套餐" })).toBe("Prime Video");
  });

  it("does not rewrite ordinary product names", () => {
    expect(subscriptionPlatformName({ name: "ChatGPT 4" })).toBe("ChatGPT 4");
    expect(subscriptionPlatformName({ name: "Office-365" })).toBe("Office-365");
  });

  it("maps the explicit unbound value to an empty platform for display", () => {
    expect(subscriptionPlatformName({ name: "独立服务", platformName: UNBOUND_PLATFORM_VALUE })).toBe("");
  });
});
