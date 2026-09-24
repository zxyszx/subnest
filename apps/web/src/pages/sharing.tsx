import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CircleDollarSign, Copy, KeyRound, Link as LinkIcon, TrendingUp, UsersRound, WalletCards } from "lucide-react";

import { Header } from "@/components/header";
import { SharingAccountDetailDialog } from "@/components/sharing-account-detail-dialog";
import { EditSubscriptionDialog } from "@/components/edit-subscription-dialog";
import { SubscriptionLogo } from "@/components/subscription-logo";
import { SharingPaymentSummary } from "@/components/sharing-payment-summary";
import Link from "@/components/router-link";
import { useRouteReady } from "@/components/route-progress";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { StatCard } from "@/components/ui/stat-card";
import { PlatformFilterBar } from "@/components/platform-filter-bar";
import { sharingQueryKeys, useSharingAccounts } from "@/hooks/use-sharing";
import { useSubscriptionDetail, useUpdateSubscription } from "@/hooks/use-subscriptions";
import { useExchangeRates } from "@/hooks/use-exchange-rates";
import { useSettingsEnvelope } from "@/hooks/use-settings";
import { useZonedToday } from "@/hooks/use-zoned-today";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { sharingMonthlyProfit, sharingUpcomingRenewalCount } from "@/lib/sharing-financials";
import { subscriptionPlatformName } from "@/lib/subscription-platform";
import { sharingService } from "@/services/sharing-service";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import type { SharingAccount } from "@renewlet/shared/schemas/sharing";

export default function Sharing() {
  const { t, formatCurrency } = useI18n();
  const accountsQuery = useSharingAccounts();
  const settingsQuery = useSettingsEnvelope();
  const defaultCurrency = settingsQuery.data?.settings.defaultCurrency ?? "CNY";
  const today = useZonedToday(settingsQuery.data?.settings.timezone ?? "UTC");
  const { convert } = useExchangeRates(settingsQuery.data?.settings.exchangeRateProvider);
  const [selectedAccount, setSelectedAccount] = useState<SharingAccount | null>(null);
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
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
  const visibleAccounts = selectedPlatform
    ? accounts
        .filter((account) => subscriptionPlatformName(account.subscription) === selectedPlatform)
        .sort((left, right) => left.accountNumber - right.accountNumber || left.name.localeCompare(right.name))
    : accounts;
  const occupiedSeats = visibleAccounts.reduce((total, account) => total + account.occupiedSeats, 0);
  const capacity = visibleAccounts.reduce((total, account) => total + account.capacity, 0);
  const outstanding = visibleAccounts.reduce(
    (total, account) => total + convert(Number(account.outstandingAmount), account.currency, defaultCurrency),
    0,
  );
  const monthlyProfit = visibleAccounts.reduce(
    (total, account) => total + sharingMonthlyProfit(account, defaultCurrency, convert),
    0,
  );
  const upcomingRenewals = sharingUpcomingRenewalCount(visibleAccounts, today);

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

  return (
    <div className="app-page bg-background">
      <Header />
      <main className="app-main mx-auto max-w-7xl">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label={t("sharing.title")}>
          <StatCard title={t("sharing.accounts")} value={visibleAccounts.length} icon={<WalletCards />} density="dashboard" />
          <StatCard title={t("sharing.occupiedSeats")} value={`${occupiedSeats} / ${capacity}`} icon={<UsersRound />} density="dashboard" />
          <StatCard title={t("sharing.outstanding")} value={formatCurrency(outstanding, defaultCurrency)} icon={<CircleDollarSign />} density="dashboard" />
          <StatCard title={t("sharing.monthlyProfit")} value={formatCurrency(monthlyProfit, defaultCurrency)} icon={<TrendingUp />} density="dashboard" variant={monthlyProfit < 0 ? "warning" : "primary"} />
          <StatCard title={t("sharing.upcomingRenewals")} value={upcomingRenewals} subtitle={t("sharing.nextSevenDays")} icon={<CalendarClock />} density="dashboard" variant={upcomingRenewals > 0 ? "warning" : "default"} />
        </section>

        {platformOptions.length > 0 ? (
          <PlatformFilterBar
            platforms={platformOptions}
            value={selectedPlatform}
            onValueChange={setSelectedPlatform}
            allLabel={t("sharing.allPlatforms")}
            moreLabel={t("sharing.morePlatforms")}
            ariaLabel={t("sharing.platformFilter")}
            className="mt-6 rounded-t-lg border border-b-0 bg-card px-2"
          />
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
                  <th className="px-4 py-3 font-medium">{t("sharing.accountName")}</th><th className="px-4 py-3 font-medium">{t("sharing.loginAccount")}</th><th className="px-4 py-3 font-medium">{t("sharing.seats")}</th><th className="w-64 px-4 py-3 font-medium">{t("sharing.costAndRenewal")}</th><th className="px-4 py-3 text-right font-medium">{t("sharing.actions")}</th>
                </tr></thead>
                <tbody className="divide-y divide-border">{visibleAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3"><AccountIdentity account={account} /></td>
                    <td className="px-4 py-3"><button type="button" className="max-w-72 truncate text-primary hover:underline" title={t("sharing.copyAccount")} onClick={() => void copy(account.loginAccount)}>{account.loginAccount}</button></td>
                    <td className="px-4 py-3 tabular-nums">{account.occupiedSeats} / {account.capacity}</td>
                    <td className="px-4 py-3">
                      <div className="grid min-w-52 gap-1.5 text-xs">
                        <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{t("sharing.monthlyCost")}</span><strong className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(Number(account.monthlyCost), account.currency)}</strong></div>
                        <div className="flex items-center gap-1.5 text-muted-foreground"><CalendarClock className="h-3.5 w-3.5 shrink-0" /><span>{t("sharing.nextBillingDate")}</span><span className="ml-auto tabular-nums text-foreground">{account.nextBillingDate}</span></div>
                        <div className="flex items-center gap-1.5 text-muted-foreground"><TrendingUp className="h-3.5 w-3.5 shrink-0" /><span>{t("sharing.monthlyProfit")}</span><span className={cn("ml-auto font-medium tabular-nums", sharingMonthlyProfit(account, account.currency, convert) < 0 ? "text-warning" : "text-primary")}>{formatCurrency(sharingMonthlyProfit(account, account.currency, convert), account.currency)}</span></div>
                        <SharingPaymentSummary paymentMethod={account.paymentMethod} cardLast4={account.cardLast4} className="text-muted-foreground" />
                      </div>
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
              {visibleAccounts.map((account) => (
                <article key={account.id} className="space-y-4 p-4">
                  <AccountIdentity account={account} />
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    <div className="col-span-2 min-w-0"><dt className="text-muted-foreground">{t("sharing.loginAccount")}</dt><dd className="mt-1"><button type="button" className="max-w-full truncate text-left text-primary" onClick={() => void copy(account.loginAccount)}>{account.loginAccount}</button></dd></div>
                    <div><dt className="text-muted-foreground">{t("sharing.seats")}</dt><dd className="mt-1 font-medium tabular-nums text-foreground">{account.occupiedSeats} / {account.capacity}</dd></div>
                    <div><dt className="text-muted-foreground">{t("sharing.costAndRenewal")}</dt><dd className="mt-1 font-medium tabular-nums text-foreground">{formatCurrency(Number(account.monthlyCost), account.currency)}</dd></div>
                    <div className="col-span-2"><dt className="text-muted-foreground">{t("sharing.monthlyProfit")}</dt><dd className="mt-1 font-medium tabular-nums text-foreground">{formatCurrency(sharingMonthlyProfit(account, account.currency, convert), account.currency)} · {account.nextBillingDate}</dd></div>
                    {account.paymentMethod || account.cardLast4 ? <div className="col-span-2"><dt className="text-muted-foreground">{t("sharing.paymentMethod")}</dt><dd className="mt-1 font-medium text-foreground"><SharingPaymentSummary paymentMethod={account.paymentMethod} cardLast4={account.cardLast4} /></dd></div> : null}
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
      </main>
    </div>
  );
}
