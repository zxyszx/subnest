import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, Loader2, RefreshCw, Settings2, UsersRound } from "lucide-react";

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
import Link from "@/components/router-link";

const managedCopy = { title: "NewSzxcn 受管邮箱", shared: "已分享 · 最近 30 分钟", closed: "未开启分享", manage: "管理", toggle: "开启共享收件箱" };
type NewSzxcnMailbox = { id: string; address: string };
type SharedInboxLink = { id: string; shortUrl: string; mailboxId: string; status: "active" | "revoked" };
async function managedInboxRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  const payload = await response.json() as { data?: T; error?: { message?: string }; message?: string };
  if (!response.ok || !payload.data) throw new Error(payload.error?.message || payload.message || "共享收件箱请求失败");
  return payload.data;
}

export function SubscriptionFamilySharingFields({
  id,
  subscriptionId,
  value,
  onChange,
  error,
}: {
  id: (name: string) => string;
  subscriptionId?: string | undefined;
  value: FamilySharingFormState;
  onChange: (value: FamilySharingFormState) => void;
  error?: string | undefined;
}) {
  const { t } = useI18n();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [mailboxes, setMailboxes] = useState<NewSzxcnMailbox[]>([]);
  const [managedLinks, setManagedLinks] = useState<SharedInboxLink[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const update = <K extends keyof FamilySharingFormState>(key: K, next: FamilySharingFormState[K]) => {
    onChange({ ...value, [key]: next });
  };
  useEffect(() => {
    if (!value.enabled) return;
    void Promise.all([
      managedInboxRequest<{ items: NewSzxcnMailbox[] }>("/api/app/admin/newszxcn/mailboxes"),
      managedInboxRequest<{ links: SharedInboxLink[] }>("/api/app/admin/shared-inbox-links"),
    ]).then(([mailboxResult, linkResult]) => { setMailboxes(mailboxResult.items); setManagedLinks(linkResult.links); })
      .catch(() => { setMailboxes([]); setManagedLinks([]); });
  }, [value.enabled]);
  const managedMailbox = useMemo(() => mailboxes.find((mailbox) => mailbox.address.toLowerCase() === value.loginAccount.trim().toLowerCase()) ?? null, [mailboxes, value.loginAccount]);
  const managedLink = useMemo(() => managedMailbox ? managedLinks.find((link) => link.mailboxId === managedMailbox.id && link.status === "active") ?? null : null, [managedLinks, managedMailbox]);
  useEffect(() => {
    if (managedLink && value.verificationLink !== managedLink.shortUrl) onChange({ ...value, verificationLink: managedLink.shortUrl });
  }, [managedLink, onChange, value]);

  const toggleManagedShare = async (enabled: boolean) => {
    if (!managedMailbox) return;
    setShareLoading(true);
    try {
      if (enabled) {
        const folders = await managedInboxRequest<{ items: Array<{ id: string; role?: string }> }>(`/api/app/admin/newszxcn/mailboxes/${encodeURIComponent(managedMailbox.id)}/folders`);
        const inbox = folders.items.find((folder) => folder.role === "inbox") ?? folders.items[0];
        if (!inbox) throw new Error("该邮箱没有可分享的文件夹");
        const result = await managedInboxRequest<{ link: SharedInboxLink }>("/api/app/admin/shared-inbox-links", { method: "POST", body: JSON.stringify({ mailboxId: managedMailbox.id, folderIds: [inbox.id], windowMinutes: 30 }) });
        setManagedLinks((current) => [result.link, ...current]);
        update("verificationLink", result.link.shortUrl);
        toast.success("共享收件箱已开启");
      } else if (managedLink) {
        await managedInboxRequest<Record<string, never>>(`/api/app/admin/shared-inbox-links/${encodeURIComponent(managedLink.id)}`, { method: "DELETE" });
        setManagedLinks((current) => current.map((link) => link.id === managedLink.id ? { ...link, status: "revoked" } : link));
        update("verificationLink", "");
        toast.success("共享收件箱已关闭");
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "共享收件箱操作失败"); }
    finally { setShareLoading(false); }
  };
  const readSavedPassword = async () => {
    if (!subscriptionId || !value.hasPassword) return value.password;
    if (value.password) return value.password;
    setPasswordLoading(true);
    try {
      const password = await subscriptionService.familyPassword(subscriptionId);
      update("password", password);
      return password;
    } catch {
      toast.error(t("subscription.familySharing.passwordUnavailable"));
      return "";
    } finally {
      setPasswordLoading(false);
    }
  };

  const togglePassword = async () => {
    if (!passwordVisible && value.hasPassword && !value.password) {
      const password = await readSavedPassword();
      if (!password) return;
    }
    setPasswordVisible((current) => !current);
  };

  const copyPassword = async () => {
    const password = await readSavedPassword();
    if (!password) return;
    const result = await copyTextToClipboard(password);
    toast[result.ok ? "success" : "error"](t(result.ok ? "subscription.familySharing.passwordCopied" : "subscription.familySharing.passwordCopyFailed"));
  };

  const generatePassword = () => {
    update("password", generateFamilySharingPassword());
    setPasswordVisible(true);
    toast.success(t("subscription.familySharing.passwordGenerated"));
  };

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor={id("familySharingEnabled")} className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <UsersRound className="h-4 w-4" />
            {t("subscription.familySharing.title")}
          </Label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("subscription.familySharing.help")}</p>
        </div>
        <Switch
          id={id("familySharingEnabled")}
          checked={value.enabled}
          onCheckedChange={(enabled) => update("enabled", enabled)}
        />
      </div>

      {value.enabled ? (
        <div className="grid gap-4 border-t border-border pt-4">
          <FormField id={id("familySharingLoginAccount")} label={t("subscription.familySharing.loginAccount")}>
            {(field) => (
              <Input
                id={field.id}
                value={value.loginAccount}
                onChange={(event) => update("loginAccount", event.target.value)}
                autoComplete="username"
                required
                aria-describedby={field.describedBy}
                className="border-border bg-secondary"
                list={mailboxes.length ? id("newszxcn-mailboxes") : undefined}
              />
            )}
          </FormField>
          {mailboxes.length ? <datalist id={id("newszxcn-mailboxes")}>{mailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.address} />)}</datalist> : null}
          {managedMailbox ? <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"><div className="min-w-0"><p className="text-sm font-medium">{managedCopy.title}</p><p className={managedLink ? "text-xs text-emerald-600" : "text-xs text-muted-foreground"}>{managedLink ? managedCopy.shared : managedCopy.closed}</p></div><div className="flex items-center gap-2"><Link href="/shared-inboxes" className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"><Settings2 className="h-4 w-4" />{managedCopy.manage}</Link><Switch checked={Boolean(managedLink)} disabled={shareLoading} onCheckedChange={(checked) => void toggleManagedShare(checked)} aria-label={managedCopy.toggle} /></div></div> : null}
          <FormField
            id={id("familySharingPassword")}
            label={t("subscription.familySharing.password")}
          >
            {(field) => (
              <div className="relative">
                <Input
                  id={field.id}
                  type={passwordVisible ? "text" : "password"}
                  value={value.password}
                  onChange={(event) => update("password", event.target.value)}
                  placeholder={value.hasPassword ? value.passwordMask : t("subscription.familySharing.passwordPlaceholder")}
                  autoComplete="new-password"
                  required={!value.hasPassword}
                  aria-describedby={field.describedBy}
                  className="border-border bg-secondary pr-32"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-22 top-0 h-full w-11"
                  onClick={generatePassword}
                  aria-label={t("subscription.familySharing.generatePassword")}
                  title={t("subscription.familySharing.generatePassword")}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                {value.hasPassword || value.password ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-11 top-0 h-full w-11"
                    onClick={() => void copyPassword()}
                    disabled={passwordLoading}
                    aria-label={t("subscription.familySharing.copyPassword")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full w-11"
                  onClick={() => void togglePassword()}
                  disabled={passwordLoading}
                  aria-label={t(passwordVisible ? "subscription.familySharing.hidePassword" : "subscription.familySharing.showPassword")}
                >
                  {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </FormField>
          <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-[minmax(0,1fr)_8rem]">
            <FormField id={id("familySharingVerificationLink")} label={t("subscription.familySharing.verificationLink")}>
              {(field) => (
                <Input
                  id={field.id}
                  type="url"
                  value={value.verificationLink}
                  onChange={(event) => update("verificationLink", event.target.value)}
                  placeholder={t("subscription.familySharing.verificationLinkPlaceholder")}
                  aria-describedby={field.describedBy}
                  className="border-border bg-secondary"
                  readOnly={Boolean(managedMailbox)}
                />
              )}
            </FormField>
            <FormField id={id("familySharingCapacity")} label={t("subscription.familySharing.capacity")}>
              {(field) => (
                <Input
                  id={field.id}
                  type="number"
                  min={1}
                  max={100}
                  value={value.capacity}
                  onChange={(event) => update("capacity", event.target.value)}
                  required
                  aria-describedby={field.describedBy}
                  className="border-border bg-secondary"
                />
              )}
            </FormField>
          </FormFieldRow>
          <FieldError id={id("familySharing-error")} message={error} />
        </div>
      ) : null}
    </section>
  );
}
