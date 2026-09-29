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
import { CreditCard, Plus, CircleDollarSign, ReceiptText, ArrowRight, CalendarClock, UsersRound } from "lucide-react";
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
import { DashboardRenewalCalendar } from "@/components/dashboard-renewal-calendar";
import { DeferredRenewSubscriptionDialog } from "@/components/renew-subscription-dialog-loader";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/use-media-query";

const EMPTY_SUBSCRIPTIONS: SubscriptionCollectionItem[] = [];

/** 仪表盘页面组件。 */
export default function Index() {
  const [subscriptionRenewalsOpen, setSubscriptionRenewalsOpen] = useState(false);
  const [memberRenewalsOpen, setMemberRenewalsOpen] = useState(false);
  const [renewalTaskTab, setRenewalTaskTab] = useState<"subscriptions" | "members">("subscriptions");
  const isCompactRenewalLayout = useMediaQuery("(max-width: 1023px)");
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
  const subscriptionCrud = useSubscriptionCrud(subscriptions);
  const { handleAddSubscription, handleRenewSubscription } = subscriptionCrud;
  const sharingRenewals = sharingUpcomingSeatRenewals(
    sharingDetailQueries.flatMap((query) => query.data ? [query.data] : []),
    today,
    7,
    true,
  );
  const sharingRenewalsPending = sharingDetailQueries.some((query) => query.isPending);
  const subscriptionRenewals = buildUpcomingReminderItems({
    subscriptions,
    today,
    notificationReminderDays: 7,
    ignoreSubscriptionReminder: true,
  });
  const subscriptionRenewalCount = subscriptionRenewals.length;
  const memberRenewalCount = sharingRenewals.filter((item) => item.daysUntilExpiry >= 0).length;
  const sharingDetails = sharingDetailQueries.flatMap((query) => query.data ? [query.data] : []);

  // 只有页面主数据还没有首屏结果时才展示骨架屏。
  // 汇率刷新期间保留已有内容，并在统计卡片副标题里提示加载状态，避免整页闪回 loading。
  if (subscriptionsQuery.isPending || settingsQuery.isPending || sharingQuery.isPending) {
    return (
      <div className="app-page bg-background">
        <Header onAddSubscription={handleAddSubscription} availableTags={availableTags} />
        <main className="app-main mx-auto max-w-[120rem]">
          <DashboardPageSkeleton withPageShell={false} />
        </main>
      </div>
    );
  }

  if (subscriptionsQuery.error || sharingQuery.error) {
    return (
      <div className="app-page bg-background">
        <Header onAddSubscription={handleAddSubscription} availableTags={availableTags} />
        <main className="app-main mx-auto max-w-[120rem]">
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

      <main className="app-main mx-auto max-w-[1504px] lg:flex lg:flex-col lg:!pt-2.5 xl:px-7 xl:pb-4">
        {/* 统计网格 */}
        <div className={cn("mb-2.5", dashboardStatLayout.grid)} data-testid="dashboard-stat-grid">
          <StatCard
            data-testid="dashboard-stat-monthly-spend"
            title={t("dashboard.monthlySpend")}
            value={<><span className="sm:hidden">{formatCompactCurrencyAmount(totalMonthly, defaultCurrency, locale)}</span><span className="hidden sm:inline">{formatCurrency(totalMonthly, defaultCurrency)}</span></>}
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
            value={<><span className="sm:hidden">{formatCompactCurrencyAmount(sharingIncome, defaultCurrency, locale)}</span><span className="hidden sm:inline">{formatCurrency(sharingIncome, defaultCurrency)}</span></>}
            icon={<CircleDollarSign className="h-6 w-6" />}
            variant="primary"
            density="dashboard"
            className="animate-fade-in [animation-delay:100ms]"
          />
          <StatCard
            data-testid="dashboard-stat-sharing-profit"
            title={t("statistics.sharingProfit")}
            value={<><span className="sm:hidden">{formatCompactCurrencyAmount(sharingProfit, defaultCurrency, locale)}</span><span className="hidden sm:inline">{formatCurrency(sharingProfit, defaultCurrency)}</span></>}
            icon={<ReceiptText className="h-6 w-6" />}
            variant={sharingProfit >= 0 ? "primary" : "warning"}
            density="dashboard"
            className="animate-fade-in [animation-delay:200ms]"
          />
          <StatCard
            data-testid="dashboard-stat-subscription-renewals"
            title={t("dashboard.subscriptionRenewals")}
            value={subscriptionRenewalCount}
            subtitle={t("dashboard.withinSevenDays")}
            icon={<CalendarClock />}
            aria-label={t("dashboard.openSubscriptionRenewals")}
            onClick={() => setSubscriptionRenewalsOpen(true)}
            variant={subscriptionRenewalCount > 0 ? "warning" : "default"}
            density="dashboard"
            className="animate-fade-in [animation-delay:300ms]"
          />
          <StatCard
            data-testid="dashboard-stat-member-renewals"
            title={t("dashboard.memberRenewals")}
            value={memberRenewalCount}
            subtitle={t("dashboard.withinSevenDays")}
            icon={<UsersRound />}
            aria-label={t("dashboard.openMemberRenewals")}
            onClick={() => setMemberRenewalsOpen(true)}
            variant={memberRenewalCount > 0 ? "warning" : "default"}
            density="dashboard"
            className="animate-fade-in [animation-delay:400ms]"
          />
        </div>

        <DashboardRenewalCalendar
          subscriptions={subscriptions}
          sharingDetails={sharingDetails}
          today={today}
          defaultCurrency={defaultCurrency}
          convert={convert}
        />

        {isCompactRenewalLayout ? <section className="mt-2.5" aria-label={t("dashboard.renewalTasks")}>
          <Tabs value={renewalTaskTab} onValueChange={(value) => setRenewalTaskTab(value as "subscriptions" | "members")}>
            <article className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-card">
              <div className="mb-2">
                <TabsList className="grid h-9 w-full grid-cols-2 rounded-md border border-border bg-secondary/60 p-0.5 sm:w-80">
                  <TabsTrigger value="subscriptions" className="h-8 gap-1.5 rounded-[5px] px-2 text-xs shadow-none data-[state=active]:bg-card data-[state=active]:shadow-none sm:text-sm">
                    {t("dashboard.subscriptionRenewals")}
                    <span className="tabular-nums text-muted-foreground">{subscriptionRenewals.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="members" className="h-8 gap-1.5 rounded-[5px] px-2 text-xs shadow-none data-[state=active]:bg-card data-[state=active]:shadow-none sm:text-sm">
                    {t("dashboard.memberRenewals")}
                    <span className="tabular-nums text-muted-foreground">{sharingRenewals.length}</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent id="dashboard-subscription-renewals" value="subscriptions" className="mt-0">
                <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-muted-foreground">{t("dashboard.renewalListDescription")}</p>
                  <Link href="/subscriptions"><Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground">{t("dashboard.viewAll", { count: subscriptions.length })}<ArrowRight className="h-4 w-4" /></Button></Link>
                </div>
                {subscriptions.length === 0 ? (
                  <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-4 py-6 text-center">
                    <h3 className="text-base font-semibold text-foreground">{t("dashboard.emptyTitle")}</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("dashboard.emptyDescription")}</p>
                    <AddSubscriptionDialog
                      onAdd={handleAddSubscription}
                      availableTags={availableTags}
                      trigger={(
                        <Button className="mt-4 gap-2">
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
                    windowDays={7}
                    limit={5}
                    onRenew={handleRenewSubscription}
                  />
                )}
              </TabsContent>

              <TabsContent id="dashboard-member-renewals" value="members" className="mt-0">
                <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-muted-foreground">{t("dashboard.memberRenewalListDescription")}</p>
                  <Link href="/sharing"><Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground">{t("dashboard.viewAll", { count: sharingRenewals.length })}<ArrowRight className="h-4 w-4" /></Button></Link>
                </div>
                <SharingUpcomingRenewals
                  items={sharingRenewals}
                  pending={sharingRenewalsPending}
                  limit={5}
                  showFooter={false}
                />
              </TabsContent>
            </article>
          </Tabs>
        </section> : (
          <section className="mt-2.5 grid items-stretch gap-2.5 lg:grid-cols-2" aria-label={t("dashboard.renewalTasks")}>
            <article id="dashboard-subscription-renewals" className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 shadow-card">
              <h2 className="font-semibold text-foreground">{t("dashboard.subscriptionRenewals")}</h2>
              <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs text-muted-foreground">{t("dashboard.renewalListDescription")}</p>
                <Link href="/subscriptions"><Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground">{t("dashboard.viewAll", { count: subscriptions.length })}<ArrowRight className="h-4 w-4" /></Button></Link>
              </div>
              <div className="flex flex-1 flex-col">
                {subscriptions.length === 0 ? (
                  <div className="flex min-h-36 flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-4 py-6 text-center">
                    <h3 className="text-base font-semibold text-foreground">{t("dashboard.emptyTitle")}</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("dashboard.emptyDescription")}</p>
                    <AddSubscriptionDialog
                      onAdd={handleAddSubscription}
                      availableTags={availableTags}
                      trigger={(
                        <Button className="mt-4 gap-2">
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
                    windowDays={7}
                    limit={5}
                    onRenew={handleRenewSubscription}
                  />
                )}
              </div>
            </article>

            <article id="dashboard-member-renewals" className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 shadow-card">
              <h2 className="font-semibold text-foreground">{t("dashboard.memberRenewals")}</h2>
              <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs text-muted-foreground">{t("dashboard.memberRenewalListDescription")}</p>
                <Link href="/sharing"><Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground">{t("dashboard.viewAll", { count: sharingRenewals.length })}<ArrowRight className="h-4 w-4" /></Button></Link>
              </div>
              <div className="flex flex-1 flex-col">
                <SharingUpcomingRenewals
                  items={sharingRenewals}
                  pending={sharingRenewalsPending}
                  limit={5}
                  showFooter={false}
                />
              </div>
            </article>
          </section>
        )}
      </main>

      <Dialog open={subscriptionRenewalsOpen} onOpenChange={setSubscriptionRenewalsOpen}>
        <DialogContent className="max-w-2xl bg-card" closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("dashboard.subscriptionRenewalDialogTitle")}</DialogTitle>
            <DialogDescription>{t("dashboard.subscriptionRenewalDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60dvh] overflow-y-auto pr-1">
            <UpcomingRenewals subscriptions={subscriptions} today={today} notificationReminderDays={inheritedReminderDays} windowDays={7} limit={100} onRenew={(id) => { setSubscriptionRenewalsOpen(false); handleRenewSubscription(id); }} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={memberRenewalsOpen} onOpenChange={setMemberRenewalsOpen}>
        <DialogContent className="max-w-2xl bg-card" closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("dashboard.memberRenewalDialogTitle")}</DialogTitle>
            <DialogDescription>{t("dashboard.memberRenewalDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60dvh] overflow-y-auto pr-1">
            <SharingUpcomingRenewals items={sharingRenewals.filter((item) => item.daysUntilExpiry >= 0)} pending={sharingRenewalsPending} limit={100} />
          </div>
        </DialogContent>
      </Dialog>

      <DeferredRenewSubscriptionDialog
        subscription={subscriptionCrud.renewingSubscription}
        loadingPreview={subscriptionCrud.renewingCollectionItem}
        open={subscriptionCrud.renewDialogOpen}
        today={today}
        submitting={subscriptionCrud.renewSubmitting}
        error={subscriptionCrud.renewError instanceof Error ? subscriptionCrud.renewError.message : null}
        restoreFocusRef={subscriptionCrud.renewRestoreFocusRef}
        onOpenChange={subscriptionCrud.handleRenewDialogOpenChange}
        onSubmit={subscriptionCrud.handleSubmitRenewSubscription}
        loading={subscriptionCrud.renewDetailPending}
      />
    </div>
  );
}
