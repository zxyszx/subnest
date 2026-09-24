import { addDateOnly, isValidDateOnly } from "@/lib/time/date-only";

export const SHARING_BILLING_MONTH_PRESETS = [1, 2, 3, 6, 12] as const;

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
