/**
 * 仪表盘首页（/）。
 *
 * 展示内容：
 * - 财务摘要：月均支出/合租月收入/合租月净利润
 * - 需要处理的订阅续费
 * - 需要处理的车友续费与收费
 *
 * 架构位置：
 * - 页面只做数据 hook 装配和布局。
 * - 首页统计由 `useDashboardStats` 生成，新增入口由 `useSubscriptionCrud` 管理。
 */

import Link from '@/components/router-link';
import type { SubscriptionCollectionItem } from "@/types/subscription";
import { Header } from "@/components/header";
import { dashboardStatLayout } from "@/components/dashboard-stat-layout";
import { StatCard } from "@/components/ui/stat-card";
import { UpcomingRenewals } from "@/components/upcoming-renewals";
import { SharingUpcomingRenewals } from "@/components/sharing-upcoming-renewals";
import { DashboardPageSkeleton } from "@/components/loading-skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import { AddSubscriptionDialog } from "@/components/add-subscription-dialog";
import { CreditCard, Plus, CircleDollarSign, ReceiptText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportExchangeRates } from "@/hooks/use-report-exchange-rates";
import { useSubscriptionAnalytics, useSubscriptionFacets } from "@/hooks/use-subscriptions";
import { useSettings } from "@/hooks/use-settings";
import { useDashboardStats } from "@/modules/subscriptions/application/use-dashboard-stats";
import { useSubscriptionCrud } from "@/modules/subscriptions/application/use-subscription-crud";
import { useI18n } from "@/i18n/I18nProvider";
import { DEFAULT_NOTIFICATION_REMINDER_DAYS } from "@/types/subscription";
import { useZonedToday } from "@/hooks/use-zoned-today";
import { formatCompactCurrencyAmount } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useRouteReady } from "@/components/route-progress";
import { useSharingAccountDetails, useSharingAccounts } from "@/hooks/use-sharing";
import { sharingMonthlyProfit, sharingMonthlyRevenue, sharingUpcomingSeatRenewals } from "@/lib/sharing-financials";
import { buildUpcomingReminderItems } from "@/modules/subscriptions/domain/upcoming-reminders";
import { useState } from "react";

const EMPTY_SUBSCRIPTIONS: SubscriptionCollectionItem[] = [];

/** 仪表盘页面组件。 */
export default function Index() {
  const [taskFilter, setTaskFilter] = useState<"all" | "subscriptions" | "members">("all");
  const subscriptionsQuery = useSubscriptionAnalytics();
  const subscriptions = subscriptionsQuery.data ?? EMPTY_SUBSCRIPTIONS;
  const facetsQuery = useSubscriptionFacets();
  const settingsQuery = useSettings();
  const sharingQuery = useSharingAccounts();
  useRouteReady(subscriptionsQuery.isPending || settingsQuery.isPending || sharingQuery.isPending);
  const settings = settingsQuery.data;
  const { t, locale, formatCurrency } = useI18n();
  const exchangeRateProvider = settings?.exchangeRateProvider;
  const { convert, loading: ratesLoading } = useReportExchangeRates(exchangeRateProvider);
  const defaultCurrency = settings?.defaultCurrency ?? "CNY";
  const sharingAccounts = sharingQuery.data?.accounts ?? [];
  const sharingDetailQueries = useSharingAccountDetails(sharingAccounts.map((account) => account.id));
  const sharingIncome = sharingAccounts.reduce((total, account) => total + sharingMonthlyRevenue(account, defaultCurrency, convert), 0);
  const sharingProfit = sharingAccounts.reduce((total, account) => total + sharingMonthlyProfit(account, defaultCurrency, convert), 0);
  const timeZone = settings?.timezone ?? "UTC";
  const inheritedReminderDays = settings?.notificationReminderDays ?? DEFAULT_NOTIFICATION_REMINDER_DAYS;
  const availableTags = facetsQuery.data?.tags ?? [];
  // 页面级 today 是 Dashboard 全部日期派生的单一时钟，账号午夜到达时卡片、统计和提醒一起刷新。
  const today = useZonedToday(timeZone);
  const { totalMonthly, totalDaily } = useDashboardStats(
    subscriptions,
    defaultCurrency,
    convert,
    today,
    inheritedReminderDays,
  );
  const {
    handleAddSubscription,
  } = useSubscriptionCrud(subscriptions);
  const sharingRenewals = sharingUpcomingSeatRenewals(
    sharingDetailQueries.flatMap((query) => query.data ? [query.data] : []),
    today,
    7,
    true,
  );
  const sharingRenewalsPending = sharingDetailQueries.some((query) => query.isPending);
  const subscriptionRenewalCount = buildUpcomingReminderItems({
    subscriptions,
    today,
    notificationReminderDays: inheritedReminderDays,
    includeExpired: true,
  }).length;

  // 只有页面主数据还没有首屏结果时才展示骨架屏。
  // 汇率刷新期间保留已有内容，并在统计卡片副标题里提示加载状态，避免整页闪回 loading。
  if (subscriptionsQuery.isPending || settingsQuery.isPending || sharingQuery.isPending) {
    return (
      <div className="app-page bg-background">
        <Header onAddSubscription={handleAddSubscription} availableTags={availableTags} />
        <main className="app-main mx-auto max-w-7xl">
          <DashboardPageSkeleton withPageShell={false} />
        </main>
      </div>
    );
  }

  if (subscriptionsQuery.error || sharingQuery.error) {
    return (
      <div className="app-page bg-background">
        <Header onAddSubscription={handleAddSubscription} availableTags={availableTags} />
        <main className="app-main mx-auto max-w-7xl">
          <QueryErrorState
            error={subscriptionsQuery.error ?? sharingQuery.error}
            onRetry={() => {
              void subscriptionsQuery.refetch();
              void sharingQuery.refetch();
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="app-page bg-background">
      <Header onAddSubscription={handleAddSubscription} availableTags={availableTags} />

      <main className="app-main mx-auto max-w-7xl">
        {/* 统计网格 */}
        <div className={cn("mb-8", dashboardStatLayout.grid)} data-testid="dashboard-stat-grid">
          <StatCard
            data-testid="dashboard-stat-monthly-spend"
            title={t("dashboard.monthlySpend")}
            value={formatCurrency(totalMonthly, defaultCurrency)}
            subtitle={t("dashboard.monthlySpendSubtitle", {
              amount: formatCompactCurrencyAmount(totalDaily, defaultCurrency, locale),
              rates: ratesLoading ? t("dashboard.ratesLoading") : t("dashboard.realTimeRates", { currency: defaultCurrency }),
            })}
            icon={<CreditCard className="h-6 w-6" />}
            variant="primary"
            density="dashboard"
            className={cn("animate-fade-in", dashboardStatLayout.primaryCard)}
          />
          <StatCard
            data-testid="dashboard-stat-sharing-income"
            title={t("dashboard.sharingIncome")}
            value={formatCurrency(sharingIncome, defaultCurrency)}
            icon={<CircleDollarSign className="h-6 w-6" />}
            variant="primary"
            density="dashboard"
            className="animate-fade-in [animation-delay:100ms]"
          />
          <StatCard
            data-testid="dashboard-stat-sharing-profit"
            title={t("statistics.sharingProfit")}
            value={formatCurrency(sharingProfit, defaultCurrency)}
            icon={<ReceiptText className="h-6 w-6" />}
            variant={sharingProfit >= 0 ? "primary" : "warning"}
            density="dashboard"
            className="animate-fade-in [animation-delay:200ms]"
          />
        </div>

        <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
          <div className="mb-5 flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t("dashboard.taskCenter")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.taskCenterDescription")}</p>
            </div>
            <div className="grid grid-cols-3 rounded-lg bg-secondary p-1" aria-label={t("dashboard.taskCenter")}>
              {([
                ["all", t("dashboard.taskAll"), subscriptionRenewalCount + sharingRenewals.length],
                ["subscriptions", t("dashboard.taskSubscriptions"), subscriptionRenewalCount],
                ["members", t("dashboard.taskMembers"), sharingRenewals.length],
              ] as const).map(([value, label, count]) => (
                <button key={value} type="button" aria-pressed={taskFilter === value} onClick={() => setTaskFilter(value)} className={cn("min-h-9 rounded-md px-3 text-xs font-medium transition-colors", taskFilter === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {label} <span className="tabular-nums">{count}</span>
                </button>
              ))}
            </div>
          </div>

          {taskFilter !== "members" ? <div className="min-w-0">
            <div className="mb-3 flex min-h-10 items-center justify-between gap-3">
              <h3 className="font-semibold text-foreground">{t("dashboard.upcomingRenewals")}</h3>
              <Link href="/subscriptions"><Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">{t("dashboard.viewAll", { count: subscriptions.length })}<ArrowRight className="h-4 w-4" /></Button></Link>
            </div>
            {subscriptions.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-4 py-8 text-center">
                <h3 className="text-base font-semibold text-foreground">{t("dashboard.emptyTitle")}</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("dashboard.emptyDescription")}</p>
                <AddSubscriptionDialog
                  onAdd={handleAddSubscription}
                  availableTags={availableTags}
                  trigger={(
                    <Button className="mt-5 gap-2">
                      <Plus className="h-4 w-4" />
                      {t("subscriptions.addFirst")}
                    </Button>
                  )}
                />
              </div>
            ) : (
              <UpcomingRenewals
                subscriptions={subscriptions}
                today={today}
                notificationReminderDays={inheritedReminderDays}
                includeExpired
                limit={6}
              />
            )}
          </div> : null}

          {taskFilter !== "subscriptions" ? <div className={cn("min-w-0", taskFilter === "all" && "mt-6 border-t border-border pt-5")}>
            <div className="mb-3 flex min-h-10 items-center justify-between gap-3">
              <h3 className="font-semibold text-foreground">{t("sharing.upcomingRenewals")}</h3>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold tabular-nums text-muted-foreground">{sharingRenewals.length}</span>
            </div>
            <SharingUpcomingRenewals
              items={sharingRenewals}
              pending={sharingRenewalsPending}
              limit={6}
            />
          </div> : null}
        </section>
      </main>
    </div>
  );
}
