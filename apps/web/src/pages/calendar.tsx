/**
 * 续费日历页（/calendar）。
 *
 * 功能：
 * - 以日历方式展示订阅的 nextBillingDate
 * - 支持从日历点击订阅并进入编辑
 */

import { useMemo, useState } from 'react';
import type { SubscriptionCollectionItem } from '@/types/subscription';
import { Header } from '@/components/header';
import { BackToTopFloatButton } from '@/components/back-to-top-float-button';
import { SubscriptionCalendar } from '@/components/subscription-calendar';
import { EditSubscriptionDialog } from '@/components/edit-subscription-dialog';
import { CalendarPageSkeleton } from '@/components/loading-skeleton';
import { useRouteReady } from '@/components/route-progress';
import { QueryErrorState } from '@/components/query-error-state';
import { useSubscriptionCalendar, useSubscriptionFacets } from '@/hooks/use-subscriptions';
import { useI18n } from '@/i18n/I18nProvider';
import { useMediaQuery } from '@/hooks/use-media-query';
import { getSubscriptionCalendarRange } from '@/modules/subscriptions/domain/subscription-calendar-range';
import { useSubscriptionCrud } from '@/modules/subscriptions/application/use-subscription-crud';
import { useSharingAccountDetails, useSharingAccounts } from '@/hooks/use-sharing';
import { Badge } from '@/components/ui/badge';

const EMPTY_SUBSCRIPTIONS: SubscriptionCollectionItem[] = [];

/** 日历页组件。 */
const Calendar = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const range = useMemo(() => getSubscriptionCalendarRange(currentMonth), [currentMonth]);
  const subscriptionsQuery = useSubscriptionCalendar(range.from, range.to);
  const hasCalendarData = subscriptionsQuery.data !== undefined;
  useRouteReady(!hasCalendarData && subscriptionsQuery.isPending);
  const subscriptions = subscriptionsQuery.data ?? EMPTY_SUBSCRIPTIONS;
  const facetsQuery = useSubscriptionFacets();
  const sharingQuery = useSharingAccounts();
  const sharingDetails = useSharingAccountDetails((sharingQuery.data?.accounts ?? []).map((account) => account.id));
  const { t } = useI18n();
  const isMobileCalendarPage = useMediaQuery("(max-width: 639px)");
  const availableTags = facetsQuery.data?.tags ?? [];
  const expiringSeats = useMemo(() => sharingDetails.flatMap((query) => {
    const detail = query.data;
    if (!detail) return [];
    return detail.seats.filter((seat) => seat.status === 'active' && seat.expiresAt && seat.expiresAt >= range.from && seat.expiresAt <= range.to)
      .map((seat) => ({ account: detail.account, seat }));
  }).sort((left, right) => (left.seat.expiresAt ?? '').localeCompare(right.seat.expiresAt ?? '')), [range.from, range.to, sharingDetails]);
  const {
    editingSubscription,
    editingCollectionItem,
    editDialogOpen,
    editDetailPending,
    handleAddSubscription,
    handleEditSubscription,
    handleSaveSubscription,
    handleEditDialogOpenChange,
  } = useSubscriptionCrud(subscriptions);

  if (!hasCalendarData && subscriptionsQuery.isPending) {
    return (
      <div className="app-page bg-background">
        <Header onAddSubscription={handleAddSubscription} availableTags={availableTags} />
        <main className="app-main mx-auto max-w-7xl">
          <CalendarPageSkeleton withPageShell={false} />
        </main>
      </div>
    );
  }

  if (!hasCalendarData && subscriptionsQuery.error) {
    return (
      <div className="app-page bg-background">
        <Header onAddSubscription={handleAddSubscription} availableTags={availableTags} />
        <main className="app-main mx-auto max-w-7xl">
          <QueryErrorState error={subscriptionsQuery.error} onRetry={subscriptionsQuery.refetch} />
        </main>
      </div>
    );
  }

  return (
    <div className="app-page bg-background">
      <Header onAddSubscription={handleAddSubscription} availableTags={availableTags} />

      <main
        className="app-main mx-auto max-w-7xl"
        aria-busy={subscriptionsQuery.isFetching ? true : undefined}
      >
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">{t("calendar.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("calendar.pageSubtitle")}</p>
        </div>

        <SubscriptionCalendar 
          subscriptions={subscriptions} 
          currentMonth={currentMonth}
          onCurrentMonthChange={setCurrentMonth}
          onEditSubscription={handleEditSubscription}
        />

        <section className="mt-6 overflow-hidden rounded-lg border border-border bg-card" aria-label={t("calendar.sharingExpiries")}>
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">{t("calendar.sharingExpiries")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("calendar.sharingExpiriesHelp")}</p>
          </div>
          {expiringSeats.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t("calendar.noSharingExpiries")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {expiringSeats.map(({ account, seat }) => (
                <li key={seat.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <time className="font-medium tabular-nums text-foreground">{seat.expiresAt}</time>
                  <Badge variant="secondary">{account.subscription.platformName}</Badge>
                  <span className="min-w-0 flex-1 truncate text-foreground">{account.name} · {seat.memberName ?? t("sharing.noMember")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <EditSubscriptionDialog
        subscription={editingSubscription}
        loadingPreview={editingCollectionItem}
        open={editDialogOpen}
        onOpenChange={handleEditDialogOpenChange}
        onSave={handleSaveSubscription}
        availableTags={availableTags}
        loading={editDetailPending}
      />
      {/* 按需求日历页只在 H5 端启用，桌面端保持现有页面密度和视觉重心不变。 */}
      <BackToTopFloatButton enabled={isMobileCalendarPage} />
    </div>
  );
};

export default Calendar;
