import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, Loader2, RefreshCw, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { FormField, FormFieldRow } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/I18nProvider";
import type { FamilySharingFormState } from "@/types/subscription-form";
import { subscriptionService } from "@/services/subscription-service";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import { toast } from "@/components/ui/sonner";
import { generateFamilySharingPassword } from "@/lib/family-sharing-password";
import { newszxcnService, type NewSzxcnMailbox } from "@/services/newszxcn-service";

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
  const update = <K extends keyof FamilySharingFormState>(key: K, next: FamilySharingFormState[K]) => onChange({ ...value, [key]: next });

  useEffect(() => {
    onShareSetupPendingChange?.(false);
  }, [onShareSetupPendingChange]);
  useEffect(() => {
    if (!value.enabled) return;
    let cancelled = false;
    void newszxcnService.mailboxes().then((result) => {
      if (!cancelled) setMailboxes(result.items);
    }).catch(() => { if (!cancelled) setMailboxes([]); });
    return () => { cancelled = true; };
  }, [value.enabled]);

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
      <div className="min-w-0"><Label htmlFor={id("familySharingEnabled")} className="flex cursor-pointer items-center gap-2 text-sm font-medium"><UsersRound className="h-4 w-4" />{t("subscription.familySharing.title")}</Label><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("subscription.familySharing.help")}</p></div>
      <Switch id={id("familySharingEnabled")} checked={value.enabled} onCheckedChange={(enabled) => update("enabled", enabled)} />
    </div> : null}
    {value.enabled ? <div className={showEnabledControl ? "grid gap-4 border-t border-border pt-3" : "grid gap-4"}>
      <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-[minmax(0,1fr)_8rem]">
        <FormField id={id("familySharingLoginAccount")} label={t("subscription.familySharing.loginAccount")}>{(field) => <Input id={field.id} value={value.loginAccount} onChange={(event) => update("loginAccount", event.target.value)} autoComplete="username" required aria-describedby={field.describedBy} list={mailboxes.length ? id("newszxcn-mailboxes") : undefined} />}</FormField>
        <FormField id={id("familySharingCapacity")} label={t("subscription.familySharing.capacity")}>{(field) => <Input id={field.id} type="number" min={1} max={100} value={value.capacity} onChange={(event) => update("capacity", event.target.value)} required aria-describedby={field.describedBy} />}</FormField>
      </FormFieldRow>
      {mailboxes.length ? <datalist id={id("newszxcn-mailboxes")}>{mailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.address} />)}</datalist> : null}
      <FormField id={id("familySharingPassword")} label={t("subscription.familySharing.password")}>{(field) => <div className="relative">
        <Input id={field.id} type={passwordVisible ? "text" : "password"} value={value.password} onChange={(event) => update("password", event.target.value)} placeholder={value.hasPassword ? value.passwordMask : t("subscription.familySharing.passwordPlaceholder")} autoComplete="new-password" required={!value.hasPassword} aria-describedby={field.describedBy} className="pr-32" />
        <Button type="button" variant="ghost" size="icon" className="absolute right-22 top-0 h-full w-11" aria-label={t("subscription.familySharing.generatePassword")} title={t("subscription.familySharing.generatePassword")} onClick={() => { update("password", generateFamilySharingPassword()); setPasswordVisible(true); toast.success(t("subscription.familySharing.passwordGenerated")); }}><RefreshCw className="h-4 w-4" /></Button>
        {value.hasPassword || value.password ? <Button type="button" variant="ghost" size="icon" className="absolute right-11 top-0 h-full w-11" disabled={passwordLoading} onClick={() => void copyPassword()} aria-label={t("subscription.familySharing.copyPassword")}><Copy className="h-4 w-4" /></Button> : null}
        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-11" disabled={passwordLoading} onClick={() => void togglePassword()} aria-label={t(passwordVisible ? "subscription.familySharing.hidePassword" : "subscription.familySharing.showPassword")}>{passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
      </div>}</FormField>
      {!showEnabledControl ? <FormField id={id("familySharingVerificationLink")} label="验证码链接">{(field) => <div className="relative">
        <Input id={field.id} type="url" value={value.verificationLink} onChange={(event) => update("verificationLink", event.target.value)} placeholder={t("subscription.familySharing.verificationLinkPlaceholder")} aria-describedby={field.describedBy} className="pr-22" />
        {value.verificationLink ? <div className="absolute right-0 top-0 flex h-full items-center"><Button type="button" variant="ghost" size="icon" className="h-full w-11" aria-label={t("sharing.copyLink")} onClick={async () => { const result = await copyTextToClipboard(value.verificationLink); toast[result.ok ? "success" : "error"](t(result.ok ? "sharing.copySuccess" : "sharing.copyFailed")); }}><Copy className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-full w-11" onClick={() => update("verificationLink", "")} aria-label={t("sharing.clearInboxLink")}><X className="h-4 w-4" /></Button></div> : null}
      </div>}</FormField> : null}
      <FieldError id={id("familySharing-error")} message={error} />
    </div> : null}
  </section>;
}
