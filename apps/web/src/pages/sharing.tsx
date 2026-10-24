import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "@/lib/router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CircleDollarSign, TrendingUp, UsersRound, WalletCards } from "lucide-react";
import { SharingInboxLinksDialog } from "@/components/sharing-inbox-links-dialog";

import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import { SharingAccountCard } from "@/components/sharing-account-card";
import { Header } from "@/components/header";
import { sharingSeatExpiryTone, type SharingSeatTone } from "@/components/sharing-seat-occupancy";
import { EditSubscriptionDialog } from "@/components/edit-subscription-dialog";
import { SubscriptionLogo } from "@/components/subscription-logo";
import Link from "@/components/router-link";
import { useRouteReady } from "@/components/route-progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { StatCard } from "@/components/ui/stat-card";
import { MobileListToolbar } from "@/components/mobile-list-toolbar";
import { PlatformSearchToolbar } from "@/components/platform-search-toolbar";
import { WorkspaceQuickFilters } from "@/components/workspace-quick-filters";
import { sharingQueryKeys, useSharingAccountDetails, useSharingAccounts } from "@/hooks/use-sharing";
import { useSubscriptionDetail, useUpdateSubscription } from "@/hooks/use-subscriptions";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSettingsEnvelope } from "@/hooks/use-settings";
import { useZonedToday } from "@/hooks/use-zoned-today";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useCustomConfigState } from "@/contexts/CustomConfigContext";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { daysBetweenDateOnly } from "@/lib/time/date-only";
import { sharingSubscriptionExpiryDays, sharingMonthlyProfit, sharingMonthlyRevenue, sharingOutstandingAmount, sharingNearestSeatExpiry, sharingUpcomingSeatRenewals, sortSharingAccountsByNearestSeatExpiry } from "@/lib/sharing-financials";
import { sharingAccountHasVacancy, sharingSeatDisplayState, type SharingSeatDisplayState } from "@/lib/sharing-seat-state";
import { subscriptionPlatformName, UNBOUND_PLATFORM_VALUE } from "@/lib/subscription-platform";
import { sharingService } from "@/services/sharing-service";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import type { SharingAccount } from "@renewlet/shared/schemas/sharing";

const SharingAccountDetailDialog = lazy(() => import("@/components/sharing-account-detail-dialog").then((module) => ({
  default: module.SharingAccountDetailDialog,
})));

function currencyMetric(formatted: string, currency: string) {
  const suffix = ` ${currency}`;
  const hasCurrencySuffix = formatted.endsWith(suffix);
  return (
    <>
      <span>{hasCurrencySuffix ? formatted.slice(0, -suffix.length) : formatted}</span>
      {hasCurrencySuffix ? <span className="text-[10px] font-semibold text-muted-foreground">{currency}</span> : null}
    </>
  );
}

function linkSharingReady(account: SharingAccount) {
  return account.familySharingEnabled
    && account.status === "active"
    && (account.verificationMode === "totp" || Boolean(account.verificationLink));
}

type SharingFilter = "all" | "available" | "full" | "expiring" | "overdue" | "outstanding";
type SharingSortField = "expiry" | "account" | "vacancies" | "revenue" | "profit";

export default function Sharing() {
  const searchParams = useSearchParams();
  const { t, formatCurrency, formatDateOnly } = useI18n();
  const { pending: customConfigPending } = useCustomConfigState();
  const accountsQuery = useSharingAccounts();
  const settingsQuery = useSettingsEnvelope();
  const defaultCurrency = settingsQuery.data?.settings.defaultCurrency ?? "CNY";
  const today = useZonedToday(settingsQuery.data?.settings.timezone ?? "UTC");
  const { convert } = useExchangeRates(settingsQuery.data?.settings.exchangeRateProvider);
  const [selectedAccount, setSelectedAccount] = useState<SharingAccount | null>(null);
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null);
  const [viewingAccount, setViewingAccount] = useState<SharingAccount | null>(null);
  const [linksAccount, setLinksAccount] = useState<SharingAccount | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(() => {
    const platform = searchParams.get("platform");
    return platform === UNBOUND_PLATFORM_VALUE ? "" : platform;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState<SharingFilter>(() => {
    const status = searchParams.get("status");
    return status && ["available", "full", "expiring", "overdue", "outstanding"].includes(status) ? status as SharingFilter : "all";
  });
  const [sortField, setSortField] = useState<SharingSortField>("expiry");
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [renewalsOpen, setRenewalsOpen] = useState(false);
  const editingSubscriptionQuery = useSubscriptionDetail(editingSubscriptionId, Boolean(editingSubscriptionId));
  const updateSubscription = useUpdateSubscription();
  const queryClient = useQueryClient();
  useRouteReady();

  const accounts = accountsQuery.data?.accounts ?? [];
  const platformOptions = Array.from(accounts.reduce((platforms, account) => {
    const platformName = subscriptionPlatformName(account.subscription);
    const platform = platforms.get(platformName) ?? {
      name: platformName,
      logo: account.subscription.logo,
      accounts: [] as { id: string; accountNumber: number }[],
    };
    platform.accounts.push({ id: account.subscription.id, accountNumber: account.accountNumber });
    platforms.set(platformName, platform);
    return platforms;
  }, new Map<string, {
    name: string;
    logo: string | null;
    accounts: { id: string; accountNumber: number }[];
  }>()).values());
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const platformAccounts = accounts
    .filter((account) => selectedPlatform === null || subscriptionPlatformName(account.subscription) === selectedPlatform)
    .sort((left, right) => left.accountNumber - right.accountNumber || left.name.localeCompare(right.name));
  const accountDetailQueries = useSharingAccountDetails(platformAccounts.map((account) => account.id));
  const accountDetails = new Map(platformAccounts.flatMap((account, index) => {
    const detail = accountDetailQueries[index]?.data;
    return detail ? [[account.id, detail] as const] : [];
  }));
  const searchedAccounts = platformAccounts.filter((account) => {
    if (!normalizedSearch) return true;
    if (/^\d+$/.test(normalizedSearch)) return String(account.accountNumber) === normalizedSearch;
    const platformName = subscriptionPlatformName(account.subscription).toLocaleLowerCase();
    const detail = accountDetails.get(account.id);
    return account.subscription.name.toLocaleLowerCase().includes(normalizedSearch)
      || platformName.includes(normalizedSearch)
      || account.loginAccount.toLocaleLowerCase().includes(normalizedSearch)
      || `${platformName}${account.accountNumber}`.includes(normalizedSearch.replaceAll(" ", ""))
      || Boolean(detail?.seats.some((seat) => seat.memberName?.toLocaleLowerCase().includes(normalizedSearch) || seat.contact?.toLocaleLowerCase().includes(normalizedSearch)));
  });
  const filteredAccounts = searchedAccounts.filter((account) => {
    if (accountFilter === "all") return true;
    const detail = accountDetails.get(account.id);
    const hasVacancy = detail ? sharingAccountHasVacancy(detail.seats, today) : account.occupiedSeats < account.capacity;
    if (accountFilter === "available") return hasVacancy;
    if (accountFilter === "full") return !hasVacancy;
    if (accountFilter === "outstanding") return Number(account.outstandingAmount) > 0;
    const accountDays = sharingSubscriptionExpiryDays(account, today);
    if (accountDays !== null && (accountFilter === "overdue" ? accountDays < 0 : accountDays >= 0 && accountDays <= 7)) return true;
    const nearest = sharingNearestSeatExpiry(accountDetails.get(account.id), today);
    if (!nearest) return false;
    return accountFilter === "overdue" ? nearest.daysUntilExpiry < 0 : nearest.daysUntilExpiry >= 0 && nearest.daysUntilExpiry <= 7;
  });
  const visibleAccounts = sortField === "expiry"
    ? sortSharingAccountsByNearestSeatExpiry(filteredAccounts, accountDetails, today, "asc")
    : [...filteredAccounts].sort((left, right) => {
        const comparison = sortField === "account"
          ? left.accountNumber - right.accountNumber
          : sortField === "vacancies"
            ? (left.capacity - left.occupiedSeats) - (right.capacity - right.occupiedSeats)
            : sortField === "revenue"
              ? sharingMonthlyRevenue(left, defaultCurrency, convert) - sharingMonthlyRevenue(right, defaultCurrency, convert)
              : sharingMonthlyProfit(left, defaultCurrency, convert) - sharingMonthlyProfit(right, defaultCurrency, convert);
        return comparison || left.accountNumber - right.accountNumber;
      });
  const upcomingSeatRenewals = sharingUpcomingSeatRenewals(
    accountDetailQueries.flatMap((query) => query.data ? [query.data] : []),
    today,
  );
  const renewalDetailsPending = accountDetailQueries.some((query) => query.isPending);
  const occupiedSeats = visibleAccounts.reduce((total, account) => total + account.occupiedSeats, 0);
  const capacity = visibleAccounts.reduce((total, account) => total + account.capacity, 0);
  const outstanding = visibleAccounts.reduce(
    (total, account) => total + sharingOutstandingAmount(account, defaultCurrency, convert),
    0,
  );
  const monthlyRevenue = visibleAccounts.reduce(
    (total, account) => total + sharingMonthlyRevenue(account, defaultCurrency, convert),
    0,
  );
  const monthlyProfit = visibleAccounts.reduce(
    (total, account) => total + sharingMonthlyProfit(account, defaultCurrency, convert),
    0,
  );
  const upcomingRenewals = upcomingSeatRenewals.length;

  const copy = async (value: string) => {
    const result = await copyTextToClipboard(value);
    if (result.ok) toast.success(t("sharing.copySuccess"));
    else toast.error(t("sharing.copyFailed"));
  };

  const saveFamilySharing = (changes: Parameters<typeof updateSubscription.mutate>[0]["changes"]) => {
    if (!editingSubscriptionId) return;
    updateSubscription.mutate(
      { id: editingSubscriptionId, changes },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: sharingQueryKeys.all, refetchType: "active" });
          setEditingSubscriptionId(null);
        },
      },
    );
  };

  const seatTones = (account: SharingAccount): SharingSeatTone[] => {
    if (!accountDetails.has(account.id)) return Array.from({ length: account.capacity }, (_, index) => index < account.occupiedSeats ? "normal" : "vacant");
    const seatsByNumber = new Map(accountDetails.get(account.id)?.seats.map((seat) => [seat.seatNumber, seat]));
    return Array.from({ length: account.capacity }, (_, index) => {
      const seat = seatsByNumber.get(index + 1);
      if (!seat || !seat.memberName || seat.status === "vacant" || seat.status === "archived") return "vacant";
      if (!seat.expiresAt) return "normal";
      return sharingSeatExpiryTone(daysBetweenDateOnly(today, seat.expiresAt));
    });
  };

  const seatStates = (account: SharingAccount): SharingSeatDisplayState[] => {
    if (!accountDetails.has(account.id)) return Array.from({ length: account.capacity }, (_, index) => index < account.occupiedSeats ? "active" : "vacant");
    const seatsByNumber = new Map(accountDetails.get(account.id)?.seats.map((seat) => [seat.seatNumber, seat]));
    return Array.from({ length: account.capacity }, (_, index) => sharingSeatDisplayState(seatsByNumber.get(index + 1), today));
  };

  const sharingFilterControls = (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <Select value={accountFilter} onValueChange={(value) => setAccountFilter(value as SharingFilter)}>
        <SelectTrigger className="h-11 border-border bg-secondary sm:h-10" aria-label={t("sharing.accountStatusFilter")}><SelectValue /></SelectTrigger>
        <SelectContent mobileTitle={t("sharing.accountStatusFilter")}>
          <SelectItem value="all">{t("sharing.allStatus")}</SelectItem>
          <SelectItem value="available">{t("sharing.hasVacancies")}</SelectItem>
          <SelectItem value="full">{t("sharing.accountFull")}</SelectItem>
          <SelectItem value="expiring">{t("sharing.expiringWithinSevenDays")}</SelectItem>
          <SelectItem value="overdue">{t("sharing.hasOverdue")}</SelectItem>
          <SelectItem value="outstanding">{t("sharing.hasOutstanding")}</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sortField} onValueChange={(value) => setSortField(value as SharingSortField)}>
        <SelectTrigger className="h-11 border-border bg-secondary sm:h-10" aria-label={t("subscriptions.sort.label")}><SelectValue /></SelectTrigger>
        <SelectContent mobileTitle={t("subscriptions.sort.label")}>
          <SelectItem value="expiry">{t("sharing.nearestExpiry")}</SelectItem>
          <SelectItem value="account">{t("sharing.accountNumberSort")}</SelectItem>
          <SelectItem value="vacancies">{t("sharing.vacantSeatsSort")}</SelectItem>
          <SelectItem value="revenue">{t("sharing.monthlyRevenue")}</SelectItem>
          <SelectItem value="profit">{t("sharing.monthlyProfit")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="app-page bg-background">
      <Header />
      <main className="app-main sharing-main mx-auto max-w-[120rem]">
        <WorkspacePageHeading title={t("sharing.title")} description={
          <span>{t("sharing.accounts")} {visibleAccounts.length} · {t("sharing.occupiedSeats")} {occupiedSeats}/{capacity}</span>
        } actions={<Button variant="outline" className="min-h-11" onClick={() => setRenewalsOpen(true)}><CalendarClock className="h-4 w-4" />{t("sharing.upcomingRenewals")} · {upcomingRenewals}</Button>} />
        <section className="workspace-summary mb-6 hidden grid-cols-3 gap-3 md:grid" aria-label={t("sharing.title")}>
          <StatCard title={t("sharing.accounts")} value={visibleAccounts.length} icon={<WalletCards />} density="dashboard" valueClassName="text-base 2xl:text-lg" className="animate-fade-in" />
          <StatCard title={t("sharing.occupiedSeats")} value={`${occupiedSeats} / ${capacity}`} icon={<UsersRound />} density="dashboard" valueClassName="text-base 2xl:text-lg" className="animate-fade-in [animation-delay:100ms]" />
          <StatCard title={t("sharing.monthlyRevenue")} value={currencyMetric(formatCurrency(monthlyRevenue, defaultCurrency), defaultCurrency)} icon={<CircleDollarSign />} density="dashboard" variant="primary" valueClassName="flex items-baseline gap-1 whitespace-nowrap text-base xl:text-lg 2xl:text-xl" className="animate-fade-in [animation-delay:200ms]" />
          <StatCard title={t("sharing.outstanding")} value={currencyMetric(formatCurrency(outstanding, defaultCurrency), defaultCurrency)} icon={<CircleDollarSign />} density="dashboard" valueClassName="flex items-baseline gap-1 whitespace-nowrap text-base xl:text-lg 2xl:text-xl" className="animate-fade-in [animation-delay:300ms]" />
          <StatCard title={t("sharing.monthlyProfit")} value={currencyMetric(formatCurrency(monthlyProfit, defaultCurrency), defaultCurrency)} icon={<TrendingUp />} density="dashboard" variant={monthlyProfit < 0 ? "warning" : "primary"} valueClassName="flex items-baseline gap-1 whitespace-nowrap text-base xl:text-lg 2xl:text-xl" className="animate-fade-in [animation-delay:400ms]" />
          <StatCard
            title={t("sharing.upcomingRenewals")}
            value={upcomingRenewals}
            subtitle={t("sharing.nextSevenDays")}
            icon={<CalendarClock />}
            density="dashboard"
            variant={upcomingRenewals > 0 ? "warning" : "default"}
            valueClassName="text-base 2xl:text-lg"
            className="animate-fade-in [animation-delay:500ms]"
            aria-label={t("sharing.openUpcomingRenewals")}
            onClick={() => setRenewalsOpen(true)}
          />
        </section>

        {platformOptions.length > 0 ? (
          <div className="mt-3 shrink-0 md:mt-4">
            {isMobile ? (
              <MobileListToolbar platforms={platformOptions} platform={selectedPlatform} onPlatformChange={setSelectedPlatform}
                allLabel={t("sharing.allPlatforms")} platformLabel={t("sharing.platformFilter")}
                search={searchQuery} onSearchChange={setSearchQuery} searchPlaceholder={t("sharing.searchPlaceholder")}>
                {sharingFilterControls}
              </MobileListToolbar>
            ) : (
              <PlatformSearchToolbar
                platforms={platformOptions}
                selectedPlatform={selectedPlatform}
                onPlatformChange={setSelectedPlatform}
                allLabel={t("sharing.allPlatforms")}
                moreLabel={t("sharing.morePlatforms")}
                platformAriaLabel={t("sharing.platformFilter")}
                searchValue={searchQuery}
                onSearchChange={(event) => setSearchQuery(event.target.value)}
                searchPlaceholder={t("sharing.searchPlaceholder")}
                controls={<div className="w-56 shrink-0">{sharingFilterControls}</div>}
                className="mb-3"
                testId="desktop-sharing-toolbar"
              />
            )}
          </div>
        ) : null}

        <WorkspaceQuickFilters value={accountFilter} onChange={setAccountFilter} options={[
          { value: "all", label: t("sharing.allStatus") },
          { value: "available", label: t("sharing.hasVacancies") },
          { value: "full", label: t("sharing.accountFull") },
          { value: "outstanding", label: t("sharing.hasOutstanding") },
          { value: "expiring", label: t("sharing.expiringWithinSevenDays") },
          { value: "overdue", label: t("sharing.hasOverdue") },
        ]} />
        {accountsQuery.isError ? (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:mt-6">{t("sharing.loadFailed")}</div>
        ) : accounts.length === 0 && !accountsQuery.isPending ? (
          <section className="mt-4 flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center sm:mt-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary"><UsersRound className="h-6 w-6" /></div>
            <h3 className="mt-4 text-base font-semibold text-foreground">{t("sharing.emptyTitle")}</h3>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t("sharing.emptyDescription")}</p>
            <Button asChild variant="outline" className="mt-5"><Link href="/subscriptions">{t("sharing.goToSubscriptions")}</Link></Button>
          </section>
        ) : (
          <section className="grid min-w-0 items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={t("sharing.accounts")}>
            {accountsQuery.isPending ? <div className="col-span-full rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground" role="status">{t("common.loading")}</div> : visibleAccounts.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed bg-card p-10 text-center">
                <p className="text-sm text-muted-foreground">{t("sharing.noSearchResults")}</p>
                <Button variant="outline" className="mt-4 min-h-11" onClick={() => { setSearchQuery(""); setSelectedPlatform(null); setAccountFilter("all"); }}>{t("subscriptions.clearFilters")}</Button>
              </div>
            ) : visibleAccounts.map((account) => (
              <SharingAccountCard key={account.id} account={account}
                nearest={sharingNearestSeatExpiry(accountDetails.get(account.id), today)}
                seatStates={seatStates(account)} seatTones={seatTones(account)}
                vacancy={accountDetails.has(account.id) ? sharingAccountHasVacancy(accountDetails.get(account.id)!.seats, today) : account.occupiedSeats < account.capacity}
                sharingReady={Boolean(linkSharingReady(account))}
                subscriptionExpiryDays={sharingSubscriptionExpiryDays(account, today)}
                onManage={() => setSelectedAccount(account)} onDetails={() => setViewingAccount(account)}
                onLinks={() => setLinksAccount(account)} onCopyAccount={() => void copy(account.loginAccount)} />
            ))}
          </section>
        )}
        {linksAccount ? <SharingInboxLinksDialog key={linksAccount.id} account={linksAccount} onClose={() => setLinksAccount(null)} /> : null}
        {viewingAccount ? <Suspense fallback={null}><SharingAccountDetailDialog account={viewingAccount} mode="account" open onOpenChange={(open) => !open && setViewingAccount(null)} onEditAccount={() => { setEditingSubscriptionId(viewingAccount.subscription.id); setViewingAccount(null); }} /></Suspense> : null}
        {selectedAccount ? (
          <Suspense fallback={null}>
            <SharingAccountDetailDialog account={selectedAccount} mode="seats" open onOpenChange={(open) => !open && setSelectedAccount(null)} />
          </Suspense>
        ) : null}
        <EditSubscriptionDialog
          scope="family-sharing"
          subscription={editingSubscriptionQuery.data ?? null}
          loadingPreview={null}
          open={Boolean(editingSubscriptionId)}
          onOpenChange={(open) => !open && setEditingSubscriptionId(null)}
          onSave={saveFamilySharing}
          platformSuggestions={platformOptions}
          loading={customConfigPending || editingSubscriptionQuery.isPending || editingSubscriptionQuery.isFetching}
        />
        <Dialog open={renewalsOpen} onOpenChange={setRenewalsOpen}>
          <DialogContent className="max-w-2xl bg-card" closeLabel={t("common.close")}>
            <DialogHeader>
              <DialogTitle>{t("sharing.upcomingDialogTitle")}</DialogTitle>
              <DialogDescription>{t("sharing.upcomingDialogDescription")}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60dvh] space-y-2 overflow-y-auto pr-1">
              {renewalDetailsPending ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : upcomingSeatRenewals.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{t("sharing.upcomingDialogEmpty")}</p>
              ) : upcomingSeatRenewals.map(({ account, seat, daysUntilExpiry }) => {
                const platformName = subscriptionPlatformName(account.subscription);
                return (
                  <div key={seat.id} className="flex items-center gap-3 rounded-md border border-border bg-muted/35 p-3">
                    <div className="relative shrink-0">
                      <SubscriptionLogo name={platformName} logo={account.subscription.logo ?? undefined} size="sm" />
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground tabular-nums">{account.accountNumber}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{seat.memberName}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{platformName} · #{seat.seatNumber} · {formatDateOnly(seat.expiresAt!)}</p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums", daysUntilExpiry <= 1 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning")}>
                      {daysUntilExpiry === 0 ? t("common.today") : t("upcoming.daysShort", { days: daysUntilExpiry })}
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setRenewalsOpen(false); setSelectedAccount(account); }}>{t("sharing.manageAccount")}</Button>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
