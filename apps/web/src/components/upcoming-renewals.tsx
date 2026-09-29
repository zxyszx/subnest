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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CalendarClock, MoreHorizontal, RotateCw } from 'lucide-react';
import { CalendarAccountIdentity } from '@/components/calendar-account-identity';
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
}

/** 即将续费列表组件。 */
export function UpcomingRenewals({ subscriptions, today, notificationReminderDays, limit = 5, includeExpired = false, windowDays, onRenew }: UpcomingRenewalsProps) {
  const { t, formatCurrency, locale } = useI18n();
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
            "grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 py-3 first:pt-0 last:pb-0",
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
            />
            {item.subscription.platformName && item.subscription.platformName !== item.subscription.name ? (
              <p className="mt-1 truncate pl-11 text-xs text-muted-foreground">{item.subscription.name}</p>
            ) : null}
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-xs text-muted-foreground">{t("calendar.nextBilling")}</p>
            <p className="mt-0.5 whitespace-nowrap text-sm tabular-nums text-foreground">{formatDateOnlyMonthDay(item.subscription.nextBillingDate, locale)}</p>
          </div>
          <div className="text-right">
            <p className={cn("whitespace-nowrap text-xs font-semibold tabular-nums", item.daysUntil < 0 ? "text-destructive" : item.daysUntil <= 3 ? "text-warning" : "text-muted-foreground")}>
              {item.daysUntil < 0 ? t("subscription.card.expiredDays", { days: Math.abs(item.daysUntil) }) : item.daysUntil === 0 ? t("upcoming.todayShort") : t("upcoming.daysShort", { days: item.daysUntil })}
            </p>
            <p className="mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
            {formatCurrency(item.subscription.price, item.subscription.currency)}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" aria-label={t("subscription.moreActions")}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onRenew && isManualRenewEligible(item.subscription) ? (
                <DropdownMenuItem onClick={() => onRenew(item.subscription.id)}>
                  <RotateCw className="h-4 w-4" />
                  {t("subscription.renew")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>
                  <CalendarClock className="h-4 w-4" />
                  {item.kind === "expiry" ? t("upcoming.expiresOn", { date: formatDateOnlyMonthDay(item.subscription.nextBillingDate, locale) }) : t("upcoming.renewsOn", { date: formatDateOnlyMonthDay(item.subscription.nextBillingDate, locale) })}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
}
