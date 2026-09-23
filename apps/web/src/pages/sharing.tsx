import { useState, type FormEvent } from "react";
import { CircleDollarSign, Copy, KeyRound, Link as LinkIcon, Plus, TrendingUp, UsersRound, WalletCards } from "lucide-react";

import { Header } from "@/components/header";
import { SharingAccountDetailDialog } from "@/components/sharing-account-detail-dialog";
import Link from "@/components/router-link";
import { useRouteReady } from "@/components/route-progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldRow } from "@/components/ui/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { StatCard } from "@/components/ui/stat-card";
import { Textarea } from "@/components/ui/textarea";
import { useSharingAccounts, useCreateSharingAccount } from "@/hooks/use-sharing";
import { useSubscriptionIndex } from "@/hooks/use-subscriptions";
import { useI18n } from "@/i18n/I18nProvider";
import { sharingService } from "@/services/sharing-service";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import type { SharingAccount, SharingAccountCreate } from "@renewlet/shared/schemas/sharing";

export default function Sharing() {
  const { t, formatCurrency } = useI18n();
  const accountsQuery = useSharingAccounts();
  const createAccount = useCreateSharingAccount();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<SharingAccount | null>(null);
  const subscriptionsQuery = useSubscriptionIndex(undefined, dialogOpen);
  useRouteReady();

  const accounts = accountsQuery.data?.accounts ?? [];
  const occupiedSeats = accounts.reduce((total, account) => total + account.occupiedSeats, 0);
  const capacity = accounts.reduce((total, account) => total + account.capacity, 0);
  const outstanding = accounts.reduce((total, account) => total + Number(account.outstandingAmount), 0);
  const monthlyProfit = accounts.reduce((total, account) => total + account.monthlyProfit, 0);

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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: SharingAccountCreate = {
      subscriptionId,
      name: String(form.get("name") ?? ""),
      accountNumber: Number(form.get("accountNumber")),
      loginAccount: String(form.get("loginAccount") ?? ""),
      password: String(form.get("password") ?? ""),
      verificationLink: String(form.get("verificationLink") ?? ""),
      monthlyCost: String(form.get("monthlyCost") ?? ""),
      currency: String(form.get("currency") ?? "CNY").toUpperCase(),
      nextBillingDate: String(form.get("nextBillingDate") ?? ""),
      paymentMethod: String(form.get("paymentMethod") ?? ""),
      cardLast4: String(form.get("cardLast4") ?? ""),
      capacity: Number(form.get("capacity")),
      status: "active",
      notes: String(form.get("notes") ?? ""),
    };
    try {
      await createAccount.mutateAsync(input);
      toast.success(t("sharing.createSuccess"));
      setDialogOpen(false);
      setSubscriptionId("");
    } catch {
      toast.error(t("sharing.createFailed"));
    }
  };

  return (
    <div className="app-page bg-background">
      <Header />
      <main className="app-main mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{t("sharing.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("sharing.subtitle")}</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus />{t("sharing.addAccount")}</Button></DialogTrigger>
            <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto" dismissMode="explicit" closeLabel={t("sharing.cancel")}>
              <form onSubmit={submit} className="grid gap-5">
                <DialogHeader>
                  <DialogTitle>{t("sharing.addAccount")}</DialogTitle>
                  <DialogDescription>{t("sharing.addAccountDescription")}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                  <FormField id="sharing-subscription" label={t("sharing.subscription")}>
                    {(field) => (
                    <Select value={subscriptionId} onValueChange={setSubscriptionId}>
                      <SelectTrigger id={field.id} aria-describedby={field.describedBy}><SelectValue placeholder={t("sharing.subscription")} /></SelectTrigger>
                      <SelectContent>{(subscriptionsQuery.data?.subscriptions ?? []).map((subscription) => <SelectItem key={subscription.id} value={subscription.id}>{subscription.name}</SelectItem>)}</SelectContent>
                    </Select>
                    )}
                  </FormField>
                  <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
                    <FormField id="sharing-account-name" label={t("sharing.accountName")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} name="name" required maxLength={120} />}</FormField>
                    <FormField id="sharing-account-number" label={t("sharing.accountNumber")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} name="accountNumber" type="number" min={1} defaultValue={1} required />}</FormField>
                  </FormFieldRow>
                  <FormField id="sharing-login-account" label={t("sharing.loginAccount")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} name="loginAccount" required maxLength={320} autoComplete="username" />}</FormField>
                  <FormField id="sharing-password" label={t("sharing.password")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} name="password" type="password" required maxLength={1024} autoComplete="new-password" />}</FormField>
                  <FormField id="sharing-verification-link" label={t("sharing.verificationLink")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} name="verificationLink" type="url" />}</FormField>
                  <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
                    <FormField id="sharing-monthly-cost" label={t("sharing.monthlyCost")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} name="monthlyCost" type="number" min="0" step="0.01" required />}</FormField>
                    <FormField id="sharing-currency" label={t("sharing.currency")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} name="currency" defaultValue="CNY" maxLength={3} required />}</FormField>
                  </FormFieldRow>
                  <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
                    <FormField id="sharing-next-billing" label={t("sharing.nextBillingDate")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} name="nextBillingDate" type="date" required />}</FormField>
                    <FormField id="sharing-capacity" label={t("sharing.capacity")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} name="capacity" type="number" min={1} max={100} defaultValue={5} required />}</FormField>
                  </FormFieldRow>
                  <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
                    <FormField id="sharing-payment-method" label={t("sharing.paymentMethod")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} name="paymentMethod" maxLength={80} />}</FormField>
                    <FormField id="sharing-card-last4" label={t("sharing.cardLast4")}>{(field) => <Input id={field.id} aria-describedby={field.describedBy} name="cardLast4" maxLength={32} />}</FormField>
                  </FormFieldRow>
                  <FormField id="sharing-notes" label={t("sharing.notes")}>{(field) => <Textarea id={field.id} aria-describedby={field.describedBy} name="notes" maxLength={5000} />}</FormField>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button type="button" variant="outline">{t("sharing.cancel")}</Button></DialogClose>
                  <Button type="submit" disabled={createAccount.isPending || !subscriptionId}>{createAccount.isPending ? t("sharing.creating") : t("sharing.create")}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("sharing.title")}>
          <StatCard title={t("sharing.accounts")} value={accounts.length} icon={<WalletCards className="h-6 w-6" />} density="compact" />
          <StatCard title={t("sharing.occupiedSeats")} value={`${occupiedSeats} / ${capacity}`} icon={<UsersRound className="h-6 w-6" />} density="compact" />
          <StatCard title={t("sharing.outstanding")} value={formatCurrency(outstanding, "CNY")} icon={<CircleDollarSign className="h-6 w-6" />} density="compact" />
          <StatCard title={t("sharing.monthlyProfit")} value={formatCurrency(monthlyProfit, "CNY")} icon={<TrendingUp className="h-6 w-6" />} density="compact" />
        </section>

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
          <section className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-240 text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground"><tr>
                  <th className="px-4 py-3 font-medium">{t("sharing.accountName")}</th><th className="px-4 py-3 font-medium">{t("sharing.loginAccount")}</th><th className="px-4 py-3 font-medium">{t("sharing.seats")}</th><th className="px-4 py-3 font-medium">{t("sharing.costAndRenewal")}</th><th className="px-4 py-3 text-right font-medium">{t("sharing.actions")}</th>
                </tr></thead>
                <tbody className="divide-y divide-border">{accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3"><button type="button" className="text-left" onClick={() => setSelectedAccount(account)}><span className="font-medium text-foreground hover:text-primary">{account.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{account.subscription.name} #{account.accountNumber}</span></button></td>
                    <td className="px-4 py-3"><button type="button" className="max-w-72 truncate text-primary hover:underline" title={t("sharing.copyAccount")} onClick={() => void copy(account.loginAccount)}>{account.loginAccount}</button></td>
                    <td className="px-4 py-3 tabular-nums">{account.occupiedSeats} / {account.capacity}</td>
                    <td className="px-4 py-3"><div>{formatCurrency(Number(account.monthlyCost), account.currency)}</div><div className="mt-0.5 text-xs text-muted-foreground">{account.nextBillingDate} · {t("sharing.monthlyProfit")} {formatCurrency(account.monthlyProfit, account.currency)}</div></td>
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
          </section>
        )}
        <SharingAccountDetailDialog account={selectedAccount} open={Boolean(selectedAccount)} onOpenChange={(open) => !open && setSelectedAccount(null)} />
      </main>
    </div>
  );
}
