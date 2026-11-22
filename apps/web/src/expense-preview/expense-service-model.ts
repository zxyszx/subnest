import type { SubscriptionCollectionItem } from "@/types/subscription";
import { addDateOnly, daysBetweenDateOnly } from "@/lib/time/date-only";

export function hasServiceTerm(s: SubscriptionCollectionItem) {
  return s.billingCycle !== "one-time" || Boolean(s.oneTimeTermCount);
}
export function isRenewableService(s: SubscriptionCollectionItem) {
  return (s.status === "active" || s.status === "trial" || s.status === "expired") && s.billingCycle !== "one-time";
}
export function serviceDays(s: SubscriptionCollectionItem, today: string) {
  return hasServiceTerm(s) ? daysBetweenDateOnly(today, s.nextBillingDate) : null;
}
// Progress is explicitly the recorded service term, not an inferred billing/payment cycle.
export function serviceProgress(s: SubscriptionCollectionItem, today: string) {
  if (!s.startDate || !hasServiceTerm(s)) return null;
  const span = daysBetweenDateOnly(s.startDate, s.nextBillingDate);
  if (span <= 0) return null;
  return Math.max(0, Math.min(100, daysBetweenDateOnly(s.startDate, today) / span * 100));
}
export function renewalWindow(subscriptions: readonly SubscriptionCollectionItem[], today: string, days: number) {
  return subscriptions.filter(s => {
    const remaining = serviceDays(s, today);
    return isRenewableService(s) && remaining !== null && remaining >= 0 && remaining <= days;
  }).sort((a,b) => a.nextBillingDate.localeCompare(b.nextBillingDate));
}
export function nextMonth(today: string) {
  return addDateOnly(today.slice(0,7) + "-01", {months: 1}).slice(0,7);
}
