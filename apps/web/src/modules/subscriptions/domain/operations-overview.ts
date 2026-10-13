import type { SubscriptionCollectionItem } from "@/types/subscription";
import type {
  SharingAccount,
  SharingAccountDetail,
} from "@renewlet/shared/schemas/sharing";
import {
  sharingMonthlyRevenue,
  sharingMonthlyProfit,
} from "@/lib/sharing-financials";
import { subscriptionPlatformName } from "@/lib/subscription-platform";
import { isEffectivelyActiveSubscription } from "./subscription-status";
import { isOneTimeBuyout, toMonthlyAmount } from "@/lib/subscription-billing";
import {
  daysBetweenDateOnly,
  fromPlainDate,
  toPlainDate,
  type DateOnly,
} from "@/lib/time/date-only";

type Convert = (amount: number | string, from: string, to: string) => number;
export interface PlatformOverview {
  name: string;
  logo: string | null;
  accounts: number;
  capacity: number;
  occupied: number;
  revenue: number;
  cost: number;
  profit: number;
}
export interface ForecastMonth {
  month: string;
  revenue: number;
  cost: number;
  profit: number;
}

export function buildOperationsOverview(
  accounts: readonly SharingAccount[],
  subscriptions: readonly SubscriptionCollectionItem[],
  currency: string,
  convert: Convert,
  today: DateOnly,
) {
  const currentAccounts = accounts.filter(
    (account) => account.status !== "archived",
  );
  const groups = new Map<string, PlatformOverview>();
  for (const account of currentAccounts) {
    const name = subscriptionPlatformName(account.subscription);
    const group = groups.get(name) ?? {
      name,
      logo: account.subscription.logo,
      accounts: 0,
      capacity: 0,
      occupied: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    };
    group.accounts += 1;
    group.capacity += account.capacity;
    group.occupied += account.occupiedSeats;
    group.revenue += sharingMonthlyRevenue(account, currency, convert);
    group.cost += convert(account.monthlyCost, account.currency, currency);
    group.profit = group.revenue - group.cost;
    groups.set(name, group);
  }
  const capacity = currentAccounts.reduce(
    (sum, account) => sum + account.capacity,
    0,
  );
  const occupied = currentAccounts.reduce(
    (sum, account) => sum + account.occupiedSeats,
    0,
  );
  return {
    platforms: [...groups.values()].sort(
      (a, b) => b.profit - a.profit || a.name.localeCompare(b.name),
    ),
    capacity,
    occupied,
    vacancies: Math.max(0, capacity - occupied),
    active: subscriptions.filter((subscription) =>
      isEffectivelyActiveSubscription(subscription, today),
    ).length,
    vacantAccounts: currentAccounts.filter(
      (account) => account.occupiedSeats < account.capacity,
    ),
    negativeAccounts: currentAccounts.filter(
      (account) => sharingMonthlyProfit(account, currency, convert) < 0,
    ),
    pausedAccounts: currentAccounts.filter(
      (account) => account.status === "paused",
    ),
    ranking: currentAccounts
      .map((account) => ({
        account,
        profit: sharingMonthlyProfit(account, currency, convert),
      }))
      .sort(
        (a, b) =>
          b.profit - a.profit || a.account.id.localeCompare(b.account.id),
      )
      .slice(0, 5),
    recent: [...currentAccounts]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
  };
}

// Forecast only current contracts; do not invent future member renewals or payment events.
export function buildOperationsForecast(
  subscriptions: readonly SubscriptionCollectionItem[],
  details: readonly SharingAccountDetail[],
  today: DateOnly,
  currency: string,
  convert: Convert,
): ForecastMonth[] {
  const start = toPlainDate(today).with({ day: 1 });
  return Array.from({ length: 12 }, (_, index) => {
    const month = start.add({ months: index });
    const end = fromPlainDate(month.add({ months: 1 }));
    const monthStart = fromPlainDate(month);
    const cost = subscriptions
      .filter(
        (subscription) =>
          isEffectivelyActiveSubscription(subscription, today) &&
          !isOneTimeBuyout(subscription) &&
          (!subscription.startDate || subscription.startDate < end),
      )
      .reduce(
        (sum, subscription) =>
          sum +
          toMonthlyAmount(
            convert(subscription.price, subscription.currency, currency),
            subscription.billingCycle,
            subscription.customDays,
            subscription.customCycleUnit,
            subscription.oneTimeTermCount,
            subscription.oneTimeTermUnit,
          ),
        0,
      );
    const revenue = details
      .filter((detail) => detail.account.status === "active")
      .reduce(
        (sum, detail) =>
          sum +
          detail.seats.reduce((amount, seat) => {
            if (
              seat.status === "vacant" ||
              seat.status === "archived" ||
              !seat.memberName ||
              !seat.expiresAt ||
              !seat.startDate ||
              !seat.currency
            )
              return amount;
            const overlapStart =
              seat.startDate > monthStart ? seat.startDate : monthStart;
            const overlapEnd = seat.expiresAt < end ? seat.expiresAt : end;
            const days = Math.max(
              0,
              daysBetweenDateOnly(overlapStart, overlapEnd),
            );
            const monthly = convert(
              seat.monthlyPrice ?? 0,
              seat.currency,
              currency,
            );
            return (
              amount + (monthly * days) / daysBetweenDateOnly(monthStart, end)
            );
          }, 0),
        0,
      );
    return {
      month: `${month.year}-${String(month.month).padStart(2, "0")}`,
      revenue,
      cost,
      profit: revenue - cost,
    };
  });
}
