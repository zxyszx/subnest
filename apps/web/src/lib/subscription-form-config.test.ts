import { describe, expect, it } from "vitest";
import { withCurrentSubscriptionFormOptions } from "@/lib/subscription-form-config";
import type { CustomConfig } from "@/types/config";

const config: CustomConfig = {
  categories: [{ id: "streaming", value: "streaming", labels: { "zh-CN": "影音", "en-US": "Streaming" } }],
  statuses: [],
  paymentMethods: [{ id: "card", value: "card", labels: { "zh-CN": "信用卡", "en-US": "Card" } }],
  currencies: [],
};

describe("withCurrentSubscriptionFormOptions", () => {
  it("appends missing current values for an existing subscription", () => {
    const result = withCurrentSubscriptionFormOptions(config, {
      category: "legacy_category",
      paymentMethod: "Moniepoint",
    });

    expect(result.categories.map((item) => item.value)).toEqual(["streaming", "legacy_category"]);
    expect(result.paymentMethods.map((item) => item.value)).toEqual(["card", "Moniepoint"]);
    expect(result.paymentMethods.at(-1)?.labels).toEqual({ "zh-CN": "Moniepoint", "en-US": "Moniepoint" });
  });

  it("keeps the original config reference when both values already exist", () => {
    expect(withCurrentSubscriptionFormOptions(config, {
      category: "streaming",
      paymentMethod: "card",
    })).toBe(config);
  });
});
