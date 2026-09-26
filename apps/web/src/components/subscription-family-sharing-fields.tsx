import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, FolderOpen, Loader2, RefreshCw, UsersRound, X } from "lucide-react";

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
import { newszxcnService, type NewSzxcnFolder, type NewSzxcnMailbox, type SharedInboxLink } from "@/services/newszxcn-service";

const managedCopy = {
  title: "NewSzxcn 共享收件箱",
  shared: "已开启只读分享",
  closed: "尚未开启分享",
  toggle: "开启共享收件箱",
  link: "收件链接",
  clear: "清空收件链接",
  chooseFolders: "选择文件夹",
  viewFolders: "查看文件夹",
  folders: "可查看文件夹",
  noFolders: "该邮箱没有可分享的文件夹",
  selectRequired: "请至少选择一个文件夹，再开启分享。",
  activeHelp: "需要更改范围时，请先关闭分享，再重新选择文件夹。",
  openShare: "开启分享",
};

const systemFolderNames: Record<string, string> = {
  inbox: "收件箱",
  sent: "已发送",
  spam: "垃圾邮件",
  trash: "回收站",
  archive: "归档",
  drafts: "草稿箱",
};

function folderLabel(folder: NewSzxcnFolder) {
  const role = folder.role?.trim().toLowerCase();
  const name = folder.name.trim().toLowerCase();
  return (role && systemFolderNames[role]) || systemFolderNames[name] || folder.name;
}

export function SubscriptionFamilySharingFields({
  id,
  subscriptionId,
  value,
  onChange,
  error,
  onShareSetupPendingChange,
}: {
  id: (name: string) => string;
  subscriptionId?: string | undefined;
  value: FamilySharingFormState;
  onChange: (value: FamilySharingFormState) => void;
  error?: string | undefined;
  onShareSetupPendingChange?: ((pending: boolean) => void) | undefined;
}) {
  const { t } = useI18n();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [mailboxes, setMailboxes] = useState<NewSzxcnMailbox[]>([]);
  const [managedLinks, setManagedLinks] = useState<SharedInboxLink[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareIntent, setShareIntent] = useState<boolean | null>(null);
  const [mailboxesLoading, setMailboxesLoading] = useState(false);
  const [folders, setFolders] = useState<NewSzxcnFolder[]>([]);
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const update = <K extends keyof FamilySharingFormState>(key: K, next: FamilySharingFormState[K]) => {
    onChange({ ...value, [key]: next });
  };
  useEffect(() => {
    if (!value.enabled) {
      setMailboxes([]);
      setManagedLinks([]);
      setMailboxesLoading(false);
      return;
    }
    let cancelled = false;
    setMailboxesLoading(true);
    void Promise.all([
      newszxcnService.mailboxes(),
      newszxcnService.links(),
    ]).then(([mailboxResult, linkResult]) => {
      if (cancelled) return;
      setMailboxes(mailboxResult.items);
      setManagedLinks(linkResult.links);
    }).catch(() => {
      if (cancelled) return;
      setMailboxes([]);
      setManagedLinks([]);
    }).finally(() => {
      if (!cancelled) setMailboxesLoading(false);
    });
    return () => { cancelled = true; };
  }, [value.enabled]);
  const managedMailbox = useMemo(() => mailboxes.find((mailbox) => mailbox.address.toLowerCase() === value.loginAccount.trim().toLowerCase()) ?? null, [mailboxes, value.loginAccount]);
  const managedLink = useMemo(() => managedMailbox ? managedLinks.find((link) => link.mailboxId === managedMailbox.id && link.status === "active") ?? null : null, [managedLinks, managedMailbox]);
  useEffect(() => {
    setShareIntent(null);
    setFolderPickerOpen(false);
    setFolders([]);
    setFolderIds([]);
    if (!managedMailbox) return;
    let cancelled = false;
    setFoldersLoading(true);
    void newszxcnService.folders(managedMailbox.id).then((result) => {
      if (!cancelled) setFolders(result.items);
    }).catch((error) => {
      if (!cancelled) toast.error(error instanceof Error ? error.message : "读取文件夹失败");
    }).finally(() => {
      if (!cancelled) setFoldersLoading(false);
    });
    return () => { cancelled = true; };
  }, [managedMailbox]);
  useEffect(() => {
    if (managedLink) setFolderIds(managedLink.folderIds);
  }, [managedLink]);
  useEffect(() => {
    onShareSetupPendingChange?.(Boolean(managedMailbox && shareIntent && !managedLink));
    return () => onShareSetupPendingChange?.(false);
  }, [managedLink, managedMailbox, onShareSetupPendingChange, shareIntent]);
  useEffect(() => {
    if (managedLink && value.verificationLink !== managedLink.shortUrl) {
      onChange({ ...value, verificationLink: managedLink.shortUrl });
      return;
    }
    const legacySharedLink = /^https?:\/\/mail\.newszxcn\.com\/shared-inbox(?:#|\/|$)/i.test(value.verificationLink.trim());
    if (managedMailbox && !managedLink && legacySharedLink) onChange({ ...value, verificationLink: "" });
  }, [managedLink, managedMailbox, onChange, value]);

  const toggleManagedShare = async (enabled: boolean) => {
    if (!managedMailbox) return;
    if (enabled && !managedLink) {
      setShareIntent(true);
      setFolderPickerOpen(true);
      return;
    }
    if (!enabled && !managedLink) {
      setShareIntent(null);
      setFolderIds([]);
      setFolderPickerOpen(false);
      return;
    }
    setShareLoading(true);
    setShareIntent(enabled);
    try {
      if (managedLink) {
        await newszxcnService.revoke(managedLink.id);
        setManagedLinks((current) => current.map((link) => link.id === managedLink.id ? { ...link, status: "revoked" } : link));
        update("verificationLink", "");
        setFolderIds([]);
        setFolderPickerOpen(false);
        toast.success("共享收件箱已关闭");
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "共享收件箱操作失败"); }
    finally { setShareLoading(false); setShareIntent(null); }
  };
  const createManagedShare = async () => {
    if (!managedMailbox) return;
    if (folderIds.length === 0) {
      toast.error(managedCopy.selectRequired);
      return;
    }
    setShareLoading(true);
    try {
      const result = await newszxcnService.create({ mailboxId: managedMailbox.id, folderIds, windowMinutes: 30 });
      setManagedLinks((current) => [result.link, ...current]);
      update("verificationLink", result.link.shortUrl);
      setFolderPickerOpen(false);
      setShareIntent(null);
      toast.success("共享收件箱已开启");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "共享收件箱操作失败");
    } finally {
      setShareLoading(false);
    }
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
          {value.loginAccount.trim() && mailboxesLoading && !managedMailbox ? <p className="text-xs text-muted-foreground">{t("subscription.familySharing.matchingManagedMailbox")}</p> : null}
          {managedMailbox ? (
            <div className="grid gap-3 rounded-md border border-border bg-background p-3" aria-busy={shareLoading}>
              <div className="flex min-h-11 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{managedCopy.title}</p>
                  <p className={managedLink ? "text-xs text-emerald-600" : "text-xs text-muted-foreground"}>{managedLink ? managedCopy.shared : managedCopy.closed}</p>
                </div>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    onClick={() => setFolderPickerOpen((current) => !current)}
                    disabled={foldersLoading}
                    aria-expanded={folderPickerOpen}
                  >
                    {foldersLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                    {managedLink ? managedCopy.viewFolders : managedCopy.chooseFolders}
                  </Button>
                  {shareLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={t("subscription.familySharing.updatingManagedShare")} /> : null}
                  <Switch checked={shareIntent ?? Boolean(managedLink)} disabled={shareLoading} onCheckedChange={(checked) => void toggleManagedShare(checked)} aria-label={managedCopy.toggle} />
                </div>
              </div>
              {folderPickerOpen ? (
                <div className="grid gap-2 border-t border-border pt-3">
                  <Label>{managedCopy.folders}</Label>
                  {folders.length === 0 && !foldersLoading ? (
                    <p className="text-sm text-muted-foreground">{managedCopy.noFolders}</p>
                  ) : (
                    <div className="max-h-44 divide-y divide-border overflow-y-auto rounded-md border border-border">
                      {folders.map((folder) => (
                        <label key={folder.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={folderIds.includes(folder.id)}
                            disabled={Boolean(managedLink) || shareLoading}
                            onChange={(event) => setFolderIds((current) => event.target.checked ? [...current, folder.id] : current.filter((id) => id !== folder.id))}
                          />
                          <span className="min-w-0 flex-1 truncate">{folderLabel(folder)}</span>
                          <span className="text-xs text-muted-foreground">{folder.totalCount ?? 0} 封</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {managedLink ? (
                    <p className="text-xs leading-5 text-muted-foreground">{managedCopy.activeHelp}</p>
                  ) : (
                    <>
                      {folderIds.length === 0 && shareIntent ? <p role="alert" className="text-xs text-destructive">{managedCopy.selectRequired}</p> : null}
                      <Button type="button" size="sm" className="justify-self-end" disabled={shareLoading || folderIds.length === 0} onClick={() => void createManagedShare()}>
                        {shareLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {managedCopy.openShare}
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
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
            <FormField id={id("familySharingVerificationLink")} label={managedMailbox ? managedCopy.link : t("subscription.familySharing.verificationLink")}>
              {(field) => (
                <div className="relative">
                  <Input
                    id={field.id}
                    type="url"
                    value={value.verificationLink}
                    onChange={(event) => update("verificationLink", event.target.value)}
                    placeholder={managedMailbox ? managedCopy.closed : t("subscription.familySharing.verificationLinkPlaceholder")}
                    aria-describedby={field.describedBy}
                    className="border-border bg-secondary pr-11"
                    readOnly={Boolean(managedMailbox)}
                  />
                  {!managedMailbox && value.verificationLink ? <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-11" onClick={() => update("verificationLink", "")} aria-label={managedCopy.clear}><X className="h-4 w-4" /></Button> : null}
                </div>
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
