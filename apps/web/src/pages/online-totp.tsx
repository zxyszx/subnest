import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Copy, KeyRound, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { Header } from "@/components/header";
import { PlatformFilterBar } from "@/components/platform-filter-bar";
import { QueryErrorState } from "@/components/query-error-state";
import { SubscriptionLogo } from "@/components/subscription-logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField, FormFieldRow } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import { useCustomConfigState } from "@/contexts/CustomConfigContext";
import { useCreateOnlineTotpAccount, useDeleteOnlineTotpAccount, useOnlineTotpAccounts, useResetOnlineTotpShare, useUpdateOnlineTotpAccount } from "@/hooks/use-online-totp";
import { useRouteReady } from "@/components/route-progress";
import { useI18n } from "@/i18n/I18nProvider";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import type { OnlineTotpAccount, OnlineTotpAccountCreate, OnlineTotpAccountUpdate } from "@renewlet/shared/schemas/online-totp";
import { onlineTotpCopy } from "@/pages/online-totp-copy";

type AccountForm = OnlineTotpAccountCreate;
const EMPTY_FORM: AccountForm = { platformName: "", serviceName: "", accountNumber: 1, account: "", logo: "", secret: "", enabled: true, sharingEnabled: true };

export default function OnlineTotpPage() {
  const { t, locale } = useI18n();
  const text = onlineTotpCopy(locale);
  const { config } = useCustomConfigState();
  const query = useOnlineTotpAccounts();
  const { refetch } = query;
  const createMutation = useCreateOnlineTotpAccount();
  const deleteMutation = useDeleteOnlineTotpAccount();
  const resetMutation = useResetOnlineTotpShare();
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<OnlineTotpAccount | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  useRouteReady(query.isPending);

  const accounts = useMemo(() => query.data?.accounts ?? [], [query.data?.accounts]);
  useEffect(() => {
    const nextExpiry = Math.min(...accounts.filter((account) => account.enabled).map((account) => Date.parse(account.validUntil)));
    if (!Number.isFinite(nextExpiry)) return;
    const timer = window.setTimeout(() => void refetch(), Math.max(0, nextExpiry - Date.now() + 100));
    return () => window.clearTimeout(timer);
  }, [accounts, refetch]);
  const platforms = useMemo(() => Array.from(accounts.reduce((map, account) => {
    if (!map.has(account.platformName)) map.set(account.platformName, { name: account.platformName, logo: account.logo });
    return map;
  }, new Map<string, { name: string; logo: string | null }>()).values()), [accounts]);
  const filtered = accounts.filter((account) => {
    if (selectedPlatform && account.platformName !== selectedPlatform) return false;
    const needle = search.trim().toLocaleLowerCase();
    return !needle || [account.platformName, account.serviceName, account.account].some((value) => value.toLocaleLowerCase().includes(needle));
  });
  const configuredPlatforms = (config.platforms ?? []).filter((item) => item.enabled !== false).map((item) => ({
    name: item.value,
    label: item.labels[locale],
    logo: item.icon ?? "",
  }));

  const copy = async (value: string) => {
    const result = await copyTextToClipboard(value);
    if (result.ok) toast.success(t("sharing.copySuccess"));
    else toast.error(t("sharing.copyFailed"));
  };
  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (account: OnlineTotpAccount) => { setEditing(account); setDialogOpen(true); };

  return (
    <div className="app-page bg-background">
      <Header />
      <main className="app-main mx-auto max-w-7xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div><h2 className="text-2xl font-bold text-foreground">{t("nav.online2fa")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("sharing.accounts")}</p></div>
          <Button className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" />{text.createTitle}</Button>
        </div>

        {query.error ? <QueryErrorState error={query.error} onRetry={query.refetch} /> : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <PlatformFilterBar platforms={platforms} value={selectedPlatform} onValueChange={setSelectedPlatform} allLabel={t("sharing.allPlatforms")} moreLabel={t("sharing.morePlatforms")} ariaLabel={t("sharing.platformFilter")} className="px-3" />
            <div className="border-b p-3">
              <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("sharing.searchPlaceholder")} className="pl-9" /></div>
            </div>
            <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(220px,1.3fr)_180px_140px] gap-4 border-b bg-muted/35 px-5 py-3 text-sm font-medium text-muted-foreground md:grid">
              <span>{t("subscription.field.platformName")}</span><span>{t("sharing.loginAccount")}</span><span>{text.code}</span><span className="text-right">{t("sharing.actions")}</span>
            </div>
            {query.isPending ? <div className="py-20 text-center text-sm text-muted-foreground">{t("common.loading")}</div> : filtered.length === 0 ? <div className="py-20 text-center"><ShieldCheck className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><p className="text-sm text-muted-foreground">{accounts.length ? t("sharing.noSearchResults") : text.empty}</p></div> : filtered.map((account) => (
              <div key={account.id} className="grid gap-4 border-b px-4 py-4 last:border-b-0 md:grid-cols-[minmax(220px,1.4fr)_minmax(220px,1.3fr)_180px_140px] md:items-center md:px-5">
                <div className="flex min-w-0 items-center gap-3"><SubscriptionLogo name={account.platformName} logo={account.logo} size="sm" /><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-semibold">{account.platformName}</p><span className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">#{account.accountNumber}</span></div>{account.serviceName ? <p className="truncate text-sm text-muted-foreground">{account.serviceName}</p> : null}</div></div>
                <div className="flex min-w-0 items-center gap-2"><button type="button" className="min-w-0 truncate text-left text-sm hover:text-primary" onClick={() => void copy(account.account)}>{account.account}</button><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title={t("sharing.copyAccount")} onClick={() => void copy(account.account)}><Copy className="h-4 w-4" /></Button></div>
                <TotpCode account={account} onCopy={copy} />
                <div className="flex justify-end gap-2"><Button variant="outline" size="icon" className="h-10 w-10" title={t("sharing.copyLink")} disabled={!account.sharingEnabled} onClick={() => void copy(`${window.location.origin}${account.sharePath}`)}><KeyRound className="h-4 w-4" /></Button><Button variant="outline" size="icon" className="h-10 w-10" title={t("common.edit")} onClick={() => openEdit(account)}><Pencil className="h-4 w-4" /></Button></div>
              </div>
            ))}
          </div>
        )}
      </main>
      <OnlineTotpDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} platforms={configuredPlatforms} createMutation={createMutation} onDelete={async (id) => { await deleteMutation.mutateAsync(id); setDialogOpen(false); toast.success(text.deleted); }} onReset={async (id) => { await resetMutation.mutateAsync(id); toast.success(text.linkReset); }} />
    </div>
  );
}

function TotpCode({ account, onCopy }: { account: OnlineTotpAccount; onCopy: (value: string) => Promise<void> }) {
  const { locale } = useI18n();
  const text = onlineTotpCopy(locale);
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(account.validUntil) - now) / 1_000));
  if (!account.enabled) return <span className="text-sm text-muted-foreground">{text.paused}</span>;
  return <button type="button" onClick={() => void onCopy(account.code)} className="flex min-h-11 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="font-mono text-xl font-bold tabular-nums tracking-normal">{account.code.slice(0, 3)} {account.code.slice(3)}</span><span className="text-xs tabular-nums text-muted-foreground">{text.remaining(seconds)}</span></button>;
}

interface PlatformChoice { name: string; label: string; logo: string }
function OnlineTotpDialog({ open, onOpenChange, account, platforms, createMutation, onDelete, onReset }: { open: boolean; onOpenChange: (open: boolean) => void; account: OnlineTotpAccount | null; platforms: PlatformChoice[]; createMutation: ReturnType<typeof useCreateOnlineTotpAccount>; onDelete: (id: string) => Promise<void>; onReset: (id: string) => Promise<void> }) {
  const { t, locale } = useI18n();
  const text = onlineTotpCopy(locale);
  const updateMutation = useUpdateOnlineTotpAccount(account?.id ?? "");
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [confirm, setConfirm] = useState<"reset" | "delete" | null>(null);
  useEffect(() => {
    if (!open) return;
    setForm(account ? { platformName: account.platformName, serviceName: account.serviceName, accountNumber: account.accountNumber, account: account.account, logo: account.logo ?? "", secret: "", enabled: account.enabled, sharingEnabled: account.sharingEnabled } : { ...EMPTY_FORM, platformName: platforms[0]?.name ?? "", logo: platforms[0]?.logo ?? "" });
  }, [account, open, platforms]);
  const pending = createMutation.isPending || updateMutation.isPending;
  const set = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (account) await updateMutation.mutateAsync(form as OnlineTotpAccountUpdate); else await createMutation.mutateAsync(form);
      toast.success(text.saved); onOpenChange(false);
    } catch { toast.error(text.failed); }
  };
  const choosePlatform = (name: string) => { const choice = platforms.find((item) => item.name === name); setForm((current) => ({ ...current, platformName: name, logo: choice?.logo || current.logo })); };
  const confirmAction = async () => {
    if (!account || !confirm) return;
    try {
      if (confirm === "delete") await onDelete(account.id);
      else await onReset(account.id);
    } catch {
      toast.error(text.failed);
    } finally {
      setConfirm(null);
    }
  };
  return <>
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{account ? text.editTitle : text.createTitle}</DialogTitle><DialogDescription className="sr-only">{t("nav.online2fa")}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-5">
      <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-[1fr_1fr_110px]">
        <FormField id="otp-platform" label={t("subscription.field.platformName")}>{(field) => <><Input id={field.id} list="otp-platforms" required value={form.platformName} onChange={(event) => choosePlatform(event.target.value)} /><datalist id="otp-platforms">{platforms.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}</datalist></>}</FormField>
        <FormField id="otp-service" label={t("subscription.field.name")}>{(field) => <Input id={field.id} value={form.serviceName} onChange={(event) => set("serviceName", event.target.value)} />}</FormField>
        <FormField id="otp-number" label={t("sharing.accountNumber")}>{(field) => <Input id={field.id} type="number" min={1} max={10000} required value={form.accountNumber} onChange={(event) => set("accountNumber", Number(event.target.value))} />}</FormField>
      </FormFieldRow>
      <div className="space-y-2"><Label htmlFor="otp-account">{t("sharing.loginAccount")}</Label><Input id="otp-account" required value={form.account} onChange={(event) => set("account", event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="otp-secret">{text.secret}</Label><Input id="otp-secret" required={!account} autoComplete="off" value={form.secret} placeholder={account ? text.secretKeep : text.secretPlaceholder} onChange={(event) => set("secret", event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="otp-logo">{text.logo}</Label><Input id="otp-logo" value={form.logo} onChange={(event) => set("logo", event.target.value)} /></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="flex min-h-14 items-center justify-between rounded-md border px-4"><span className="font-medium">{text.enabled}</span><Switch checked={form.enabled} onCheckedChange={(value) => set("enabled", value)} /></label><label className="flex min-h-14 items-center justify-between rounded-md border px-4"><span className="font-medium">{text.shareEnabled}</span><Switch checked={form.sharingEnabled} onCheckedChange={(value) => set("sharingEnabled", value)} /></label></div>
      {account ? <div className="flex flex-wrap gap-2 border-t pt-4"><Button type="button" variant="outline" className="gap-2 text-destructive" onClick={() => setConfirm("reset")}><RefreshCw className="h-4 w-4" />{text.resetLink}</Button><Button type="button" variant="outline" className="gap-2 text-destructive" onClick={() => setConfirm("delete")}><Trash2 className="h-4 w-4" />{t("common.delete")}</Button></div> : null}
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button><Button type="submit" disabled={pending}>{pending ? t("common.saving") : t("common.save")}</Button></DialogFooter>
    </form></DialogContent></Dialog>
    <AlertDialog open={confirm !== null} onOpenChange={(value) => !value && setConfirm(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirm === "delete" ? text.deleteConfirmTitle : text.resetConfirmTitle}</AlertDialogTitle><AlertDialogDescription>{confirm === "delete" ? text.deleteConfirmDescription : text.resetConfirmDescription}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void confirmAction()}>{confirm === "delete" ? t("common.delete") : text.resetLink}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
