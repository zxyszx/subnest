/**
 * 订阅列表页（/subscriptions）。
 *
 * 功能：
 * - 列表/网格两种视图
 * - 搜索/分类/状态/标签筛选
 * - 新增/编辑/删除订阅
 * - 导出 JSON / CSV
 *
 * 架构位置：
 * - 筛选、导出、CRUD 状态分别由 application hooks 管理。
 * - 页面保留视图模式和布局，不承载业务规则。
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { BackToTopFloatButton } from '@/components/back-to-top-float-button';
import { SubscriptionGrid } from '@/components/subscription-grid';
import { AddToCalendarDialog } from '@/components/add-to-calendar-dialog';
import { DeferredRenewSubscriptionDialog } from '@/components/renew-subscription-dialog-loader';
import {
  DeferredImportDataDialog,
  preloadImportDataDialog,
} from '@/components/import-data-dialog-loader';
import {
  DeferredAIRecognizeSubscriptionDialog,
  preloadAIRecognizeSubscriptionDialog,
} from '@/components/ai-recognize-subscription-dialog-loader';
import { SubscriptionsPageSkeleton } from '@/components/loading-skeleton';
import { useRouteReady } from '@/components/route-progress';
import { SubscriptionCategoryFilter } from '@/components/subscription-category-filter';
import { QueryErrorState } from '@/components/query-error-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Subscription, SubscriptionCollectionItem } from '@/types/subscription';
import { DEFAULT_NOTIFICATION_REMINDER_DAYS, DEFAULT_SETTINGS } from '@/types/subscription';
import { Search, Plus, Grid, List as ListIcon, Download, Upload, Sparkles, Funnel } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useInfiniteSubscriptions,
  useSubscriptionFacets,
  useSubscriptionIndex,
} from '@/hooks/use-subscriptions';
import { useCustomConfigState } from '@/contexts/CustomConfigContext';
import { useSettingsEnvelope } from '@/hooks/use-settings';
import { useSubscriptionCrud } from '@/modules/subscriptions/application/use-subscription-crud';
import { useSubscriptionExport } from '@/modules/subscriptions/application/use-subscription-export';
import { useSubscriptionFilters } from '@/modules/subscriptions/application/use-subscription-filters';
import type { SubscriptionSortOption } from '@/modules/subscriptions/domain/subscription-filters';
import { resolveSubscriptionPriceReferenceCurrency } from '@/modules/subscriptions/domain/subscription-price-reference';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import { useI18n } from '@/i18n/I18nProvider';
import { subscriptionPlatformName, UNBOUND_PLATFORM_VALUE } from '@/lib/subscription-platform';
import { getConfigItemLabel } from '@/types/config';
import type { MessageKey } from '@/i18n/messages';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useSubscriptionDetailDialog } from '@/hooks/use-subscription-detail-dialog';
import { useSubscriptionCalendarDialog } from '@/hooks/use-subscription-calendar-dialog';
import { useZonedToday } from '@/hooks/use-zoned-today';
import { syncSubscriptionCollectionBoundary } from '@/hooks/subscription-query-cache';

const PlatformFilterBar = lazy(() => import('@/components/platform-filter-bar'));
const AddSubscriptionDialog = lazy(async () => {
  const module = await import('@/components/add-subscription-dialog');
  return { default: module.AddSubscriptionDialog };
});
const EditSubscriptionDialog = lazy(async () => {
  const module = await import('@/components/edit-subscription-dialog');
  return { default: module.EditSubscriptionDialog };
});
const SubscriptionDialog = lazy(async () => {
  const module = await import('@/components/subscription-dialog');
  return { default: module.SubscriptionDialog };
});
const SubscriptionDetailDialog = lazy(async () => {
  const module = await import('@/components/subscription-detail-dialog');
  return { default: module.SubscriptionDetailDialog };
});

/** 空订阅数组：用于在数据未加载完成时提供稳定引用，避免 useMemo 依赖抖动。 */
const EMPTY_SUBSCRIPTIONS: SubscriptionCollectionItem[] = [];
const SORT_OPTION_LABEL_KEYS: Record<SubscriptionSortOption, MessageKey> = {
  default: "subscriptions.sort.default",
  renewal_asc: "subscriptions.sort.renewalAsc",
  renewal_desc: "subscriptions.sort.renewalDesc",
  monthly_cost_desc: "subscriptions.sort.monthlyCostDesc",
  monthly_cost_asc: "subscriptions.sort.monthlyCostAsc",
  price_desc: "subscriptions.sort.priceDesc",
  price_asc: "subscriptions.sort.priceAsc",
  name_asc: "subscriptions.sort.nameAsc",
  name_desc: "subscriptions.sort.nameDesc",
  account_asc: "subscriptions.sort.accountAsc",
  account_desc: "subscriptions.sort.accountDesc",
};
const SORT_OPTIONS: Exclude<SubscriptionSortOption, "default">[] = [
  "renewal_asc",
  "account_asc",
  "account_desc",
];

/** 订阅列表页组件。 */
const Subscriptions = () => {
  const settingsQuery = useSettingsEnvelope();
  const timeZone = settingsQuery.data?.settings.timezone ?? "UTC";
  const today = useZonedToday(timeZone);
  const queryClient = useQueryClient();
  const collectionBoundary = settingsQuery.data ? `${timeZone}:${today}` : null;
  useEffect(() => {
    if (collectionBoundary) void syncSubscriptionCollectionBoundary(queryClient, collectionBoundary);
  }, [collectionBoundary, queryClient]);

  const subscriptionsQuery = useInfiniteSubscriptions();
  const subscriptions = subscriptionsQuery.subscriptions ?? EMPTY_SUBSCRIPTIONS;
  const facetsQuery = useSubscriptionFacets();
  const { fetchNextPage } = subscriptionsQuery;
  const defaultCurrency = settingsQuery.data?.settings.defaultCurrency ?? "CNY";
  const exchangeRateProvider = settingsQuery.data?.settings.exchangeRateProvider;
  const inheritedReminderDays = settingsQuery.data?.settings.notificationReminderDays ?? DEFAULT_NOTIFICATION_REMINDER_DAYS;
  const { config } = useCustomConfigState();
  const categoryByValue = useMemo(() => new Map(config.categories.map((category) => [category.value, category])), [config.categories]);
  const paymentMethodByValue = useMemo(() => new Map(config.paymentMethods.map((method) => [method.value, method])), [config.paymentMethods]);
  const { t, locale } = useI18n();
  const { convert, loading: ratesLoading, sourceDate: ratesSourceDate } = useExchangeRates(exchangeRateProvider);
  const currencyRatesReady = Boolean(ratesSourceDate) && !ratesLoading;
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [aiRecognitionDialogOpen, setAIRecognitionDialogOpen] = useState(false);
  const [mobileFiltersExpanded, setMobileFiltersExpanded] = useState(false);
  const isMobileTagFilter = useMediaQuery("(max-width: 767px)");
  const {
    searchQuery,
    setSearchQuery,
    selectedCategories: _selectedCategories,
    paymentTypeFilter: _paymentTypeFilter,
    sortOption,
    setSortOption,
    selectedTags: _selectedTags,
    advancedFilters: _advancedFilters,
    allTags,
    sortSubscriptionsForDisplay,
    selectSubscriptionsForExport,
    subscriptionListFilters,
    hasActiveFilters,
    needsCollectionIndex,
    clearFilters,
  } = useSubscriptionFilters({
    defaultCurrency,
    convert,
    locale,
    today,
    availableTags: facetsQuery.data?.tags ?? [],
  });
  const numericAccountSearch = /^\d+$/.test(searchQuery.trim());
  const useFilteredIndex = !numericAccountSearch && (needsCollectionIndex || selectedPlatform !== null);
  const indexQuery = useSubscriptionIndex(subscriptionListFilters, useFilteredIndex);
  const platformIndexQuery = useSubscriptionIndex(undefined, true);
  const platformOptions = useMemo(() => {
    type PlatformOption = {
      name: string;
      label?: string;
      value?: string;
      logo: string | null | undefined;
      accounts: { id: string; accountNumber: number }[];
    };
    const platforms = new Map<string, PlatformOption>();
    for (const item of config.platforms ?? []) {
      platforms.set(item.value, {
        name: item.value,
        value: item.value,
        label: getConfigItemLabel(item, locale),
        logo: item.icon,
        accounts: [],
      });
    }
    for (const subscription of platformIndexQuery.data?.subscriptions ?? EMPTY_SUBSCRIPTIONS) {
      const platformName = subscriptionPlatformName(subscription);
      const platform: PlatformOption = platforms.get(platformName) ?? {
        name: platformName,
        value: platformName,
        logo: subscription.logo,
        accounts: [],
      };
      platform.accounts.push({ id: subscription.id, accountNumber: subscription.accountNumber ?? 1 });
      if (!platform.logo && subscription.logo) platform.logo = subscription.logo;
      platforms.set(platformName, platform);
    }
    platforms.set(UNBOUND_PLATFORM_VALUE, {
      name: UNBOUND_PLATFORM_VALUE,
      label: "未绑定",
      value: UNBOUND_PLATFORM_VALUE,
      logo: null,
      accounts: [],
    });
    return Array.from(platforms.values());
  }, [config.platforms, locale, platformIndexQuery.data?.subscriptions]);
  const indexedSubscriptions = indexQuery.data?.subscriptions ?? EMPTY_SUBSCRIPTIONS;
  const displaySourceSubscriptions = numericAccountSearch
    ? (platformIndexQuery.data?.subscriptions ?? EMPTY_SUBSCRIPTIONS)
    : useFilteredIndex ? indexedSubscriptions : subscriptions;
  // 先选择分页或全库索引，再只排序实际展示的数据；索引模式不能附带重排未展示的分页列表。
  const filteredSubscriptions = useMemo(() => {
    const accountSubscriptions = numericAccountSearch
      ? displaySourceSubscriptions.filter((subscription) => String(subscription.accountNumber ?? 1) === searchQuery.trim())
      : displaySourceSubscriptions;
    const platformSubscriptions = selectedPlatform
      ? accountSubscriptions.filter(
          (subscription) => selectedPlatform === UNBOUND_PLATFORM_VALUE
            ? subscriptionPlatformName(subscription) === ""
            : subscriptionPlatformName(subscription) === selectedPlatform,
        )
      : accountSubscriptions;
    if (selectedPlatform && sortOption === "default") {
      return [...platformSubscriptions].sort((left, right) => (
        (left.accountNumber ?? Number.MAX_SAFE_INTEGER) - (right.accountNumber ?? Number.MAX_SAFE_INTEGER)
        || left.name.localeCompare(right.name, locale)
      ));
    }
    return sortSubscriptionsForDisplay(platformSubscriptions);
  }, [displaySourceSubscriptions, locale, numericAccountSearch, searchQuery, selectedPlatform, sortOption, sortSubscriptionsForDisplay]);
  const isDisplayPending = useFilteredIndex && indexQuery.isPending;
  useRouteReady(subscriptionsQuery.isPending || isDisplayPending);
  const displayError = useFilteredIndex ? indexQuery.error : subscriptionsQuery.error;
  const retryDisplayQuery = useFilteredIndex ? indexQuery.refetch : subscriptionsQuery.refetch;
  const displayedTotal = selectedPlatform
    ? filteredSubscriptions.length
    : useFilteredIndex
      ? (indexQuery.data?.total ?? 0)
      : subscriptionsQuery.total;
  const hasDisplayFilters = hasActiveFilters || selectedPlatform !== null;
  const unfilteredTotal = hasDisplayFilters ? facetsQuery.data?.total : undefined;
  const {
    editingSubscription,
    editingCollectionItem,
    editDialogOpen,
    cloningSubscription,
    cloningCollectionItem,
    cloneDialogOpen,
    renewingSubscription,
    renewingCollectionItem,
    renewDialogOpen,
    editDetailPending,
    cloneDetailPending,
    renewDetailPending,
    renewError,
    renewSubmitting,
    renewRestoreFocusRef,
    handlePrefetchSubscription,
    handleAddSubscription,
    handleDeleteSubscription,
    handleCloneSubscription,
    handleEditSubscription,
    handleTogglePinnedSubscription,
    handleTogglePublicHiddenSubscription,
    handleRenewSubscription,
    handleSubmitRenewSubscription,
    handleSaveSubscription,
    handleSaveClonedSubscription,
    handleEditDialogOpenChange,
    handleCloneDialogOpenChange,
    handleRenewDialogOpenChange,
  } = useSubscriptionCrud(displaySourceSubscriptions);
  const settings = settingsQuery.data?.settings ?? DEFAULT_SETTINGS;
  const priceReferenceCurrency = resolveSubscriptionPriceReferenceCurrency(settings);
  const { exportToJSON, exportToJSONWithSecrets, exportToCSV, exporting } =
    useSubscriptionExport(config, settings, locale, selectSubscriptionsForExport, today, convert);
  const {
    detailDialogOpen,
    selectedDetailSubscription,
    selectedDetailCollectionItem,
    detailPending,
    handleViewDetails,
    handleDetailDialogOpenChange,
  } = useSubscriptionDetailDialog(displaySourceSubscriptions);
  const calendarDialog = useSubscriptionCalendarDialog(displaySourceSubscriptions);
  const effectiveSortOption = sortOption === "default" ? "renewal_asc" : sortOption;
  const sortControls = (
    <div className="min-w-0" aria-label={t("subscriptions.sort.label")}>
      <Select value={effectiveSortOption} onValueChange={(value) => setSortOption(value as SubscriptionSortOption)}>
        <SelectTrigger aria-label={t("subscriptions.sort.label")} className="h-11 border-border bg-secondary sm:h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent mobileTitle={t("subscriptions.sort.label")}>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>{t(SORT_OPTION_LABEL_KEYS[option])}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const handleLoadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  const handleEditFromDetail = useCallback((subscription: Subscription) => {
    handleEditSubscription(subscription.id);
  }, [handleEditSubscription]);
  const aiRecognitionAction = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={() => setAIRecognitionDialogOpen(true)}
          onFocus={preloadAIRecognizeSubscriptionDialog}
          onPointerEnter={preloadAIRecognizeSubscriptionDialog}
          onTouchStart={preloadAIRecognizeSubscriptionDialog}
          className="h-12 w-12 shrink-0 text-primary sm:h-10 sm:w-10"
          aria-label={t("subscriptions.aiRecognizeAdd")}
        >
          <Sparkles className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="text-xs">
        {t("subscriptions.aiRecognizeAdd")}
      </TooltipContent>
    </Tooltip>
  );

  // 首次加载订阅列表时展示骨架屏（筛选条 + 卡片网格占位）。
  if (subscriptionsQuery.isPending) {
    return (
      <div className="app-page bg-background">
        <Header onAddSubscription={handleAddSubscription} availableTags={allTags} platformSuggestions={platformOptions} subscriptionActions={aiRecognitionAction} />
        <main className="app-main mx-auto max-w-[120rem]">
          <SubscriptionsPageSkeleton withPageShell={false} />
        </main>
      </div>
    );
  }

  return (
    <div className="app-page bg-background">
      <Header onAddSubscription={handleAddSubscription} availableTags={allTags} platformSuggestions={platformOptions} subscriptionActions={aiRecognitionAction} />

      <main className="app-main mx-auto max-w-[120rem]">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("subscriptions.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subscriptions.count", { count: displayedTotal })}
              {unfilteredTotal !== undefined && ` ${t("subscriptions.filteredCount", { count: unfilteredTotal })}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="border-border"
                  aria-label={t("subscriptions.exportMenu")}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportToJSON} disabled={exporting}>
                  {t("subscriptions.exportJson")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToJSONWithSecrets} disabled={exporting}>
                  {t("subscriptions.exportJsonWithSecrets")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToCSV} disabled={exporting}>
                  {t("subscriptions.exportCsv")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
              onFocus={preloadImportDataDialog}
              onPointerEnter={preloadImportDataDialog}
              onTouchStart={preloadImportDataDialog}
              className="gap-2 border-border"
              aria-label={t("subscriptions.importData")}
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">{t("subscriptions.importData")}</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="border-border"
            >
              {viewMode === 'grid' ? <ListIcon className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {isMobileTagFilter ? (
          <div className="mb-6 grid gap-3 rounded-xl border border-border bg-card p-3">
            <>
              <div className="flex min-w-0 items-center gap-2" data-testid="mobile-compact-filter-toolbar">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    name="subscription-search"
                    type="search"
                    enterKeyHint="search"
                    placeholder={t("subscriptions.searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-11 border-border bg-secondary pl-10"
                  />
                </div>
                <Button
                  type="button"
                  variant={mobileFiltersExpanded ? "secondary" : "outline"}
                  className="h-11 w-11 shrink-0 border-border p-0"
                  aria-label={t(mobileFiltersExpanded ? "subscriptions.mobileFilters.collapse" : "subscriptions.mobileFilters.open")}
                  aria-expanded={mobileFiltersExpanded}
                  aria-controls="mobile-subscription-filters"
                  onClick={() => setMobileFiltersExpanded((expanded) => !expanded)}
                >
                  <Funnel className="h-4 w-4" />
                </Button>
              </div>

              {mobileFiltersExpanded ? (
                <div id="mobile-subscription-filters" className="grid gap-3 border-t border-border pt-3" data-testid="mobile-expanded-filters">
                  {platformOptions.length > 0 ? (
                    <Suspense fallback={<div className="h-11 rounded-lg bg-secondary" />}>
                      <PlatformFilterBar
                        platforms={platformOptions}
                        value={selectedPlatform}
                        onValueChange={setSelectedPlatform}
                        allLabel={t("subscriptions.allPlatforms")}
                        moreLabel={t("subscriptions.morePlatforms")}
                        ariaLabel={t("subscriptions.platformFilter")}
                        className="rounded-lg border bg-secondary/50 px-1"
                      />
                    </Suspense>
                  ) : null}

                <div className="grid gap-2">
                  {sortControls}
                </div>
                </div>
              ) : null}
            </>
          </div>
        ) : (
          <div
            className="mb-6 flex min-w-0 items-center rounded-lg border border-border bg-card"
            data-testid="desktop-subscription-toolbar"
          >
            {platformOptions.length > 0 ? (
              <Suspense fallback={<div className="h-12 min-w-0 flex-1" />}>
                <PlatformFilterBar
                  platforms={platformOptions}
                  value={selectedPlatform}
                  onValueChange={setSelectedPlatform}
                  allLabel={t("subscriptions.allPlatforms")}
                  moreLabel={t("subscriptions.morePlatforms")}
                  ariaLabel={t("subscriptions.platformFilter")}
                  className="min-w-0 flex-1 border-0 px-2"
                  visibleLimits={{ regular: 2, wide: 4 }}
                  moreIconOnly
                />
              </Suspense>
            ) : null}
            <div className={cn("flex min-w-0 shrink-0 items-center gap-2 p-2", platformOptions.length > 0 && "pl-0")}>
                <div className="relative w-[clamp(14rem,28vw,24rem)] min-w-0">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    name="subscription-search"
                    type="search"
                    enterKeyHint="search"
                    placeholder={t("subscriptions.searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 border-border bg-secondary pl-10"
                  />
                </div>
                <div className="w-40">{sortControls}</div>
              </div>
          </div>
        )}

        {displayError ? (
          <QueryErrorState error={displayError} onRetry={retryDisplayQuery} />
        ) : isDisplayPending ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-16 text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : filteredSubscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
              <Search className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-medium text-foreground">
              {hasDisplayFilters ? t("subscriptions.emptyFilteredTitle") : t("subscriptions.emptyNoDataTitle")}
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              {hasDisplayFilters ? t("subscriptions.emptyFiltered") : t("subscriptions.emptyNoData")}
            </p>
            {hasDisplayFilters ? (
              <Button
                type="button"
                variant="outline"
                className="gap-2 border-border"
                onClick={() => {
                  clearFilters();
                  setSelectedPlatform(null);
                }}
              >
                {t("subscriptions.clearFilters")}
              </Button>
            ) : (
              <Suspense fallback={
                <Button disabled className="gap-2 bg-primary text-primary-foreground">
                  <Plus className="h-4 w-4" />
                  {t("subscriptions.addFirst")}
                </Button>
              }>
                <AddSubscriptionDialog
                  onAdd={handleAddSubscription}
                  availableTags={allTags}
                  platformSuggestions={platformOptions}
                  trigger={
                  <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary-glow">
                    <Plus className="h-4 w-4" />
                    {t("subscriptions.addFirst")}
                  </Button>
                  }
                />
              </Suspense>
            )}
          </div>
        ) : (
          <>
            <SubscriptionGrid
              subscriptions={filteredSubscriptions}
              viewMode={viewMode}
              today={today}
              inheritedReminderDays={inheritedReminderDays}
              currencyConvert={convert}
              currencyRatesReady={currencyRatesReady}
              priceReferenceCurrency={priceReferenceCurrency}
              categoryByValue={categoryByValue}
              paymentMethodByValue={paymentMethodByValue}
              onEdit={handleEditSubscription}
              onDelete={handleDeleteSubscription}
              onClone={handleCloneSubscription}
              onTogglePinned={handleTogglePinnedSubscription}
              onTogglePublicHidden={handleTogglePublicHiddenSubscription}
              onRenew={handleRenewSubscription}
              onViewDetails={handleViewDetails}
              onAddToCalendar={calendarDialog.show}
              onPrefetchDetails={handlePrefetchSubscription}
            />
            {!useFilteredIndex && subscriptionsQuery.hasNextPage && (
              <div className="mt-6 flex justify-center [overflow-anchor:none]" data-testid="subscriptions-load-more-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={subscriptionsQuery.isFetchingNextPage}
                  className="min-w-32 border-border"
                >
                  {subscriptionsQuery.isFetchingNextPage ? t("common.loading") : t("notification.loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      <BackToTopFloatButton />

      <Suspense fallback={null}>
        <EditSubscriptionDialog
          subscription={editingSubscription}
          loadingPreview={editingCollectionItem}
          open={editDialogOpen}
          onOpenChange={handleEditDialogOpenChange}
          onSave={handleSaveSubscription}
          availableTags={allTags}
          platformSuggestions={platformOptions}
          loading={editDetailPending}
        />
        <SubscriptionDialog
          mode="create"
          open={cloneDialogOpen}
          onOpenChange={handleCloneDialogOpenChange}
          onSubmit={handleSaveClonedSubscription}
          initialSubscription={cloningSubscription}
          loadingPreview={cloningCollectionItem}
          availableTags={allTags}
          platformSuggestions={platformOptions}
          loading={cloneDetailPending}
        />
      </Suspense>
      <DeferredRenewSubscriptionDialog
        subscription={renewingSubscription}
        loadingPreview={renewingCollectionItem}
        open={renewDialogOpen}
        today={today}
        submitting={renewSubmitting}
        error={renewError instanceof Error ? renewError.message : null}
        restoreFocusRef={renewRestoreFocusRef}
        onOpenChange={handleRenewDialogOpenChange}
        onSubmit={handleSubmitRenewSubscription}
        loading={renewDetailPending}
      />
      <Suspense fallback={null}>
        <SubscriptionDetailDialog
          open={detailDialogOpen}
          onOpenChange={handleDetailDialogOpenChange}
          subscription={selectedDetailSubscription}
          loadingPreview={selectedDetailCollectionItem}
          onEditSubscription={handleEditFromDetail}
          onRenewSubscription={handleRenewSubscription}
          today={today}
          currencyConvert={convert}
          currencyRatesReady={currencyRatesReady}
          priceReferenceCurrency={priceReferenceCurrency}
          loading={detailPending}
        />
      </Suspense>
      <AddToCalendarDialog
        open={calendarDialog.open}
        onOpenChange={calendarDialog.onOpenChange}
        subscription={calendarDialog.subscription}
        loadingPreview={calendarDialog.collectionItem}
        loading={calendarDialog.pending}
      />
      <DeferredImportDataDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        settings={settings}
        config={config}
      />
      <DeferredAIRecognizeSubscriptionDialog
        open={aiRecognitionDialogOpen}
        onOpenChange={setAIRecognitionDialogOpen}
        settings={settings}
        apiKeyConfigured={settingsQuery.data?.secretStatus["aiRecognition.apiKey"].configured ?? false}
        config={config}
        availableTags={allTags}
      />
    </div>
  );
};

export default Subscriptions;
