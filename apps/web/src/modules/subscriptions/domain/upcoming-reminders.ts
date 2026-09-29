import { effectiveReminderDays } from "@renewlet/shared/runtime";
import { daysBetweenDateOnly, type DateOnly } from "@/lib/time/date-only";
import { isOneTimeBuyout } from "@/lib/subscription-billing";
import type { SubscriptionCollectionItem } from "@/types/subscription";
import { getEffectiveSubscriptionStatus, isEffectivelyActiveSubscription } from "./subscription-status";

export type UpcomingReminderKind = "renewal" | "expiry";

export interface UpcomingReminderItem {
  subscription: SubscriptionCollectionItem;
  kind: UpcomingReminderKind;
  daysUntil: number;
  reminderDays: number;
}

interface BuildUpcomingReminderItemsInput {
  subscriptions: readonly SubscriptionCollectionItem[];
  notificationReminderDays: number;
  today: DateOnly | string;
  /** 是否把已经过期但尚未更新日期的订阅也列入首页提醒。 */
  includeExpired?: boolean;
  /** 固定业务窗口（例如仪表盘 7 天）不受单条提醒开关影响。 */
  ignoreSubscriptionReminder?: boolean;
}

/** 构建首页“即将续费/到期”提醒窗口条目。 */
export function buildUpcomingReminderItems({
  subscriptions,
  notificationReminderDays,
  today,
  includeExpired = false,
  ignoreSubscriptionReminder = false,
}: BuildUpcomingReminderItemsInput): UpcomingReminderItem[] {
  const items: UpcomingReminderItem[] = [];

  for (const subscription of subscriptions) {
    const effectiveStatus = getEffectiveSubscriptionStatus(subscription, today);
    if (includeExpired && effectiveStatus === "expired" && !isOneTimeBuyout(subscription)) {
      const daysUntil = daysBetweenDateOnly(today, subscription.nextBillingDate);
      items.push({ subscription, kind: "expiry", daysUntil, reminderDays: 0 });
      continue;
    }
    if (!isEffectivelyActiveSubscription(subscription, today)) continue;
    if (isOneTimeBuyout(subscription)) continue;

    // 首页可视窗口复用 reminderDays 的哨兵契约，但这里只决定是否展示，不代表 Cron 发送时刻。
    const reminderDays = ignoreSubscriptionReminder
      ? notificationReminderDays
      : effectiveReminderDays(subscription.reminderDays, notificationReminderDays);
    if (reminderDays === undefined) continue;

    const daysUntil = daysBetweenDateOnly(today, subscription.nextBillingDate);
    if (daysUntil < 0 || daysUntil > reminderDays) continue;

    items.push({
      subscription,
      kind: subscription.billingCycle === "one-time" ? "expiry" : "renewal",
      daysUntil,
      reminderDays,
    });
  }

  return items.sort((a, b) => {
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
    return a.subscription.name.localeCompare(b.subscription.name);
  });
}
