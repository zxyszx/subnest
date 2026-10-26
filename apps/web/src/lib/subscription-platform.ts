type PlatformSource = {
  name: string;
  platformName?: string | null;
};

/** 持久化到后端的未绑定平台值；界面始终显示为“未绑定”。 */
export const UNBOUND_PLATFORM_VALUE = "__unbound__";

/** Suggest the next platform number, falling back to a gap at the supported limit. */
export function platformAccountNumbers(
  platforms: readonly { name: string; accounts?: readonly { id: string; accountNumber: number }[] | undefined }[],
  platformName: string,
  excludeId?: string,
) {
  const normalized = platformName.trim().toLocaleLowerCase();
  const used = [...new Set(platforms
    .filter((platform) => normalized !== "" && platform.name.trim().toLocaleLowerCase() === normalized)
    .flatMap((platform) => platform.accounts ?? [])
    .filter((account) => account.id !== excludeId && Number.isInteger(account.accountNumber) && account.accountNumber > 0 && account.accountNumber <= 100000)
    .map((account) => account.accountNumber))].sort((a, b) => a - b);
  let suggested = (used.at(-1) ?? 0) + 1;
  if (suggested > 100000) {
    const taken = new Set(used);
    suggested = 1;
    while (taken.has(suggested)) suggested++;
  }
  return { used, suggested: suggested <= 100000 ? suggested : null };
}

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
