import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, Loader2, Mail, RefreshCw, ShieldCheck, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormField, FormFieldRow } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/I18nProvider";
import type { FamilySharingFormState } from "@/types/subscription-form";
import { subscriptionService } from "@/services/subscription-service";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import { toast } from "@/components/ui/sonner";
import { generateFamilySharingPassword } from "@/lib/family-sharing-password";
import { newszxcnService, type NewSzxcnMailbox, type SharedInboxLink } from "@/services/newszxcn-service";
import { onlineTotpService } from "@/services/online-totp-service";
import type { OnlineTotpAccount } from "@renewlet/shared/schemas/online-totp";

export function SubscriptionFamilySharingFields({ id, subscriptionId, value, onChange, error, onShareSetupPendingChange, showEnabledControl = true }: {
  id: (name: string) => string;
  subscriptionId?: string | undefined;
  value: FamilySharingFormState;
  onChange: (value: FamilySharingFormState) => void;
  error?: string | undefined;
  onShareSetupPendingChange?: ((pending: boolean) => void) | undefined;
  showEnabledControl?: boolean | undefined;
}) {
  const { t } = useI18n();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [mailboxes, setMailboxes] = useState<NewSzxcnMailbox[]>([]);
  const [inboxLinks, setInboxLinks] = useState<SharedInboxLink[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxFailed, setInboxFailed] = useState(false);
  const [inboxNow, setInboxNow] = useState(Date.now);
  const [totpAccounts, setTotpAccounts] = useState<OnlineTotpAccount[]>([]);
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpFailed, setTotpFailed] = useState(false);
  const [totpLoaded, setTotpLoaded] = useState(false);
  const mode = value.verificationMode ?? "email";
  const matchedMailbox = mailboxes.find((mailbox) => mailbox.id === value.mailboxId) ?? mailboxes.find((mailbox) => mailbox.address.trim().toLowerCase() === value.loginAccount.trim().toLowerCase());
  const matchedInboxLink = matchedMailbox ? inboxLinks.find((link) => link.mailboxId === matchedMailbox.id && !link.seatId && link.status === "active" && link.folderIds.length > 0 && (!link.expiresAt || Date.parse(link.expiresAt) > inboxNow)) : undefined;
  const inboxSetupRequired = Boolean(showEnabledControl && value.enabled && mode === "email");
  const inboxSetupPending = inboxSetupRequired && (inboxLoading || inboxFailed || !matchedMailbox);
  const normalizedLoginAccount = value.loginAccount.trim().toLowerCase();
  const totpMatches = useMemo(
    () => totpAccounts.filter((account) => account.enabled && account.account.trim().toLowerCase() === normalizedLoginAccount),
    [normalizedLoginAccount, totpAccounts],
  );
  const update = <K extends keyof FamilySharingFormState>(key: K, next: FamilySharingFormState[K]) => onChange({ ...value, [key]: next });
  const occupiedSeats = value.occupiedSeats ?? 0;
  const disableBlocked = showEnabledControl && value.enabled && occupiedSeats > 0;
  const setSharingEnabled = (enabled: boolean) => {
    update("enabled", enabled);
  };
  const setVerificationMode = (verificationMode: "email" | "totp") => {
    onChange({
      ...value,
      enabled: true,
      verificationMode,
      verificationLink: verificationMode === "totp" ? "" : value.verificationLink,
      totpAccountId: verificationMode === "email" ? "" : value.totpAccountId ?? "",
    });
  };

  useEffect(() => {
    onShareSetupPendingChange?.(inboxSetupPending);
  }, [inboxSetupPending, onShareSetupPendingChange]);
  useEffect(() => {
    if (!value.enabled || mode !== "email") return;
    let cancelled = false;
    setInboxLoading(true);
    setInboxFailed(false);
    void Promise.all([newszxcnService.mailboxes(), newszxcnService.links()]).then(([mailboxResult, linkResult]) => {
      if (!cancelled) {
        setMailboxes(mailboxResult.items);
        setInboxLinks(linkResult.links);
        setInboxNow(Date.now());
      }
    }).catch(() => {
      if (!cancelled) {
        setMailboxes([]);
        setInboxLinks([]);
        setInboxFailed(true);
      }
    }).finally(() => { if (!cancelled) setInboxLoading(false); });
    return () => { cancelled = true; };
  }, [value.enabled, mode]);
  useEffect(() => {
    if (!showEnabledControl || !value.enabled || mode !== "email" || !matchedMailbox) return;
    const nextLink = matchedInboxLink?.shortUrl ?? "";
    if (value.mailboxId === matchedMailbox.id && value.loginAccount === matchedMailbox.address && value.verificationLink === nextLink) return;
    onChange({ ...value, mailboxId: matchedMailbox.id, loginAccount: matchedMailbox.address, verificationLink: nextLink });
  }, [matchedInboxLink, matchedMailbox, mode, onChange, showEnabledControl, value]);
  useEffect(() => {
    if (!value.enabled || mode !== "totp") return;
    const controller = new AbortController();
    setTotpLoading(true);
    setTotpLoaded(false);
    setTotpFailed(false);
    void onlineTotpService.list(controller.signal).then((result) => { if (!controller.signal.aborted) { setTotpAccounts(result.accounts); setTotpLoaded(true); } })
      .catch(() => { if (!controller.signal.aborted) setTotpFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setTotpLoading(false); });
    return () => controller.abort();
  }, [value.enabled, mode]);
  useEffect(() => {
    if (!value.enabled || mode !== "totp" || !totpLoaded) return;
    const matchId = totpMatches.length === 1 ? totpMatches[0]!.id : totpMatches.some((account) => account.id === value.totpAccountId) ? value.totpAccountId : "";
    if (value.totpAccountId !== matchId) onChange({ ...value, totpAccountId: matchId ?? "" });
  }, [value, mode, totpMatches, onChange, totpLoaded]);

  const readSavedPassword = async () => {
    if (!subscriptionId || !value.hasPassword || value.password) return value.password;
    setPasswordLoading(true);
    try {
      const password = await subscriptionService.familyPassword(subscriptionId);
      update("password", password);
      return password;
    } catch {
      toast.error(t("subscription.familySharing.passwordUnavailable"));
      return "";
    } finally { setPasswordLoading(false); }
  };
  const togglePassword = async () => {
    if (!passwordVisible && value.hasPassword && !value.password && !await readSavedPassword()) return;
    setPasswordVisible((current) => !current);
  };
  const copyPassword = async () => {
    const password = await readSavedPassword();
    if (!password) return;
    const result = await copyTextToClipboard(password);
    toast[result.ok ? "success" : "error"](t(result.ok ? "subscription.familySharing.passwordCopied" : "subscription.familySharing.passwordCopyFailed"));
  };

  return <section className="grid gap-4">
    {showEnabledControl ? <div className="flex items-center justify-between gap-4">
      <div className="min-w-0"><Label htmlFor={id("familySharingEnabled")} className={`flex items-center gap-2 text-sm font-medium ${disableBlocked ? "cursor-not-allowed" : "cursor-pointer"}`}><UsersRound className="h-4 w-4" />{t("subscription.familySharing.title")}</Label><p id={id("familySharingHelp")} className={`mt-1 text-xs leading-5 ${disableBlocked ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>{t(disableBlocked ? "subscription.familySharing.disableBlocked" : "subscription.familySharing.help", disableBlocked ? { count: occupiedSeats } : undefined)}</p></div>
      <Switch id={id("familySharingEnabled")} checked={value.enabled} disabled={disableBlocked} onCheckedChange={setSharingEnabled} aria-label={t("subscription.familySharing.title")} aria-describedby={id("familySharingHelp")} />
    </div> : null}
    {value.enabled ? <div className={showEnabledControl ? "grid gap-4 border-t border-border pt-3" : "grid gap-4"}>
      <fieldset className="grid gap-2"><legend className="text-sm font-medium">{t("sharing.verificationMethod")}</legend><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {([ ["email", "sharing.emailMethod", Mail], ["totp", "sharing.totpMethod", ShieldCheck] ] as const).map(([choice, label, Icon]) => {
          const selected = mode === choice;
          return <label key={choice} className={`relative flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${selected ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted/50"}`}><input className="absolute inset-0 cursor-pointer opacity-0" type="radio" name={id("verificationMode")} value={choice} checked={selected} onChange={() => setVerificationMode(choice)} /><Icon className="h-4 w-4" />{t(label)}</label>;
        })}
      </div></fieldset>
      {showEnabledControl && mode === "email" ? <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-[minmax(0,1fr)_8rem]">
        <FormField id={id("familySharingMailbox")} label={t("sharing.mailboxSelection")}>{(field) => <Select value={matchedMailbox?.id ?? ""} onValueChange={(mailboxId) => { const mailbox = mailboxes.find((item) => item.id === mailboxId); const link = inboxLinks.find((item) => item.mailboxId === mailboxId && !item.seatId && item.status === "active" && item.folderIds.length > 0 && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now())); onChange({ ...value, mailboxId, loginAccount: mailbox?.address ?? "", verificationLink: link?.shortUrl ?? "" }); }} disabled={inboxLoading}><SelectTrigger id={field.id} aria-describedby={field.describedBy}><SelectValue placeholder={inboxLoading ? t("sharing.loadingLinks") : t("sharing.selectMailboxPlaceholder")} /></SelectTrigger><SelectContent>{mailboxes.map((mailbox) => <SelectItem key={mailbox.id} value={mailbox.id}>{mailbox.displayName ? `${mailbox.displayName} · ` : ""}{mailbox.address}</SelectItem>)}</SelectContent></Select>}</FormField>
        <FormField id={id("familySharingCapacity")} label={t("subscription.familySharing.capacity")}>{(field) => <Input id={field.id} type="number" min={1} max={100} value={value.capacity} onChange={(event) => update("capacity", event.target.value)} required aria-describedby={field.describedBy} />}</FormField>
      </FormFieldRow> : <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-[minmax(0,1fr)_8rem]">
        <FormField id={id("familySharingLoginAccount")} label={t("subscription.familySharing.loginAccount")}>{(field) => <Input id={field.id} value={value.loginAccount} onChange={(event) => update("loginAccount", event.target.value)} autoComplete="username" required aria-describedby={field.describedBy} list={mailboxes.length ? id("newszxcn-mailboxes") : undefined} />}</FormField>
        <FormField id={id("familySharingCapacity")} label={t("subscription.familySharing.capacity")}>{(field) => <Input id={field.id} type="number" min={1} max={100} value={value.capacity} onChange={(event) => update("capacity", event.target.value)} required aria-describedby={field.describedBy} />}</FormField>
      </FormFieldRow>}
      {mailboxes.length ? <datalist id={id("newszxcn-mailboxes")}>{mailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.address} />)}</datalist> : null}
      <FormField id={id("familySharingPassword")} label={t("subscription.familySharing.password")}>{(field) => <div className="relative">
        <Input id={field.id} type={passwordVisible ? "text" : "password"} value={value.password} onChange={(event) => update("password", event.target.value)} placeholder={value.hasPassword ? value.passwordMask : t("subscription.familySharing.passwordPlaceholder")} autoComplete="new-password" required={!value.hasPassword} aria-describedby={field.describedBy} className="pr-32" />
        <Button type="button" variant="ghost" size="icon" className="absolute right-22 top-0 h-full w-11" aria-label={t("subscription.familySharing.generatePassword")} title={t("subscription.familySharing.generatePassword")} onClick={() => { update("password", generateFamilySharingPassword()); setPasswordVisible(true); toast.success(t("subscription.familySharing.passwordGenerated")); }}><RefreshCw className="h-4 w-4" /></Button>
        {value.hasPassword || value.password ? <Button type="button" variant="ghost" size="icon" className="absolute right-11 top-0 h-full w-11" disabled={passwordLoading} onClick={() => void copyPassword()} aria-label={t("subscription.familySharing.copyPassword")}><Copy className="h-4 w-4" /></Button> : null}
        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-11" disabled={passwordLoading} onClick={() => void togglePassword()} aria-label={t(passwordVisible ? "subscription.familySharing.hidePassword" : "subscription.familySharing.showPassword")}>{passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
      </div>}</FormField>
      {mode === "totp" ? <div className="grid gap-2 text-xs" role="status">
        {totpLoading ? <span className="text-muted-foreground">{t("sharing.totpMatching")}</span> : totpFailed ? <span className="text-destructive">{t("sharing.totpLoadError")}</span> : totpMatches.length === 0 ? <span className="text-destructive">{t("sharing.totpMissing")}</span> : totpMatches.length === 1 ? <span className="text-primary">{t("sharing.totpMatched")}{totpMatches[0]!.platformName} #{totpMatches[0]!.accountNumber}</span> : <label className="grid gap-1">{t("sharing.totpSelect")}<select aria-label={t("sharing.totpRecord")} className="h-9 rounded-md border border-border bg-background px-2" value={value.totpAccountId ?? ""} onChange={(event) => update("totpAccountId", event.target.value)}><option value="">{t("sharing.totpSelectPlaceholder")}</option>{totpMatches.map((account) => <option key={account.id} value={account.id}>{account.platformName} #{account.accountNumber} · {account.serviceName}</option>)}</select></label>}
      </div> : null}
      {showEnabledControl && mode === "email" ? <div className="rounded-md border border-border bg-muted/25 p-3" role="status">
        <p className={matchedInboxLink ? "text-xs text-primary" : inboxFailed || (!inboxLoading && !matchedMailbox) ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {inboxLoading ? t("sharing.loadingLinks") : inboxFailed ? t("sharing.loadLinksFailed") : !matchedMailbox ? t("sharing.selectMailboxPlaceholder") : matchedInboxLink ? t("sharing.mailboxLinkReady") : t("sharing.mailboxLinkWillCreate")}
        </p>
      </div> : null}
      {!showEnabledControl && mode === "email" ? <FormField id={id("familySharingVerificationLink")} label="验证码链接">{(field) => <div className="relative">
        <Input id={field.id} type="url" value={value.verificationLink} onChange={(event) => update("verificationLink", event.target.value)} placeholder={t("subscription.familySharing.verificationLinkPlaceholder")} aria-describedby={field.describedBy} className="pr-22" />
        {value.verificationLink ? <div className="absolute right-0 top-0 flex h-full items-center"><Button type="button" variant="ghost" size="icon" className="h-full w-11" aria-label={t("sharing.copyLink")} onClick={async () => { const result = await copyTextToClipboard(value.verificationLink); toast[result.ok ? "success" : "error"](t(result.ok ? "sharing.copySuccess" : "sharing.copyFailed")); }}><Copy className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-full w-11" onClick={() => update("verificationLink", "")} aria-label={t("sharing.clearInboxLink")}><X className="h-4 w-4" /></Button></div> : null}
      </div>}</FormField> : null}
      <FieldError id={id("familySharing-error")} message={error} />
    </div> : null}
  </section>;
}
