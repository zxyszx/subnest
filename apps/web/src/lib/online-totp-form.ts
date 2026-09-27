import type { OnlineTotpAccount } from "@renewlet/shared/schemas/online-totp";

function normalizedPlatformName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function findOnlineTotpPlatform(accounts: readonly OnlineTotpAccount[], platformName: string): OnlineTotpAccount | undefined {
  const normalized = normalizedPlatformName(platformName);
  if (!normalized) return undefined;
  return accounts.find((account) => normalizedPlatformName(account.platformName) === normalized);
}

export function onlineTotpAccountNumberExists(
  accounts: readonly OnlineTotpAccount[],
  platformName: string,
  accountNumber: number,
  excludeId?: string,
): boolean {
  const normalized = normalizedPlatformName(platformName);
  return normalized !== "" && accounts.some((account) => (
    account.id !== excludeId
    && normalizedPlatformName(account.platformName) === normalized
    && account.accountNumber === accountNumber
  ));
}
