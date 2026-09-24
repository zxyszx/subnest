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

export function sharingUpcomingSeatRenewals(
  details: readonly SharingAccountDetail[],
  today: DateOnly,
  windowDays = 7,
): SharingUpcomingSeatRenewal[] {
  return details.flatMap((detail) => detail.seats.flatMap((seat) => {
    if (!seat.expiresAt || !seat.memberName || seat.status === "vacant" || seat.status === "archived") return [];
    const daysUntilExpiry = daysBetweenDateOnly(today, seat.expiresAt);
    if (daysUntilExpiry < 0 || daysUntilExpiry > windowDays) return [];
    return [{ account: detail.account, seat, daysUntilExpiry }];
  })).sort((left, right) => left.daysUntilExpiry - right.daysUntilExpiry
    || left.seat.expiresAt!.localeCompare(right.seat.expiresAt!)
    || left.account.accountNumber - right.account.accountNumber
    || left.seat.seatNumber - right.seat.seatNumber);
}
