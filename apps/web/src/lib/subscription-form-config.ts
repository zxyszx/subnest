import type { ConfigItem, CustomConfig } from "@/types/config";
import type { SubscriptionFormState } from "@/types/subscription-form";

type CurrentFormOptions = Pick<SubscriptionFormState, "category" | "paymentMethod">;

function appendCurrentOption(items: ConfigItem[], value: string): ConfigItem[] {
  if (!value || items.some((item) => item.value === value)) return items;

  return [
    ...items,
    {
      id: `current:${value}`,
      value,
      labels: { "zh-CN": value, "en-US": value },
    },
  ];
}

/**
 * Keep legacy values visible while editing without restoring deleted options to global config.
 */
export function withCurrentSubscriptionFormOptions(
  config: CustomConfig,
  formData: CurrentFormOptions,
): CustomConfig {
  const categories = appendCurrentOption(config.categories, formData.category);
  const paymentMethods = appendCurrentOption(config.paymentMethods, formData.paymentMethod);

  if (categories === config.categories && paymentMethods === config.paymentMethods) return config;
  return { ...config, categories, paymentMethods };
}
