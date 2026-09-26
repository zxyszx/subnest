import { describe, expect, it } from "vitest";

import { subscriptionPlatformName, UNBOUND_PLATFORM_VALUE } from "./subscription-platform";

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
