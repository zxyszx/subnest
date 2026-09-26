type PlatformSource = {
  name: string;
  platformName?: string | null;
};

/** 持久化到后端的未绑定平台值；界面始终显示为“未绑定”。 */
export const UNBOUND_PLATFORM_VALUE = "__unbound__";

/** Fold legacy names such as "Netflix-02/高级套餐" into their service platform. */
export function subscriptionPlatformName(source: PlatformSource): string {
  const subscriptionName = source.name.trim();
  const storedPlatformName = source.platformName?.trim() ?? "";
  if (storedPlatformName === UNBOUND_PLATFORM_VALUE) return "";
  if (storedPlatformName && storedPlatformName !== subscriptionName) return storedPlatformName;

  const [serviceName = "", ...planSegments] = subscriptionName.split("/");
  if (planSegments.length === 0) return storedPlatformName || subscriptionName;

  const normalized = serviceName.replace(/\s*[-_#]\s*0*\d+\s*$/u, "").trim();
  return normalized || storedPlatformName || subscriptionName;
}
