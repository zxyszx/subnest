/**
 * 仪表盘首页（/）。
 *
 * 经营总览与手动续费入口：
 * - 财务摘要：月均支出/合租月收入/合租月净利润
 * - 需要处理的订阅续费
 * - 需要处理的车友续费与收费
 *
 */

import type { SubscriptionCollectionItem } from "@/types/subscription";
import type { SharingAccount } from "@renewlet/shared/schemas/sharing";
import { Header } from "@/components/header";
import { StatCard } from "@/components/ui/stat-card";
import { UpcomingRenewals } from "@/components/upcoming-renewals";
import { SharingUpcomingRenewals } from "@/components/sharing-upcoming-renewals";
import { DashboardPageSkeleton } from "@/components/loading-skeleton";
import { QueryErrorState } from "@/components/query-error-state";
import {
  CreditCard,
  CircleDollarSign,
  ReceiptText,
  CalendarClock,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportExchangeRates } from "@/hooks/use-report-exchange-rates";
import {
  useSubscriptionAnalytics,
  useSubscriptionFacets,
} from "@/hooks/use-subscriptions";
import { useSettings } from "@/hooks/use-settings";
import { useDashboardStats } from "@/modules/subscriptions/application/use-dashboard-stats";
import { useSubscriptionCrud } from "@/modules/subscriptions/application/use-subscription-crud";
import { useI18n } from "@/i18n/I18nProvider";
import { DEFAULT_NOTIFICATION_REMINDER_DAYS } from "@/types/subscription";
import { useZonedToday } from "@/hooks/use-zoned-today";
import { formatCompactCurrencyAmount } from "@/lib/currency";
import { useRouteReady } from "@/components/route-progress";
import {
  useSharingAccountDetails,
  useSharingAccounts,
} from "@/hooks/use-sharing";
import {
  sharingMonthlyProfit,
  sharingMonthlyRevenue,
  sharingUpcomingSeatRenewals,
} from "@/lib/sharing-financials";
import { buildUpcomingReminderItems } from "@/modules/subscriptions/domain/upcoming-reminders";
import { lazy, Suspense, useMemo, useState } from "react";
import {
  InsightPanels,
  OperationsPanel,
  PlatformPanel,
} from "@/components/dashboard/operations-panels";
import {
  buildOperationsOverview,
  buildOperationsForecast,
} from "@/modules/subscriptions/domain/operations-overview";
import { daysBetweenDateOnly } from "@/lib/time/date-only";
import Link from "@/components/router-link";
import { DeferredRenewSubscriptionDialog } from "@/components/renew-subscription-dialog-loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
const RevenueChart = lazy(() =>
  import("@/components/dashboard/revenue-chart").then((module) => ({
    default: module.RevenueChart,
  })),
);

const SharingAccountDetailDialog = lazy(() =>
  import("@/components/sharing-account-detail-dialog").then((module) => ({
    default: module.SharingAccountDetailDialog,
  })),
);

const EMPTY_SUBSCRIPTIONS: SubscriptionCollectionItem[] = [];
const EMPTY_ACCOUNTS: SharingAccount[] = [];

/** 仪表盘页面组件。 */
export default function Index() {
  const [subscriptionRenewalsOpen, setSubscriptionRenewalsOpen] =
    useState(false);
  const [memberRenewalsOpen, setMemberRenewalsOpen] = useState(false);
  const [selectedSharingAccount, setSelectedSharingAccount] =
    useState<SharingAccount | null>(null);
  const subscriptionsQuery = useSubscriptionAnalytics();
  const subscriptions = subscriptionsQuery.data ?? EMPTY_SUBSCRIPTIONS;
  const facetsQuery = useSubscriptionFacets();
  const settingsQuery = useSettings();
  const sharingQuery = useSharingAccounts();
  useRouteReady(
    subscriptionsQuery.isPending ||
      settingsQuery.isPending ||
      sharingQuery.isPending,
  );
  const settings = settingsQuery.data;
  const { t, locale, formatDateTime } = useI18n();
  const exchangeRateProvider = settings?.exchangeRateProvider;
  const { convert, loading: ratesLoading } =
    useReportExchangeRates(exchangeRateProvider);
  const defaultCurrency = settings?.defaultCurrency ?? "CNY";
  const sharingAccounts = sharingQuery.data?.accounts ?? EMPTY_ACCOUNTS;
  const sharingDetailQueries = useSharingAccountDetails(
    sharingAccounts.map((account) => account.id),
  );
  const sharingIncome = sharingAccounts.reduce(
    (total, account) =>
      total + sharingMonthlyRevenue(account, defaultCurrency, convert),
    0,
  );
  const sharingProfit = sharingAccounts.reduce(
    (total, account) =>
      total + sharingMonthlyProfit(account, defaultCurrency, convert),
    0,
  );
  const timeZone = settings?.timezone ?? "UTC";
  const inheritedReminderDays =
    settings?.notificationReminderDays ?? DEFAULT_NOTIFICATION_REMINDER_DAYS;
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
    sharingDetailQueries.flatMap((query) => (query.data ? [query.data] : [])),
    today,
    7,
    true,
  );
  const sharingRenewalsPending = sharingDetailQueries.some(
    (query) => query.isPending,
  );
  const subscriptionRenewals = buildUpcomingReminderItems({
    subscriptions,
    today,
    notificationReminderDays: 7,
    includeExpired: true,
    ignoreSubscriptionReminder: true,
  });
  const sharingDetails = sharingDetailQueries.flatMap((query) =>
    query.data ? [query.data] : [],
  );
  const detailsIncomplete = sharingDetailQueries.some((query) => query.isError);
  const overview = useMemo(
    () =>
      buildOperationsOverview(
        sharingAccounts,
        subscriptions,
        defaultCurrency,
        convert,
        today,
      ),
    [sharingAccounts, subscriptions, defaultCurrency, convert, today],
  );
  const forecast = useMemo(
    () =>
      buildOperationsForecast(
        subscriptions,
        sharingDetails,
        today,
        defaultCurrency,
        convert,
      ),
    [subscriptions, sharingDetails, today, defaultCurrency, convert],
  );
  const stoppedSeats = sharingDetails.reduce(
    (sum, detail) =>
      sum +
      detail.seats.filter(
        (seat) =>
          seat.memberName &&
          (seat.status === "paused" ||
            (seat.status === "active" &&
              seat.expiresAt &&
              daysBetweenDateOnly(today, seat.expiresAt) < 0)),
      ).length,
    0,
  );
  const formatAmount = (value: number) =>
    formatCompactCurrencyAmount(value, defaultCurrency, locale);

  // 只有页面主数据还没有首屏结果时才展示骨架屏。
  // 汇率刷新期间保留已有内容，并在统计卡片副标题里提示加载状态，避免整页闪回 loading。
  if (
    subscriptionsQuery.isPending ||
    settingsQuery.isPending ||
    sharingQuery.isPending
  ) {
    return (
      <div className="app-page bg-background">
        <Header
          onAddSubscription={handleAddSubscription}
          availableTags={availableTags}
        />
        <main className="app-main mx-auto max-w-[120rem]">
          <DashboardPageSkeleton withPageShell={false} />
        </main>
      </div>
    );
  }

  if (subscriptionsQuery.error || sharingQuery.error) {
    return (
      <div className="app-page bg-background">
        <Header
          onAddSubscription={handleAddSubscription}
          availableTags={availableTags}
        />
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
      <Header
        onAddSubscription={handleAddSubscription}
        availableTags={availableTags}
      />

      <main
        className="app-main mx-auto max-w-[120rem] lg:px-6 lg:py-6"
        data-testid="operations-dashboard"
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">
              {t("dashboard.overview")}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("dashboard.overviewHint")}
            </p>
          </div>
          <span className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            {formatDateTime(new Date(`${today}T12:00:00`), {
              year: "numeric",
              month: "long",
            })}
          </span>
        </div>
        <div
          className="grid grid-cols-2 gap-3 lg:grid-cols-5"
          data-testid="dashboard-stat-grid"
        >
          <StatCard
            data-testid="dashboard-stat-sharing-income"
            title={t("dashboard.sharingIncome")}
            value={formatAmount(sharingIncome)}
            icon={<CircleDollarSign />}
            variant="primary"
            density="dashboard"
          />
          <StatCard
            data-testid="dashboard-stat-monthly-spend"
            title={t("dashboard.monthlySpend")}
            value={formatAmount(totalMonthly)}
            subtitle={t("dashboard.monthlySpendSubtitle", {
              amount: formatAmount(totalDaily),
              rates: ratesLoading
                ? t("dashboard.ratesLoading")
                : t("dashboard.realTimeRates", { currency: defaultCurrency }),
            })}
            icon={<CreditCard />}
            density="dashboard"
          />
          <StatCard
            data-testid="dashboard-stat-sharing-profit"
            title={t("statistics.sharingProfit")}
            value={formatAmount(sharingProfit)}
            icon={<ReceiptText />}
            variant={sharingProfit >= 0 ? "primary" : "warning"}
            density="dashboard"
          />
          <StatCard
            data-testid="dashboard-stat-active"
            title={t("dashboard.active")}
            value={overview.active}
            icon={<CalendarClock />}
            density="dashboard"
          />
          <Link
            href="/sharing?status=available"
            className="col-span-2 min-w-0 focus-visible:ring-2 focus-visible:ring-ring lg:col-span-1"
          >
            <StatCard
              data-testid="dashboard-stat-vacancies"
              title={t("dashboard.vacancies")}
              value={overview.vacancies}
              subtitle={t("dashboard.capacity", {
                used: overview.occupied,
                total: overview.capacity,
              })}
              icon={<UsersRound />}
              density="dashboard"
            />
          </Link>
        </div>
        {detailsIncomplete && (
          <p className="mt-3 text-sm text-destructive" role="status">
            {t("dashboard.detailsIncomplete")}
          </p>
        )}
        <div className="mt-6 grid min-w-0 gap-6 border-y border-border py-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(210px,0.7fr)_minmax(280px,1fr)]">
          <Suspense
            fallback={
              <div className="h-80 animate-pulse rounded-md bg-secondary" />
            }
          >
            <RevenueChart
              data={forecast}
              currency={defaultCurrency}
              pending={sharingRenewalsPending || detailsIncomplete}
            />
          </Suspense>
          <OperationsPanel
            todayCount={
              subscriptionRenewals.filter((item) => item.daysUntil === 0).length
            }
            upcomingCount={subscriptionRenewals.length}
            overdueCount={
              subscriptionRenewals.filter((item) => item.daysUntil < 0).length
            }
            memberCount={sharingRenewals.length}
            onSubscriptions={() => setSubscriptionRenewalsOpen(true)}
            onMembers={() => setMemberRenewalsOpen(true)}
          />
          <section className="min-w-0" id="dashboard-subscription-renewals">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {t("dashboard.subscriptionRenewals")}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 px-2 text-xs text-muted-foreground"
                onClick={() => setSubscriptionRenewalsOpen(true)}
              >
                {t("dashboard.viewAll", { count: subscriptionRenewals.length })}
              </Button>
            </div>
            <UpcomingRenewals
              subscriptions={subscriptions}
              today={today}
              notificationReminderDays={inheritedReminderDays}
              includeExpired
              windowDays={7}
              limit={5}
              onRenew={handleRenewSubscription}
              density="compact"
            />
          </section>
        </div>
        <PlatformPanel overview={overview} currency={defaultCurrency} />
        <InsightPanels
          overview={overview}
          currency={defaultCurrency}
          stoppedSeats={stoppedSeats}
          onManage={setSelectedSharingAccount}
        />
        <section
          id="dashboard-member-renewals"
          className="border-t border-border py-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {t("dashboard.memberRenewals")}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-11"
              onClick={() => setMemberRenewalsOpen(true)}
            >
              {t("dashboard.viewAll", { count: sharingRenewals.length })}
            </Button>
          </div>
          <SharingUpcomingRenewals
            items={sharingRenewals}
            pending={sharingRenewalsPending}
            limit={5}
            showFooter={false}
            density="compact"
            onManageAccount={setSelectedSharingAccount}
          />
        </section>
      </main>

      <Dialog
        open={subscriptionRenewalsOpen}
        onOpenChange={setSubscriptionRenewalsOpen}
      >
        <DialogContent
          className="max-w-2xl bg-card"
          closeLabel={t("common.close")}
        >
          <DialogHeader>
            <DialogTitle>
              {t("dashboard.subscriptionRenewalDialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("dashboard.subscriptionRenewalDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60dvh] overflow-y-auto pr-1">
            <UpcomingRenewals
              subscriptions={subscriptions}
              today={today}
              notificationReminderDays={inheritedReminderDays}
              includeExpired
              windowDays={7}
              limit={100}
              onRenew={(id) => {
                setSubscriptionRenewalsOpen(false);
                handleRenewSubscription(id);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={memberRenewalsOpen} onOpenChange={setMemberRenewalsOpen}>
        <DialogContent
          className="max-w-2xl bg-card"
          closeLabel={t("common.close")}
        >
          <DialogHeader>
            <DialogTitle>{t("dashboard.memberRenewalDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("dashboard.memberRenewalDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60dvh] overflow-y-auto pr-1">
            <SharingUpcomingRenewals
              items={sharingRenewals}
              pending={sharingRenewalsPending}
              limit={100}
              showFooter={false}
              onManageAccount={(account) => {
                setMemberRenewalsOpen(false);
                setSelectedSharingAccount(account);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {selectedSharingAccount ? (
        <Suspense fallback={null}>
          <SharingAccountDetailDialog
            account={selectedSharingAccount}
            mode="seats"
            open
            onOpenChange={(open) => !open && setSelectedSharingAccount(null)}
          />
        </Suspense>
      ) : null}

      <DeferredRenewSubscriptionDialog
        subscription={subscriptionCrud.renewingSubscription}
        loadingPreview={subscriptionCrud.renewingCollectionItem}
        open={subscriptionCrud.renewDialogOpen}
        today={today}
        submitting={subscriptionCrud.renewSubmitting}
        error={
          subscriptionCrud.renewError instanceof Error
            ? subscriptionCrud.renewError.message
            : null
        }
        restoreFocusRef={subscriptionCrud.renewRestoreFocusRef}
        onOpenChange={subscriptionCrud.handleRenewDialogOpenChange}
        onSubmit={subscriptionCrud.handleSubmitRenewSubscription}
        loading={subscriptionCrud.renewDetailPending}
      />
    </div>
  );
}
