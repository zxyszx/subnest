import type { SharingAccount } from "@renewlet/shared/schemas/sharing";
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
