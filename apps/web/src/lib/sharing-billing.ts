import { addDateOnly, isValidDateOnly } from "@/lib/time/date-only";
import { divideMoney, multiplyMoney } from "@renewlet/shared/money";

export const SHARING_BILLING_MONTH_PRESETS = [1, 3, 6, 12] as const;

export function rescaleSharingBillingAmount(amount: string, previousMonths: number, nextMonths: number): string {
  if (!amount || !Number.isInteger(previousMonths) || previousMonths < 1) return "";
  if (!Number.isInteger(nextMonths) || nextMonths < 1 || nextMonths > 120) return amount;
  return multiplyMoney(divideMoney(amount, previousMonths), nextMonths);
}

export function sharingExpiryDate(startDate: string, billingMonths: number): string {
  if (!isValidDateOnly(startDate) || !Number.isInteger(billingMonths) || billingMonths < 1 || billingMonths > 120) return "";
  return addDateOnly(startDate, { months: billingMonths });
}

export function sharingRenewalDates(currentExpiryDate: string, billingMonths: number): {
  startDate: string;
  expiresAt: string;
} {
  return {
    startDate: currentExpiryDate,
    expiresAt: sharingExpiryDate(currentExpiryDate, billingMonths),
  };
}
