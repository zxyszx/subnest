/**
 * 即将续费/到期列表（侧边栏卡片）。
 *
 * 规则：
 * - 只展示提醒窗口内的 active/trial
 * - 展示续费或一次性固定服务期到期
 * - 最多展示 5 条
 */

import type { SubscriptionCollectionItem } from '@/types/subscription';
import { cn } from '@/lib/utils';
import { formatDateOnlyMonthDay, type DateOnly } from '@/lib/time/date-only';
import { useI18n } from '@/i18n/I18nProvider';
import { buildUpcomingReminderItems } from '@/modules/subscriptions/domain/upcoming-reminders';
import { Button } from '@/components/ui/button';
import { CalendarClock, RotateCw } from 'lucide-react';
import { CalendarAccountIdentity } from '@/components/calendar-account-identity';
import { SharingPaymentSummary } from '@/components/sharing-payment-summary';
import { isManualRenewEligible } from '@renewlet/shared/subscription-renewal';

interface UpcomingRenewalsProps {
  /** 订阅列表（前端 domain 类型）。 */
  subscriptions: SubscriptionCollectionItem[];
  /** Dashboard 页面级账号业务日期。 */
  today: DateOnly | string;
  /** 设置页默认提前提醒天数，用于解析继承型订阅。 */
  notificationReminderDays: number;
  /** 列表上限；弹窗可传入较大的值展示完整提醒集合。 */
  limit?: number;
  /** 首页需要同时追踪已经过期、等待处理的订阅。 */
  includeExpired?: boolean;
  /** 仪表盘固定观察窗口；传入后不读取每条订阅的提醒天数。 */
  windowDays?: number;
  /** 复用订阅列表的续订弹窗。 */
  onRenew?: (id: string) => void;
  /** 仪表盘卡片使用紧凑密度；弹窗保留默认密度。 */
  density?: "default" | "compact";
}

/** 即将续费列表组件。 */
export function UpcomingRenewals({ subscriptions, today, notificationReminderDays, limit = 5, includeExpired = false, windowDays, onRenew, density = "default" }: UpcomingRenewalsProps) {
  const { t, formatCurrency, locale } = useI18n();
  const compact = density === "compact";
  const upcoming = buildUpcomingReminderItems({
    subscriptions,
    today,
    notificationReminderDays: windowDays ?? notificationReminderDays,
    includeExpired,
    ignoreSubscriptionReminder: windowDays !== undefined,
  }).slice(0, limit);

  if (upcoming.length === 0) {
    return (
      <p className="py-4 text-center text-sm leading-6 text-muted-foreground">{t("upcoming.noneNextTwoWeeks")}</p>
    );
  }

  return (
    <div className="min-w-0 divide-y divide-border">
      {upcoming.map((item) => (
        <div
          key={item.subscription.id}
          className={cn(
            "grid min-h-14 min-w-0 grid-cols-[minmax(0,1fr)_5.5rem] items-center first:pt-0 last:pb-0 sm:grid-cols-[minmax(9rem,1fr)_minmax(14rem,16rem)_5.5rem]",
            "gap-x-3 gap-y-2 py-2.5",
            item.daysUntil < 0
              ? "text-destructive"
              : item.daysUntil <= 3 && "text-warning"
          )}
        >
          <div className="min-w-0">
            <CalendarAccountIdentity
              platformName={item.subscription.platformName || item.subscription.name}
              logo={item.subscription.logo}
              accountNumber={item.subscription.accountNumber ?? 1}
              size="sm"
            />
            {item.subscription.platformName && item.subscription.platformName !== item.subscription.name ? (
              <p className={cn("truncate text-xs text-muted-foreground", compact ? "mt-0.5 pl-6.5" : "mt-1 pl-11")}>{item.subscription.name}</p>
            ) : null}
            {item.subscription.paymentMethod || item.subscription.cardLast4 ? (
              <SharingPaymentSummary
                paymentMethod={item.subscription.paymentMethod ?? null}
                cardLast4={item.subscription.cardLast4 ?? null}
                className={cn("mt-0.5 max-w-full text-xs text-muted-foreground", compact ? "pl-6.5" : "pl-11")}
              />
            ) : null}
          </div>
          <div className="order-3 col-span-2 grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-end gap-3 rounded-md bg-muted/30 px-2 py-1.5 sm:order-0 sm:col-span-1 sm:grid-cols-[5.5rem_minmax(7.75rem,1fr)] sm:bg-transparent sm:p-0">
            <div className="text-left sm:text-right">
              <p className="text-[11px] text-muted-foreground">{t("calendar.nextBilling")}</p>
              <p className="mt-0.5 whitespace-nowrap text-sm font-medium tabular-nums text-foreground">{formatDateOnlyMonthDay(item.subscription.nextBillingDate, locale)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">{t("subscription.field.price")}</p>
              <p className="mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(item.subscription.price, item.subscription.currency)}
              </p>
            </div>
          </div>
          <div className="flex w-22 flex-col items-end gap-1">
            <span className={cn("whitespace-nowrap text-xs font-semibold tabular-nums", item.daysUntil < 0 ? "text-destructive" : item.daysUntil <= 3 ? "text-warning" : "text-muted-foreground")}>
              {item.daysUntil < 0 ? t("subscription.card.expiredDays", { days: Math.abs(item.daysUntil) }) : item.daysUntil === 0 ? t("upcoming.todayShort") : t("upcoming.daysShort", { days: item.daysUntil })}
            </span>
            {onRenew && isManualRenewEligible(item.subscription) ? (
              <Button type="button" variant="outline" size="sm" className="w-full shrink-0 gap-1.5 px-2" onClick={() => onRenew(item.subscription.id)}>
                <RotateCw className="h-4 w-4" />
                <span>{t("subscription.renew")}</span>
              </Button>
            ) : <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
          </div>
        </div>
      ))}
    </div>
  );
}
