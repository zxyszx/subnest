import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, Copy, Link2, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserRound } from "lucide-react";
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
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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
import { onlineTotpAccountNumberExists } from "@/lib/online-totp-form";

type AccountForm = Omit<OnlineTotpAccountCreate, "accountNumber"> & { accountNumber: string };
const EMPTY_FORM: AccountForm = { platformName: "", serviceName: "", accountNumber: "", account: "", logo: "", secret: "", enabled: true, sharingEnabled: true };
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
  const headerAction = <Button className="h-10 gap-2 px-3" onClick={openCreate}><Plus className="h-4 w-4" /><span className="hidden min-[390px]:inline">{text.createTitle}</span><span className="sr-only min-[390px]:hidden">{text.createTitle}</span></Button>;

  return (
    <div className="app-page bg-background">
      <Header pageActions={headerAction} />
      <main className="app-main mx-auto max-w-[120rem]">
        {query.error ? <QueryErrorState error={query.error} onRetry={query.refetch} /> : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex flex-col gap-2 border-b px-3 py-2 sm:flex-row sm:items-center">
              <PlatformFilterBar platforms={platforms} value={selectedPlatform} onValueChange={setSelectedPlatform} allLabel={t("sharing.allPlatforms")} moreLabel={t("sharing.morePlatforms")} ariaLabel={t("sharing.platformFilter")} className="min-w-0 flex-1 border-0 px-0" />
              <div className="relative h-10 w-full shrink-0 sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label={t("sharing.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("sharing.searchPlaceholder")} className="h-10 w-full pl-9" />
              </div>
            </div>
            <div className="hidden grid-cols-[minmax(210px,1.1fr)_minmax(230px,1.4fr)_200px_180px] gap-4 border-b bg-muted/35 px-5 py-3 text-sm font-medium text-muted-foreground md:grid">
              <span>{t("subscription.field.platformName")}</span><span>{text.account}</span><span>{text.code}</span><span className="text-right">{t("sharing.actions")}</span>
            </div>
            {query.isPending ? <div className="py-20 text-center text-sm text-muted-foreground">{t("common.loading")}</div> : filtered.length === 0 ? <div className="py-20 text-center"><ShieldCheck className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><p className="text-sm text-muted-foreground">{accounts.length ? t("sharing.noSearchResults") : text.empty}</p></div> : filtered.map((account) => <OnlineTotpAccountRow key={account.id} account={account} onCopy={copy} onEdit={openEdit} />)}
          </div>
        )}
      </main>
      <OnlineTotpDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} accounts={accounts} createMutation={createMutation} onDelete={async (id) => { await deleteMutation.mutateAsync(id); setDialogOpen(false); toast.success(text.deleted); }} onReset={async (id) => { await resetMutation.mutateAsync(id); toast.success(text.linkReset); }} />
    </div>
  );
}

export function OnlineTotpAccountRow({ account, onCopy, onEdit }: { account: OnlineTotpAccount; onCopy: (value: string) => Promise<void>; onEdit: (account: OnlineTotpAccount) => void }) {
  const { t, locale } = useI18n();
  const text = onlineTotpCopy(locale);
  const [expanded, setExpanded] = useState(false);
  const shareUrl = `${window.location.origin}${account.sharePath}`;
  return <div className="border-b last:border-b-0" data-testid="online-totp-account" data-mobile-expanded={expanded}>
    <div className="flex min-h-16 items-center gap-2 px-3 py-2 md:hidden">
      <div className="relative shrink-0"><SubscriptionLogo name={account.serviceName || account.platformName} logo={account.logo} size="sm" /><span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground tabular-nums">{account.accountNumber}</span></div>
      <button type="button" className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void onCopy(account.account)}>
        <span className="block truncate text-sm font-semibold">{account.platformName}</span>
        <span className="block truncate text-xs text-muted-foreground">{account.account}</span>
      </button>
      <TotpCode account={account} onCopy={onCopy} compact />
      <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" aria-label={expanded ? t("subscription.card.collapseDetails") : t("subscription.card.expandDetails")} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} /></Button>
    </div>
    {expanded ? <div className="flex items-center justify-end gap-2 border-t bg-secondary/20 px-3 py-2 md:hidden"><Button variant="outline" className="h-10 gap-2 px-3" title={t("sharing.copyLink")} disabled={!account.sharingEnabled} onClick={() => void onCopy(shareUrl)}><Link2 className="h-4 w-4" />{text.shareLink}</Button><Button variant="outline" className="h-10 gap-2 px-3" onClick={() => onEdit(account)}><Pencil className="h-4 w-4" />{t("common.edit")}</Button></div> : null}
    <div className="hidden grid-cols-[minmax(210px,1.1fr)_minmax(230px,1.4fr)_200px_180px] items-center gap-4 px-5 py-4 md:grid">
      <div className="flex min-w-0 items-center gap-3"><div className="relative shrink-0"><SubscriptionLogo name={account.serviceName || account.platformName} logo={account.logo} size="sm" /><span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground tabular-nums">{account.accountNumber}</span></div><div className="min-w-0"><p className="truncate font-semibold">{account.platformName}</p>{account.serviceName && account.serviceName.trim().toLocaleLowerCase() !== account.platformName.trim().toLocaleLowerCase() ? <p className="truncate text-sm text-muted-foreground">{account.serviceName}</p> : null}</div></div>
      <button type="button" className="flex min-h-12 min-w-0 items-center gap-3 rounded-md border bg-secondary/30 px-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void onCopy(account.account)}><UserRound className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 truncate text-sm">{account.account}</span></button>
      <TotpCode account={account} onCopy={onCopy} />
      <div className="flex justify-end gap-2"><Button variant="outline" className="h-10 gap-2 px-3" title={t("sharing.copyLink")} disabled={!account.sharingEnabled} onClick={() => void onCopy(shareUrl)}><Link2 className="h-4 w-4" />{text.shareLink}</Button><Button variant="outline" size="icon" className="h-10 w-10" title={t("common.edit")} onClick={() => onEdit(account)}><Pencil className="h-4 w-4" /></Button></div>
    </div>
  </div>;
}

function TotpCode({ account, onCopy, compact = false }: { account: OnlineTotpAccount; onCopy: (value: string) => Promise<void>; compact?: boolean }) {
  const { locale } = useI18n();
  const text = onlineTotpCopy(locale);
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil((Date.parse(account.validUntil) - now) / 1_000));
  if (!account.enabled) return <span className={compact ? "inline-flex h-10 shrink-0 items-center rounded-md bg-muted px-2 text-xs text-muted-foreground" : "inline-flex min-h-11 items-center rounded-md bg-muted px-3 text-sm text-muted-foreground"}>{text.paused}</span>;
  return <button type="button" onClick={() => void onCopy(account.code)} className={compact ? "flex h-10 shrink-0 items-center rounded-md bg-primary/5 px-2 font-mono text-sm font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : "flex min-h-12 items-center gap-3 rounded-md border bg-primary/5 px-3 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"}>{compact ? <span>{account.code.slice(0, 3)} {account.code.slice(3)}</span> : <><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /><span className="font-mono text-lg font-bold tabular-nums tracking-normal">{account.code.slice(0, 3)} {account.code.slice(3)}</span><span className="text-xs tabular-nums text-muted-foreground">{text.remaining(seconds)}</span></>}</button>;
}

function PlatformNameCombobox({ id, value, accounts, placeholder, onChange }: { id: string; value: string; accounts: readonly OnlineTotpAccount[]; placeholder: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [anchorWidth, setAnchorWidth] = useState<number>();
  const options = useMemo(() => Array.from(accounts.reduce((items, account) => {
    const normalized = account.platformName.trim().toLocaleLowerCase();
    if (normalized && !items.has(normalized)) items.set(normalized, account);
    return items;
  }, new Map<string, OnlineTotpAccount>()).values()), [accounts]);
  const visibleOptions = options.filter((option) => !value.trim() || option.platformName.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()));
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const measure = () => setAnchorWidth(anchor.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  return <Popover open={open && options.length > 0} onOpenChange={setOpen}>
    <PopoverAnchor asChild>
      <div ref={anchorRef} className="relative">
        <Input id={id} name="online-totp-platform" autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-form-type="other" required maxLength={80} value={value} onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true); }} placeholder={placeholder} className="pr-10" />
        <button type="button" aria-label={placeholder} aria-expanded={open} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => setOpen((current) => !current)}><ChevronDown className="h-4 w-4" /></button>
      </div>
    </PopoverAnchor>
    <PopoverContent align="start" sideOffset={6} mobilePresentation="anchored" style={anchorWidth ? { width: anchorWidth } : undefined} className="min-w-0 border-border bg-popover p-1">
      <div className="max-h-56 overflow-y-auto">
        {visibleOptions.length ? visibleOptions.map((option) => {
          const selected = option.platformName.trim().toLocaleLowerCase() === value.trim().toLocaleLowerCase();
          return <button key={option.id} type="button" className="flex min-h-11 w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none" onClick={() => { onChange(option.platformName); setOpen(false); }}><SubscriptionLogo name={option.platformName} logo={option.logo} size="xs" /><span className="min-w-0 flex-1 truncate">{option.platformName}</span>{selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}</button>;
        }) : <p className="px-3 py-4 text-center text-sm text-muted-foreground">{placeholder}</p>}
      </div>
    </PopoverContent>
  </Popover>;
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
    setForm(account ? { platformName: account.platformName, serviceName: account.serviceName, accountNumber: String(account.accountNumber), account: account.account, logo: account.logo ?? "", secret: "", enabled: account.enabled, sharingEnabled: account.sharingEnabled } : { ...EMPTY_FORM });
  }, [account, open]);
  const pending = createMutation.isPending || updateMutation.isPending || logoUploadStatus === "uploading";
  const parsedAccountNumber = Number(form.accountNumber);
  const duplicateAccountNumber = Number.isInteger(parsedAccountNumber) && parsedAccountNumber > 0
    ? onlineTotpAccountNumberExists(accounts, form.platformName, parsedAccountNumber, account?.id)
    : false;
  const set = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setPlatformName = (platformName: string) => {
    setForm((current) => ({
      ...current,
      platformName,
    }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (duplicateAccountNumber) return;
    try {
      const payload = { ...form, accountNumber: parsedAccountNumber };
      if (account) await updateMutation.mutateAsync(payload as OnlineTotpAccountUpdate); else await createMutation.mutateAsync(payload as OnlineTotpAccountCreate);
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
        <FormField id="otp-platform" label={t("subscription.field.platformName")}>{(field) => <PlatformNameCombobox id={field.id} value={form.platformName} accounts={accounts} placeholder={text.platformPlaceholder} onChange={setPlatformName} />}</FormField>
        <FormField id="otp-service" label={t("subscription.field.name")}>{(field) => <Input id={field.id} name="online-totp-service" autoComplete="off" data-1p-ignore="true" data-lpignore="true" value={form.serviceName} onChange={(event) => set("serviceName", event.target.value)} />}</FormField>
        <FormField id="otp-number" label={t("sharing.accountNumber")} error={duplicateAccountNumber ? text.alreadyAdded : undefined}>{(field) => <Input id={field.id} name="online-totp-number" autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-form-type="other" type="number" inputMode="numeric" min={1} max={10000} required aria-invalid={duplicateAccountNumber || undefined} value={form.accountNumber} onChange={(event) => set("accountNumber", event.target.value)} />}</FormField>
      </FormFieldRow>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-md border bg-secondary/30" aria-label={t("common.loading")} />}><DeferredLogoPicker compact value={form.logo || undefined} onChange={(logo) => set("logo", logo ?? "")} onUploadStatusChange={setLogoUploadStatus} serviceName={form.serviceName} /></Suspense>
      <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
        <FormField id="otp-account" label={text.account}>{(field) => <Input id={field.id} name="online-totp-account" autoComplete="username" required value={form.account} onChange={(event) => set("account", event.target.value)} />}</FormField>
        <FormField id="otp-secret" label={text.secret}>{(field) => <Input id={field.id} name="online-totp-secret" autoComplete="new-password" data-1p-ignore="true" data-lpignore="true" required={!account} value={form.secret} placeholder={account ? text.secretKeep : text.secretPlaceholder} onChange={(event) => set("secret", event.target.value)} />}</FormField>
      </FormFieldRow>
      <div className="rounded-lg border bg-secondary/20 p-4"><label className="flex min-h-11 items-center justify-between gap-4"><span><span className="block font-medium">{text.shareEnabled}</span><span className="mt-1 block text-sm text-muted-foreground">{form.sharingEnabled ? text.shareActiveHint : text.sharePausedHint}</span></span><Switch checked={form.sharingEnabled} onCheckedChange={(value) => set("sharingEnabled", value)} /></label>{account ? <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2"><Button type="button" variant="outline" className="justify-start gap-2" disabled={!form.sharingEnabled} onClick={() => void copyTextToClipboard(`${window.location.origin}${account.sharePath}`).then((result) => toast[result.ok ? "success" : "error"](t(result.ok ? "sharing.copySuccess" : "sharing.copyFailed")))}><Copy className="h-4 w-4" />{text.shareLink}</Button><Button type="button" variant="outline" className="justify-start gap-2 text-destructive" onClick={() => setConfirm("reset")}><RefreshCw className="h-4 w-4" />{text.resetLink}</Button></div> : null}</div>
      {account ? <div className="flex flex-wrap border-t pt-4"><Button type="button" variant="outline" className="gap-2 text-destructive" onClick={() => setConfirm("delete")}><Trash2 className="h-4 w-4" />{t("common.delete")}</Button></div> : null}
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button><Button type="submit" disabled={pending || duplicateAccountNumber}>{pending ? t("common.saving") : t("common.save")}</Button></DialogFooter>
    </form></DialogContent></Dialog>
    <AlertDialog open={confirm !== null} onOpenChange={(value) => !value && setConfirm(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirm === "delete" ? text.deleteConfirmTitle : text.resetConfirmTitle}</AlertDialogTitle><AlertDialogDescription>{confirm === "delete" ? text.deleteConfirmDescription : text.resetConfirmDescription}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void confirmAction()}>{confirm === "delete" ? t("common.delete") : text.resetLink}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
