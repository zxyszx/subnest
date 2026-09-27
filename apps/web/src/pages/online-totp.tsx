import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { Hash, Link2, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { Header } from "@/components/header";
import type { UploadStatus } from "@/components/logo-picker";
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
import { useCreateOnlineTotpAccount, useDeleteOnlineTotpAccount, useOnlineTotpAccounts, useResetOnlineTotpShare, useUpdateOnlineTotpAccount } from "@/hooks/use-online-totp";
import { useRouteReady } from "@/components/route-progress";
import { useI18n } from "@/i18n/I18nProvider";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import type { OnlineTotpAccount, OnlineTotpAccountCreate, OnlineTotpAccountUpdate } from "@renewlet/shared/schemas/online-totp";
import { onlineTotpCopy } from "@/pages/online-totp-copy";
import { findOnlineTotpPlatform, onlineTotpAccountNumberExists } from "@/lib/online-totp-form";

type AccountForm = OnlineTotpAccountCreate;
const EMPTY_FORM: AccountForm = { platformName: "", serviceName: "", accountNumber: 1, account: "", logo: "", secret: "", enabled: true, sharingEnabled: true };
const DeferredLogoPicker = lazy(() => import("@/components/logo-picker").then((module) => ({ default: module.LogoPicker })));

export default function OnlineTotpPage() {
  const { t, locale } = useI18n();
  const text = onlineTotpCopy(locale);
  const query = useOnlineTotpAccounts();
  const { refetch } = query;
  const createMutation = useCreateOnlineTotpAccount();
  const deleteMutation = useDeleteOnlineTotpAccount();
  const resetMutation = useResetOnlineTotpShare();
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<OnlineTotpAccount | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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
  const copy = async (value: string) => {
    const result = await copyTextToClipboard(value);
    if (result.ok) toast.success(t("sharing.copySuccess"));
    else toast.error(t("sharing.copyFailed"));
  };
  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (account: OnlineTotpAccount) => { setEditing(account); setDialogOpen(true); };
  const headerAction = <Button className="hidden gap-2 sm:inline-flex" onClick={openCreate}><Plus className="h-4 w-4" />{text.createTitle}</Button>;

  return (
    <div className="app-page bg-background">
      <Header pageActions={headerAction} />
      <main className="app-main mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-2xl font-bold text-foreground">{t("nav.online2fa")}</h2><Button className="gap-2 sm:hidden" onClick={openCreate}><Plus className="h-4 w-4" />{text.createTitle}</Button></div>

        {query.error ? <QueryErrorState error={query.error} onRetry={query.refetch} /> : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex flex-col gap-2 border-b px-3 py-2 sm:flex-row sm:items-center">
              <PlatformFilterBar platforms={platforms} value={selectedPlatform} onValueChange={setSelectedPlatform} allLabel={t("sharing.allPlatforms")} moreLabel={t("sharing.morePlatforms")} ariaLabel={t("sharing.platformFilter")} className="min-w-0 flex-1 border-0 px-0" />
              <div className="relative h-10 w-full shrink-0 sm:w-72">
                <div className={`absolute left-0 top-0 h-10 overflow-hidden transition-[width] duration-200 ${searchOpen || search ? "w-full" : "w-10"}`}>
                  <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input aria-label={t("sharing.searchPlaceholder")} value={search} onFocus={() => setSearchOpen(true)} onChange={(event) => setSearch(event.target.value)} onBlur={() => { if (!search) setSearchOpen(false); }} placeholder={t("sharing.searchPlaceholder")} className="h-10 w-full pl-9" />
                </div>
              </div>
            </div>
            <div className="hidden grid-cols-[64px_minmax(180px,1.1fr)_minmax(230px,1.4fr)_200px_180px] gap-4 border-b bg-muted/35 px-5 py-3 text-sm font-medium text-muted-foreground md:grid">
              <span>{text.sequence}</span><span>{t("subscription.field.platformName")}</span><span>{text.account}</span><span>{text.code}</span><span className="text-right">{t("sharing.actions")}</span>
            </div>
            {query.isPending ? <div className="py-20 text-center text-sm text-muted-foreground">{t("common.loading")}</div> : filtered.length === 0 ? <div className="py-20 text-center"><ShieldCheck className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><p className="text-sm text-muted-foreground">{accounts.length ? t("sharing.noSearchResults") : text.empty}</p></div> : filtered.map((account) => (
              <div key={account.id} className="grid gap-3 border-b px-4 py-4 last:border-b-0 md:grid-cols-[64px_minmax(180px,1.1fr)_minmax(230px,1.4fr)_200px_180px] md:items-center md:gap-4 md:px-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Hash className="h-4 w-4" /><span>#{account.accountNumber}</span></div>
                <div className="flex min-w-0 items-center gap-3"><SubscriptionLogo name={account.platformName} logo={account.logo} size="sm" /><div className="min-w-0"><p className="truncate font-semibold">{account.platformName}</p>{account.serviceName ? <p className="truncate text-sm text-muted-foreground">{account.serviceName}</p> : null}</div></div>
                <button type="button" className="flex min-h-12 min-w-0 items-center gap-3 rounded-md border bg-secondary/30 px-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void copy(account.account)}><UserRound className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 truncate text-sm">{account.account}</span></button>
                <TotpCode account={account} onCopy={copy} />
                <div className="flex justify-start gap-2 md:justify-end"><Button variant="outline" className="h-10 gap-2 px-3" title={t("sharing.copyLink")} disabled={!account.sharingEnabled} onClick={() => void copy(`${window.location.origin}${account.sharePath}`)}><Link2 className="h-4 w-4" />{text.shareLink}</Button><Button variant="outline" size="icon" className="h-10 w-10" title={t("common.edit")} onClick={() => openEdit(account)}><Pencil className="h-4 w-4" /></Button></div>
              </div>
            ))}
          </div>
        )}
      </main>
      <OnlineTotpDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} accounts={accounts} createMutation={createMutation} onDelete={async (id) => { await deleteMutation.mutateAsync(id); setDialogOpen(false); toast.success(text.deleted); }} onReset={async (id) => { await resetMutation.mutateAsync(id); toast.success(text.linkReset); }} />
    </div>
  );
}

function TotpCode({ account, onCopy }: { account: OnlineTotpAccount; onCopy: (value: string) => Promise<void> }) {
  const { locale } = useI18n();
  const text = onlineTotpCopy(locale);
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(account.validUntil) - now) / 1_000));
  if (!account.enabled) return <span className="inline-flex min-h-11 items-center rounded-md bg-muted px-3 text-sm text-muted-foreground">{text.paused}</span>;
  return <button type="button" onClick={() => void onCopy(account.code)} className="flex min-h-12 items-center gap-3 rounded-md border bg-primary/5 px-3 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /><span className="font-mono text-lg font-bold tabular-nums tracking-normal">{account.code.slice(0, 3)} {account.code.slice(3)}</span><span className="text-xs tabular-nums text-muted-foreground">{text.remaining(seconds)}</span></button>;
}

function OnlineTotpDialog({ open, onOpenChange, account, accounts, createMutation, onDelete, onReset }: { open: boolean; onOpenChange: (open: boolean) => void; account: OnlineTotpAccount | null; accounts: readonly OnlineTotpAccount[]; createMutation: ReturnType<typeof useCreateOnlineTotpAccount>; onDelete: (id: string) => Promise<void>; onReset: (id: string) => Promise<void> }) {
  const { t, locale } = useI18n();
  const text = onlineTotpCopy(locale);
  const updateMutation = useUpdateOnlineTotpAccount(account?.id ?? "");
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [logoUploadStatus, setLogoUploadStatus] = useState<UploadStatus>("idle");
  const [confirm, setConfirm] = useState<"reset" | "delete" | null>(null);
  useEffect(() => {
    if (!open) return;
    setLogoUploadStatus("idle");
    setForm(account ? { platformName: account.platformName, serviceName: account.serviceName, accountNumber: account.accountNumber, account: account.account, logo: account.logo ?? "", secret: "", enabled: account.enabled, sharingEnabled: account.sharingEnabled } : { ...EMPTY_FORM });
  }, [account, open]);
  const pending = createMutation.isPending || updateMutation.isPending || logoUploadStatus === "uploading";
  const duplicateAccountNumber = onlineTotpAccountNumberExists(accounts, form.platformName, form.accountNumber, account?.id);
  const set = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setPlatformName = (platformName: string) => {
    const existingPlatform = findOnlineTotpPlatform(accounts, platformName);
    setForm((current) => ({
      ...current,
      platformName,
      ...(existingPlatform ? { logo: existingPlatform.logo ?? "" } : {}),
    }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (duplicateAccountNumber) return;
    try {
      if (account) await updateMutation.mutateAsync(form as OnlineTotpAccountUpdate); else await createMutation.mutateAsync(form);
      toast.success(text.saved); onOpenChange(false);
    } catch { toast.error(text.failed); }
  };
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
        <FormField id="otp-platform" label={t("subscription.field.platformName")}>{(field) => <><Input id={field.id} name="online-totp-platform" list="online-totp-platforms" autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-form-type="other" required maxLength={80} value={form.platformName} onChange={(event) => setPlatformName(event.target.value)} placeholder={text.platformPlaceholder} /><datalist id="online-totp-platforms">{Array.from(new Set(accounts.map((item) => item.platformName))).map((name) => <option key={name} value={name} />)}</datalist></>}</FormField>
        <FormField id="otp-service" label={t("subscription.field.name")}>{(field) => <Input id={field.id} name="online-totp-service" autoComplete="off" data-1p-ignore="true" data-lpignore="true" value={form.serviceName} onChange={(event) => set("serviceName", event.target.value)} />}</FormField>
        <FormField id="otp-number" label={t("sharing.accountNumber")} error={duplicateAccountNumber ? text.alreadyAdded : undefined}>{(field) => <Input id={field.id} name="online-totp-number" autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-form-type="other" type="number" min={1} max={10000} required aria-invalid={duplicateAccountNumber || undefined} value={form.accountNumber} onChange={(event) => set("accountNumber", Number(event.target.value))} />}</FormField>
      </FormFieldRow>
      <Suspense fallback={<div className="h-28 animate-pulse rounded-md border bg-secondary/30" aria-label={t("common.loading")} />}><DeferredLogoPicker value={form.logo || undefined} onChange={(logo) => set("logo", logo ?? "")} onUploadStatusChange={setLogoUploadStatus} serviceName={form.platformName || form.serviceName} /></Suspense>
      <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
        <FormField id="otp-account" label={text.account}>{(field) => <Input id={field.id} name="online-totp-account" autoComplete="username" required value={form.account} onChange={(event) => set("account", event.target.value)} />}</FormField>
        <FormField id="otp-secret" label={text.secret}>{(field) => <Input id={field.id} name="online-totp-secret" autoComplete="new-password" data-1p-ignore="true" data-lpignore="true" required={!account} value={form.secret} placeholder={account ? text.secretKeep : text.secretPlaceholder} onChange={(event) => set("secret", event.target.value)} />}</FormField>
      </FormFieldRow>
      <div className="rounded-lg border bg-secondary/20 p-4"><label className="flex min-h-10 items-center justify-between gap-4"><span><span className="block font-medium">{text.shareEnabled}</span><span className="mt-1 block text-sm text-muted-foreground">{form.sharingEnabled ? text.shareActiveHint : text.sharePausedHint}</span></span><Switch checked={form.sharingEnabled} onCheckedChange={(value) => set("sharingEnabled", value)} /></label>{account ? <div className="mt-4 flex flex-wrap gap-2 border-t pt-4"><Button type="button" variant="outline" className="gap-2 text-destructive" onClick={() => setConfirm("reset")}><RefreshCw className="h-4 w-4" />{text.resetLink}</Button></div> : null}</div>
      {account ? <div className="flex flex-wrap border-t pt-4"><Button type="button" variant="outline" className="gap-2 text-destructive" onClick={() => setConfirm("delete")}><Trash2 className="h-4 w-4" />{t("common.delete")}</Button></div> : null}
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button><Button type="submit" disabled={pending || duplicateAccountNumber}>{pending ? t("common.saving") : t("common.save")}</Button></DialogFooter>
    </form></DialogContent></Dialog>
    <AlertDialog open={confirm !== null} onOpenChange={(value) => !value && setConfirm(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirm === "delete" ? text.deleteConfirmTitle : text.resetConfirmTitle}</AlertDialogTitle><AlertDialogDescription>{confirm === "delete" ? text.deleteConfirmDescription : text.resetConfirmDescription}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void confirmAction()}>{confirm === "delete" ? t("common.delete") : text.resetLink}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
