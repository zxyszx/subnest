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
  sharingMonthlyRevenue,
  sharingUpcomingSeatRenewals,
} from "@/lib/sharing-financials";
import { buildUpcomingReminderItems } from "@/modules/subscriptions/domain/upcoming-reminders";
import { lazy, Suspense, useMemo, useState } from "react";
import { OperationsPanel } from "@/components/dashboard/operations-panels";
import {
  WorkspacePagination,
  useWorkspacePagination,
} from "@/components/workspace-pagination";
import { useWorkspaceCapacity } from "@/hooks/use-workspace-capacity";
import { useMediaQuery } from "@/hooks/use-media-query";
import { buildOperationsOverview } from "@/modules/subscriptions/domain/operations-overview";
import Link from "@/components/router-link";
import { DeferredRenewSubscriptionDialog } from "@/components/renew-subscription-dialog-loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
const SharingAccountDetailDialog = lazy(() =>
  import("@/components/sharing-account-detail-dialog").then((module) => ({
    default: module.SharingAccountDetailDialog,
  })),
);

const EMPTY_SUBSCRIPTIONS: SubscriptionCollectionItem[] = [];
const EMPTY_ACCOUNTS: SharingAccount[] = [];

/** 仪表盘页面组件。 */
export default function Index() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [setListContainer, pageSize] = useWorkspaceCapacity(88);
  const [subscriptionRenewalsOpen, setSubscriptionRenewalsOpen] =
    useState(false);
  const [renewalScope, setRenewalScope] = useState<"all" | "today" | "overdue">(
    "all",
  );
  const openSubscriptionRenewals = (
    scope: "all" | "today" | "overdue" = "all",
  ) => {
    setRenewalScope(scope);
    setSubscriptionRenewalsOpen(true);
  };
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
  const netIncome = sharingIncome - totalMonthly;
  const renewalPages = useWorkspacePagination(
    subscriptionRenewals,
    `${today}:${pageSize}`,
    pageSize,
  );
  const memberPages = useWorkspacePagination(
    sharingRenewals,
    `${today}:${pageSize}`,
    pageSize,
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
    <div className="app-page desktop-workbench bg-background">
      <Header
        onAddSubscription={handleAddSubscription}
        availableTags={availableTags}
      />

      <main
        className="app-main mx-auto max-w-[120rem]"
        data-testid="operations-dashboard"
      >
        <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
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
          className="workspace-summary grid grid-cols-2 gap-3 lg:grid-cols-4"
          data-testid="dashboard-stat-grid"
        >
          <StatCard
            data-testid="dashboard-stat-sharing-income"
            title={t("dashboard.averageIncome")}
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
            title={t("dashboard.averageNetIncome")}
            value={formatAmount(netIncome)}
            icon={<ReceiptText />}
            variant={netIncome >= 0 ? "primary" : "warning"}
            density="dashboard"
          />
          <Link
            href="/sharing?status=available"
            className="min-w-0 focus-visible:ring-2 focus-visible:ring-ring"
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
        <div className="mt-4 shrink-0 border-t border-border py-3">
          <OperationsPanel
            todayCount={
              subscriptionRenewals.filter((item) => item.daysUntil === 0).length
            }
            upcomingCount={subscriptionRenewals.length}
            overdueCount={
              subscriptionRenewals.filter((item) => item.daysUntil < 0).length
            }
            memberCount={sharingRenewals.length}
            onSubscriptions={openSubscriptionRenewals}
            onMembers={() => setMemberRenewalsOpen(true)}
          />
        </div>
        <div className="grid min-h-0 min-w-0 gap-6 lg:flex-1 lg:grid-cols-2">
          <section
            className="flex min-h-0 min-w-0 flex-col"
            id="dashboard-subscription-renewals"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {t("dashboard.subscriptionRenewals")}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 px-2 text-xs text-muted-foreground"
                onClick={() => openSubscriptionRenewals()}
              >
                {t("dashboard.viewAll", { count: subscriptionRenewals.length })}
              </Button>
            </div>
            <div ref={setListContainer} className="workspace-list-pane">
              <UpcomingRenewals
                subscriptions={
                  isDesktop
                    ? renewalPages.items.map((item) => item.subscription)
                    : subscriptions
                }
                today={today}
                notificationReminderDays={inheritedReminderDays}
                includeExpired
                windowDays={7}
                limit={isDesktop ? pageSize : 5}
                onRenew={handleRenewSubscription}
                density="compact"
              />
            </div>
            {isDesktop && <WorkspacePagination {...renewalPages} />}
          </section>
          <section
            id="dashboard-member-renewals"
            className="flex min-h-0 min-w-0 flex-col"
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
            <div className="workspace-list-pane">
              <SharingUpcomingRenewals
                items={isDesktop ? memberPages.items : sharingRenewals}
                pending={sharingRenewalsPending}
                limit={isDesktop ? pageSize : 5}
                showFooter={false}
                density="compact"
                onManageAccount={setSelectedSharingAccount}
              />
            </div>
            {isDesktop && <WorkspacePagination {...memberPages} />}
          </section>
        </div>
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
              {t(
                renewalScope === "today"
                  ? "dashboard.dueToday"
                  : renewalScope === "overdue"
                    ? "dashboard.overdue"
                    : "dashboard.subscriptionRenewals",
              )}
            </DialogTitle>
            <DialogDescription>
              {t("dashboard.subscriptionRenewalDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60dvh] overflow-y-auto px-1 pb-2 pt-2 scrollbar-gutter-stable sm:pr-4">
            <UpcomingRenewals
              subscriptions={subscriptions}
              today={today}
              notificationReminderDays={inheritedReminderDays}
              includeExpired
              scope={renewalScope}
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
