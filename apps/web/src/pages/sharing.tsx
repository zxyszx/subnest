import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CircleDollarSign, Copy, KeyRound, Link as LinkIcon, Search, TrendingUp, UsersRound, WalletCards } from "lucide-react";

import { Header } from "@/components/header";
import { SharingAccountDetailDialog } from "@/components/sharing-account-detail-dialog";
import { EditSubscriptionDialog } from "@/components/edit-subscription-dialog";
import { SubscriptionLogo } from "@/components/subscription-logo";
import Link from "@/components/router-link";
import { useRouteReady } from "@/components/route-progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { StatCard } from "@/components/ui/stat-card";
import { PlatformFilterBar } from "@/components/platform-filter-bar";
import { sharingQueryKeys, useSharingAccountDetails, useSharingAccounts } from "@/hooks/use-sharing";
import { useSubscriptionDetail, useUpdateSubscription } from "@/hooks/use-subscriptions";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSettingsEnvelope } from "@/hooks/use-settings";
import { useZonedToday } from "@/hooks/use-zoned-today";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { sharingMonthlyProfit, sharingMonthlyRevenue, sharingNearestSeatExpiry, sharingUpcomingSeatRenewals } from "@/lib/sharing-financials";
import { subscriptionPlatformName } from "@/lib/subscription-platform";
import { sharingService } from "@/services/sharing-service";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import type { SharingAccount } from "@renewlet/shared/schemas/sharing";

export default function Sharing() {
  const { t, formatCurrency, formatDateOnly } = useI18n();
  const accountsQuery = useSharingAccounts();
  const settingsQuery = useSettingsEnvelope();
  const defaultCurrency = settingsQuery.data?.settings.defaultCurrency ?? "CNY";
  const today = useZonedToday(settingsQuery.data?.settings.timezone ?? "UTC");
  const { convert } = useExchangeRates(settingsQuery.data?.settings.exchangeRateProvider);
  const [selectedAccount, setSelectedAccount] = useState<SharingAccount | null>(null);
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
  const visibleAccounts = accounts
    .filter((account) => !selectedPlatform || subscriptionPlatformName(account.subscription) === selectedPlatform)
    .filter((account) => {
      if (!normalizedSearch) return true;
      const platformName = subscriptionPlatformName(account.subscription).toLocaleLowerCase();
      const accountNumber = String(account.accountNumber);
      return platformName.includes(normalizedSearch)
        || accountNumber.includes(normalizedSearch)
        || `${platformName}${accountNumber}`.includes(normalizedSearch.replaceAll(" ", ""));
    })
    .sort((left, right) => left.accountNumber - right.accountNumber || left.name.localeCompare(right.name));
  const accountDetailQueries = useSharingAccountDetails(visibleAccounts.map((account) => account.id));
  const accountDetails = new Map(visibleAccounts.flatMap((account, index) => {
    const detail = accountDetailQueries[index]?.data;
    return detail ? [[account.id, detail] as const] : [];
  }));
  const upcomingSeatRenewals = sharingUpcomingSeatRenewals(
    accountDetailQueries.flatMap((query) => query.data ? [query.data] : []),
    today,
  );
  const renewalDetailsPending = accountDetailQueries.some((query) => query.isPending);
  const occupiedSeats = visibleAccounts.reduce((total, account) => total + account.occupiedSeats, 0);
  const capacity = visibleAccounts.reduce((total, account) => total + account.capacity, 0);
  const outstanding = visibleAccounts.reduce(
    (total, account) => total + convert(Number(account.outstandingAmount), account.currency, defaultCurrency),
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

  const copyPassword = async (account: SharingAccount) => {
    try {
      await copy(await sharingService.password(account.id));
    } catch {
      toast.error(t("sharing.passwordUnavailable"));
    }
  };

  const copyAll = async (account: SharingAccount) => {
    try {
      const password = await sharingService.password(account.id);
      await copy(t("sharing.accountCopyTemplate", {
        account: account.loginAccount,
        password,
        link: account.verificationLink ?? t("sharing.noVerificationLink"),
      }));
    } catch {
      toast.error(t("sharing.passwordUnavailable"));
    }
  };

  const saveSubscription = (changes: Parameters<typeof updateSubscription.mutate>[0]["changes"]) => {
    if (!editingSubscriptionId) return;
    updateSubscription.mutate(
      { id: editingSubscriptionId, changes },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: sharingQueryKeys.all });
          setEditingSubscriptionId(null);
        },
      },
    );
  };

  const AccountIdentity = ({ account }: { account: SharingAccount }) => {
    const platformName = subscriptionPlatformName(account.subscription);
    return (
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="relative shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={t("sharing.editAccount")}
          title={t("sharing.editAccount")}
          onClick={() => setEditingSubscriptionId(account.subscription.id)}
        >
          <SubscriptionLogo name={platformName} logo={account.subscription.logo ?? undefined} size="sm" />
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground tabular-nums">
            {account.accountNumber}
          </span>
        </button>
        <button type="button" className="min-w-0 text-left" onClick={() => setSelectedAccount(account)}>
          <span className="block truncate font-medium text-foreground hover:text-primary">{platformName}</span>
        </button>
      </div>
    );
  };

  const NearestExpiry = ({ accountId }: { accountId: string }) => {
    const nearest = sharingNearestSeatExpiry(accountDetails.get(accountId), today);
    if (!nearest) return <span className="text-muted-foreground">-</span>;
    const status = nearest.daysUntilExpiry < 0
      ? t("subscription.card.expiredDays", { days: Math.abs(nearest.daysUntilExpiry) })
      : nearest.daysUntilExpiry === 0
        ? t("common.today")
        : t("upcoming.daysShort", { days: nearest.daysUntilExpiry });
    return (
      <div className="grid gap-1">
        <span className="whitespace-nowrap text-xs font-medium tabular-nums text-foreground">{formatDateOnly(nearest.expiresAt)}</span>
        <span className={cn(
          "w-fit whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
          nearest.daysUntilExpiry < 0
            ? "bg-destructive/10 text-destructive"
            : nearest.daysUntilExpiry <= 7
              ? "bg-warning/10 text-warning"
              : "bg-primary/10 text-primary",
        )}>{status}</span>
      </div>
    );
  };

  return (
    <div className="app-page bg-background">
      <Header />
      <main className="app-main mx-auto max-w-7xl">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label={t("sharing.title")}>
          <StatCard title={t("sharing.accounts")} value={visibleAccounts.length} icon={<WalletCards />} density="dashboard" valueClassName="text-base 2xl:text-lg" className="animate-fade-in" />
          <StatCard title={t("sharing.occupiedSeats")} value={`${occupiedSeats} / ${capacity}`} icon={<UsersRound />} density="dashboard" valueClassName="text-base 2xl:text-lg" className="animate-fade-in [animation-delay:100ms]" />
          <StatCard title={t("sharing.monthlyRevenue")} value={formatCurrency(monthlyRevenue, defaultCurrency)} icon={<CircleDollarSign />} density="dashboard" variant="primary" valueClassName="text-base 2xl:text-lg" className="animate-fade-in [animation-delay:200ms]" />
          <StatCard title={t("sharing.outstanding")} value={formatCurrency(outstanding, defaultCurrency)} icon={<CircleDollarSign />} density="dashboard" valueClassName="text-base 2xl:text-lg" className="animate-fade-in [animation-delay:300ms]" />
          <StatCard title={t("sharing.monthlyProfit")} value={formatCurrency(monthlyProfit, defaultCurrency)} icon={<TrendingUp />} density="dashboard" variant={monthlyProfit < 0 ? "warning" : "primary"} valueClassName="text-base 2xl:text-lg" className="animate-fade-in [animation-delay:400ms]" />
          <StatCard
            title={t("sharing.upcomingRenewals")}
            value={upcomingRenewals}
            subtitle={t("sharing.nextSevenDays")}
            icon={<button type="button" className="flex h-full w-full items-center justify-center rounded-lg transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("sharing.openUpcomingRenewals")} title={t("sharing.openUpcomingRenewals")} onClick={() => setRenewalsOpen(true)}><CalendarClock /></button>}
            density="dashboard"
            variant={upcomingRenewals > 0 ? "warning" : "default"}
            valueClassName="text-base 2xl:text-lg"
            className="animate-fade-in [animation-delay:500ms]"
          />
        </section>

        {platformOptions.length > 0 ? (
          <div className="mt-6 flex flex-col rounded-t-lg border border-b-0 bg-card sm:flex-row sm:items-center">
            <PlatformFilterBar
              platforms={platformOptions}
              value={selectedPlatform}
              onValueChange={setSelectedPlatform}
              allLabel={t("sharing.allPlatforms")}
              moreLabel={t("sharing.morePlatforms")}
              ariaLabel={t("sharing.platformFilter")}
              className="min-w-0 flex-1 border-0 px-2"
            />
            <div className="relative mx-2 mb-2 shrink-0 sm:mb-0 sm:ml-0 sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("sharing.searchPlaceholder")}
                aria-label={t("sharing.searchPlaceholder")}
                className="h-9 bg-secondary pl-9"
              />
            </div>
          </div>
        ) : null}

        {accountsQuery.isError ? (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{t("sharing.loadFailed")}</div>
        ) : accounts.length === 0 && !accountsQuery.isPending ? (
          <section className="mt-6 flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary"><UsersRound className="h-6 w-6" /></div>
            <h3 className="mt-4 text-base font-semibold text-foreground">{t("sharing.emptyTitle")}</h3>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t("sharing.emptyDescription")}</p>
            <Button asChild variant="outline" className="mt-5"><Link href="/subscriptions">{t("sharing.goToSubscriptions")}</Link></Button>
          </section>
        ) : (
          <section className={cn(
            "overflow-hidden border border-border bg-card",
            platformOptions.length > 0
              ? "rounded-b-lg rounded-t-none border-t-0"
              : "mt-6 rounded-lg",
          )}>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-240 text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground"><tr>
                  <th className="px-4 py-3 font-medium">{t("sharing.accountName")}</th><th className="px-4 py-3 font-medium">{t("sharing.loginAccount")}</th><th className="px-3 py-3 font-medium">{t("sharing.seats")}</th><th className="w-36 px-3 py-3 font-medium">{t("sharing.nearestExpiry")}</th><th className="w-48 px-3 py-3 font-medium">{t("sharing.costAndRenewal")}</th><th className="px-4 py-3 text-right font-medium">{t("sharing.actions")}</th>
                </tr></thead>
                <tbody className="divide-y divide-border">{visibleAccounts.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">{t("sharing.noSearchResults")}</td></tr>
                ) : visibleAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3"><AccountIdentity account={account} /></td>
                    <td className="px-4 py-3"><button type="button" className="max-w-72 truncate text-primary hover:underline" title={t("sharing.copyAccount")} onClick={() => void copy(account.loginAccount)}>{account.loginAccount}</button></td>
                    <td className="px-3 py-3 tabular-nums">{account.occupiedSeats} / {account.capacity}</td>
                    <td className="px-3 py-3"><NearestExpiry accountId={account.id} /></td>
                    <td className="px-3 py-3">
                      <dl className="grid min-w-44 gap-0.5 rounded-md border border-border/70 bg-muted/45 px-2.5 py-2 text-[11px] text-muted-foreground">
                        <div className="flex items-center justify-between gap-2"><dt>{t("sharing.monthlyCost")}</dt><dd className="font-semibold tabular-nums text-foreground">{formatCurrency(Number(account.monthlyCost), account.currency)}</dd></div>
                        <div className="flex items-center justify-between gap-2"><dt>{t("sharing.monthlyProfit")}</dt><dd className={cn("font-medium tabular-nums", sharingMonthlyProfit(account, account.currency, convert) < 0 ? "text-amber-400" : "text-emerald-400")}>{formatCurrency(sharingMonthlyProfit(account, account.currency, convert), account.currency)}</dd></div>
                        <div className="flex items-center justify-between gap-2"><dt>{t("sharing.nextBillingDate")}</dt><dd className="tabular-nums text-foreground/85">{account.nextBillingDate}</dd></div>
                      </dl>
                    </td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1">
                      <Button type="button" size="icon" variant="ghost" title={t("sharing.copyPassword")} aria-label={t("sharing.copyPassword")} onClick={() => void copyPassword(account)}><KeyRound /></Button>
                      <Button type="button" size="icon" variant="ghost" title={t("sharing.copyLink")} aria-label={t("sharing.copyLink")} disabled={!account.verificationLink} onClick={() => account.verificationLink && void copy(account.verificationLink)}><LinkIcon /></Button>
                      <Button type="button" size="sm" variant="outline" title={t("sharing.copyAll")} onClick={() => void copyAll(account)}><Copy />{t("sharing.copyAll")}</Button>
                      <Button type="button" size="sm" onClick={() => setSelectedAccount(account)}>{t("sharing.manageAccount")}</Button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="divide-y divide-border sm:hidden">
              {visibleAccounts.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-muted-foreground">{t("sharing.noSearchResults")}</p>
              ) : visibleAccounts.map((account) => (
                <article key={account.id} className="space-y-4 p-4">
                  <AccountIdentity account={account} />
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    <div className="col-span-2 min-w-0"><dt className="text-muted-foreground">{t("sharing.loginAccount")}</dt><dd className="mt-1"><button type="button" className="max-w-full truncate text-left text-primary" onClick={() => void copy(account.loginAccount)}>{account.loginAccount}</button></dd></div>
                    <div><dt className="text-muted-foreground">{t("sharing.seats")}</dt><dd className="mt-1 font-medium tabular-nums text-foreground">{account.occupiedSeats} / {account.capacity}</dd></div>
                    <div><dt className="text-muted-foreground">{t("sharing.nearestExpiry")}</dt><dd className="mt-1"><NearestExpiry accountId={account.id} /></dd></div>
                    <div><dt className="text-muted-foreground">{t("sharing.monthlyCost")}</dt><dd className="mt-1 font-medium tabular-nums text-foreground">{formatCurrency(Number(account.monthlyCost), account.currency)}</dd></div>
                    <div><dt className="text-muted-foreground">{t("sharing.nextBillingDate")}</dt><dd className="mt-1 font-medium tabular-nums text-foreground">{account.nextBillingDate}</dd></div>
                    <div className="col-span-2"><dt className="text-muted-foreground">{t("sharing.monthlyProfit")}</dt><dd className={cn("mt-1 font-medium tabular-nums", sharingMonthlyProfit(account, account.currency, convert) < 0 ? "text-warning" : "text-primary")}>{formatCurrency(sharingMonthlyProfit(account, account.currency, convert), account.currency)}</dd></div>
                  </dl>
                  <div className="grid grid-cols-[2.75rem_2.75rem_minmax(0,1fr)] gap-2">
                    <Button type="button" size="icon" variant="outline" aria-label={t("sharing.copyPassword")} onClick={() => void copyPassword(account)}><KeyRound /></Button>
                    <Button type="button" size="icon" variant="outline" aria-label={t("sharing.copyLink")} disabled={!account.verificationLink} onClick={() => account.verificationLink && void copy(account.verificationLink)}><LinkIcon /></Button>
                    <Button type="button" className="min-w-0" onClick={() => setSelectedAccount(account)}>{t("sharing.manageAccount")}</Button>
                  </div>
                  <Button type="button" className="w-full" variant="outline" onClick={() => void copyAll(account)}><Copy />{t("sharing.copyAll")}</Button>
                </article>
              ))}
            </div>
          </section>
        )}
        <SharingAccountDetailDialog account={selectedAccount} open={Boolean(selectedAccount)} onOpenChange={(open) => !open && setSelectedAccount(null)} />
        <EditSubscriptionDialog
          subscription={editingSubscriptionQuery.data ?? null}
          loadingPreview={null}
          open={Boolean(editingSubscriptionId)}
          onOpenChange={(open) => !open && setEditingSubscriptionId(null)}
          onSave={saveSubscription}
          platformSuggestions={platformOptions}
          loading={editingSubscriptionQuery.isPending}
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
