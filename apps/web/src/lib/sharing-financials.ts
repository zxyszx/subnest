import type { SharingAccount, SharingAccountDetail, SharingSeat } from "@renewlet/shared/schemas/sharing";
import { daysBetweenDateOnly, type DateOnly } from "@/lib/time/date-only";

type CurrencyConvert = (amount: number | string, fromCurrency: string, toCurrency: string) => number;

export function sharingMonthlyRevenue(
  account: SharingAccount,
  targetCurrency: string,
  convert: CurrencyConvert,
): number {
  return Object.entries(account.monthlyRevenueByCurrency).reduce(
    (total, [currency, amount]) => total + convert(amount, currency, targetCurrency),
    0,
  );
}

export function sharingMonthlyProfit(
  account: SharingAccount,
  targetCurrency: string,
  convert: CurrencyConvert,
): number {
  return sharingMonthlyRevenue(account, targetCurrency, convert)
    - convert(account.monthlyCost, account.currency, targetCurrency);
}

export function sharingUpcomingRenewalCount(
  accounts: readonly Pick<SharingAccount, "nextBillingDate">[],
  today: DateOnly,
  windowDays = 7,
): number {
  return accounts.reduce((total, account) => {
    const daysUntilRenewal = daysBetweenDateOnly(today, account.nextBillingDate);
    return total + (daysUntilRenewal >= 0 && daysUntilRenewal <= windowDays ? 1 : 0);
  }, 0);
}

export interface SharingUpcomingSeatRenewal {
  account: SharingAccount;
  seat: SharingSeat;
  daysUntilExpiry: number;
}

export interface SharingNearestSeatExpiry {
  expiresAt: string;
  daysUntilExpiry: number;
  memberCount: number;
}

export type SharingExpirySortDirection = "asc" | "desc";

export function sharingNearestSeatExpiry(
  detail: SharingAccountDetail | undefined,
  today: DateOnly,
): SharingNearestSeatExpiry | null {
  if (!detail) return null;
  const assigned = detail.seats
    .filter((seat) => seat.expiresAt && seat.memberName && seat.status !== "vacant" && seat.status !== "archived")
    .sort((left, right) => left.expiresAt!.localeCompare(right.expiresAt!) || left.seatNumber - right.seatNumber);
  const expiresAt = assigned[0]?.expiresAt;
  if (!expiresAt) return null;
  return {
    expiresAt,
    daysUntilExpiry: daysBetweenDateOnly(today, expiresAt),
    memberCount: assigned.filter((seat) => seat.expiresAt === expiresAt).length,
  };
}

export function sortSharingAccountsByNearestSeatExpiry(
  accounts: readonly SharingAccount[],
  detailsByAccountId: ReadonlyMap<string, SharingAccountDetail>,
  today: DateOnly,
  direction: SharingExpirySortDirection = "asc",
): SharingAccount[] {
  return [...accounts].sort((left, right) => {
    const leftExpiry = sharingNearestSeatExpiry(detailsByAccountId.get(left.id), today)?.expiresAt;
    const rightExpiry = sharingNearestSeatExpiry(detailsByAccountId.get(right.id), today)?.expiresAt;

    if (leftExpiry && rightExpiry && leftExpiry !== rightExpiry) {
      const comparison = leftExpiry.localeCompare(rightExpiry);
      return direction === "asc" ? comparison : -comparison;
    }
    if (leftExpiry !== rightExpiry) return leftExpiry ? -1 : 1;
    return left.accountNumber - right.accountNumber
      || left.name.localeCompare(right.name)
      || left.id.localeCompare(right.id);
  });
}

export function sharingUpcomingSeatRenewals(
  details: readonly SharingAccountDetail[],
  today: DateOnly,
  windowDays = 7,
  includeExpired = false,
): SharingUpcomingSeatRenewal[] {
  return details.flatMap((detail) => detail.seats.flatMap((seat) => {
    if (!seat.expiresAt || !seat.memberName || seat.status !== "active") return [];
    const daysUntilExpiry = daysBetweenDateOnly(today, seat.expiresAt);
    if ((!includeExpired && daysUntilExpiry < 0) || daysUntilExpiry > windowDays) return [];
    return [{ account: detail.account, seat, daysUntilExpiry }];
  })).sort((left, right) => left.daysUntilExpiry - right.daysUntilExpiry
    || left.seat.expiresAt!.localeCompare(right.seat.expiresAt!)
    || left.account.accountNumber - right.account.accountNumber
    || left.seat.seatNumber - right.seat.seatNumber);
}
