import { useEffect, useState } from "react";
import { Copy, ExternalLink, Link2, Loader2, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import type { SharingAccount, SharingSeat } from "@renewlet/shared/schemas/sharing";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormField } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { newszxcnService, type NewSzxcnFolder, type NewSzxcnMailbox, type SharedInboxLink } from "@/services/newszxcn-service";
import { sharingService } from "@/services/sharing-service";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import { useI18n } from "@/i18n/I18nProvider";
import { PublicShareCard, ResponsiveSeatList, ShareLinkManager, ShareSettingsCollapse, type SeatLinkItem } from "@/components/share-link-manager";
import { sharingSeatLinkEligible } from "@/lib/sharing-seat-state";
import { dateToDateOnly } from "@/lib/time/date-only";

function resolveSeatScope(links: SharedInboxLink[], seats: SharingSeat[], mailboxId: string, now: number) {
  const seatIds = new Set(seats.map((seat) => seat.id));
  const scopes = new Map<string, { count: number; folderIds: string[]; windowMinutes: number }>();
  for (const link of links) {
    if (!link.seatId || !seatIds.has(link.seatId) || link.mailboxId !== mailboxId || link.status !== "active" || (link.expiresAt && Date.parse(link.expiresAt) <= now)) continue;
    const folderIds = [...link.folderIds].sort();
    const key = `${link.windowMinutes}\0${folderIds.join("\0")}`;
    const current = scopes.get(key);
    scopes.set(key, { count: (current?.count ?? 0) + 1, folderIds, windowMinutes: link.windowMinutes });
  }
  return [...scopes.values()].sort((a, b) => b.count - a.count)[0] ?? null;
}

export function SeatInboxLinksDialog({ mailbox, links: initialLinks, onClose, onChanged, boundAccount }: {
  mailbox: NewSzxcnMailbox;
  links: SharedInboxLink[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  boundAccount?: SharingAccount;
}) {
  const { t } = useI18n();
  const [loadedAt] = useState(Date.now);
  const today = dateToDateOnly(new Date(loadedAt));
  const initialGenericLink = initialLinks.find((link) => !link.seatId && link.mailboxId === mailbox.id && link.status === "active" && (!link.expiresAt || Date.parse(link.expiresAt) > loadedAt));
  const [accounts, setAccounts] = useState<SharingAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [seats, setSeats] = useState<SharingSeat[]>([]);
  const [folders, setFolders] = useState<NewSzxcnFolder[]>([]);
  const [folderIds, setFolderIds] = useState<string[]>(() => initialGenericLink?.folderIds ?? []);
  const [windowMinutes, setWindowMinutes] = useState(() => initialGenericLink?.windowMinutes ?? 30);
  const [links, setLinks] = useState(initialLinks);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [confirmation, setConfirmation] = useState<{ seat: SharingSeat; link: SharedInboxLink; action: "reset" | "revoke" } | null>(null);
  const [disableConfirmation, setDisableConfirmation] = useState(false);
  const [genericDisableConfirmation, setGenericDisableConfirmation] = useState(false);
  useEffect(() => {
    setLinks(initialLinks);
    const generic = initialLinks.find((link) => !link.seatId && link.mailboxId === mailbox.id && link.status === "active" && (!link.expiresAt || Date.parse(link.expiresAt) > loadedAt));
    const scope = resolveSeatScope(initialLinks, seats, mailbox.id, loadedAt) ?? generic;
    if (scope) {
      setFolderIds(scope.folderIds);
      setWindowMinutes(scope.windowMinutes);
    }
  }, [initialLinks, mailbox.id, loadedAt, seats]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([boundAccount ? Promise.resolve({ accounts: [boundAccount] }) : sharingService.list(), newszxcnService.folders(mailbox.id)]).then(([result, folderResult]) => {
      if (cancelled) return;
      const generic = initialLinks.find((link) => !link.seatId && link.mailboxId === mailbox.id && link.status === "active" && (!link.expiresAt || Date.parse(link.expiresAt) > loadedAt));
      const matches = result.accounts.filter((account) => account.status === "active" && (
        boundAccount?.id === account.id
        || (account.verificationMode !== "none" && account.verificationLink === generic?.shortUrl)
        || (account.verificationMode !== "totp" && account.verificationMode !== "none" && !account.verificationLink && account.loginAccount.trim().toLowerCase() === mailbox.address.trim().toLowerCase())
      ));
      setAccounts(matches); setAccountId(matches[0]?.id ?? ""); setFolders(folderResult.items);
    }).catch(() => { if (!cancelled) setError("无法读取车位或文件夹，请关闭后重试。"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mailbox, boundAccount, initialLinks, loadedAt]);
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    setLoading(true); setSeats([]); setError("");
    void sharingService.detail(accountId, controller.signal).then((detail) => {
      if (!controller.signal.aborted) setSeats(detail.seats);
    }).catch(() => { if (!controller.signal.aborted) setError("无法读取车位，请关闭后重试。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accountId]);

  const linkFor = (seatId: string) => links.find((link) => link.seatId === seatId && link.status === "active");
  const linkUsable = (link: SharedInboxLink) => !link.expiresAt || Date.parse(link.expiresAt) > loadedAt;
  const accountLinks = links.filter((link) => link.status === "active" && seats.some((seat) => seat.id === link.seatId));
  const sharingEnabled = accountLinks.some(linkUsable);
  const eligibleSeats = seats.filter((seat) => sharingSeatLinkEligible(seat, today));
  const enableCandidates = eligibleSeats.filter((seat) => !accountLinks.some((link) => link.seatId === seat.id && linkUsable(link)));
  const genericLink = links.find((link) => !link.seatId && link.mailboxId === mailbox.id && link.status === "active" && linkUsable(link));
  const selectedAccount = boundAccount ?? accounts.find((account) => account.id === accountId);
  const copySeatShare = async (seat: SharingSeat, shortUrl: string) => {
    if (!selectedAccount) return;
    try {
      const credentials = selectedAccount.hasPassword || selectedAccount.additionalCredential
        ? await sharingService.credentials(selectedAccount.id)
        : { password: "", additionalCredential: null };
      const password = credentials.password || t("sharing.passwordNotSet");
      const value = t("sharing.seatShareTemplate", {
        platform: selectedAccount.subscription.platformName,
        seat: t("sharing.inboxSeat", { number: seat.seatNumber }),
        member: seat.memberName || t("sharing.inboxVacant"),
        account: selectedAccount.loginAccount,
        password,
        additionalCredential: credentials.additionalCredential ? `\n${credentials.additionalCredential.name}：${credentials.additionalCredential.value}` : "",
        link: shortUrl,
        expiresAt: seat.expiresAt || "-",
      });
      const result = await copyTextToClipboard(value);
      toast[result.ok ? "success" : "error"](result.ok ? t("sharing.copySeatShareSuccess") : t("sharing.copyFailed"));
    } catch {
      toast.error(t("sharing.passwordUnavailable"));
    }
  };
  const toggleSharing = async (enabled: boolean) => {
    if (working) return;
    if (enabled && (folderIds.length === 0 || enableCandidates.length === 0)) {
      toast.error(t("sharing.enableLinksValidation"));
      return;
    }
    setWorking(true);
    try {
      if (enabled) {
        for (const seat of enableCandidates) {
          const existing = accountLinks.find((link) => link.seatId === seat.id);
          if (existing) {
            await newszxcnService.revoke(existing.id);
            setLinks((current) => current.map((item) => item.id === existing.id ? { ...item, status: "revoked" } : item));
          }
          const result = await newszxcnService.create({ mailboxId: mailbox.id, seatId: seat.id, folderIds, windowMinutes });
          setLinks((current) => [result.link, ...current]);
        }
      } else {
        for (const link of accountLinks) {
          await newszxcnService.revoke(link.id);
          setLinks((current) => current.map((item) => item.id === link.id ? { ...item, status: "revoked" } : item));
        }
      }
      toast.success(t(enabled ? "sharing.groupLinksEnabled" : "sharing.groupLinksDisabled"));
    } catch (cause) { toast.error(cause instanceof Error ? `${cause.message}; ${t("sharing.partialLinkFailure")}` : t("sharing.partialLinkFailure")); }
    finally {
      try { await onChanged(); } catch { toast.error(t("sharing.reloadLinksFailed")); }
      finally { setWorking(false); }
    }
  };
  const mutate = async (seat: SharingSeat, action: "create" | "reset" | "revoke", link?: SharedInboxLink) => {
    if (working) return;
    setWorking(true);
    try {
      if (link) {
        await newszxcnService.revoke(link.id);
        setLinks((current) => current.map((item) => item.id === link.id ? { ...item, status: "revoked" } : item));
      }
      if (action !== "revoke") {
        const result = await newszxcnService.create({ mailboxId: mailbox.id, seatId: seat.id, folderIds: link?.folderIds ?? folderIds, windowMinutes: link?.windowMinutes ?? windowMinutes });
        setLinks((current) => [result.link, ...current]);
      }
      toast.success(action === "revoke" ? "此车位链接已撤销" : action === "reset" ? "此车位链接已重置" : "此车位链接已生成");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "操作失败，请重试"); }
    finally {
      // Reload even if replacement creation failed after the old link was revoked.
      try { await onChanged(); }
      catch { toast.error("链接已变更，但列表刷新失败，请重新打开管理窗口。"); }
      finally { setWorking(false); }
    }
  };

  const revokeGenericLink = async () => {
    if (!genericLink || working) return;
    setWorking(true);
    try {
      await newszxcnService.revoke(genericLink.id);
      setLinks((current) => current.map((item) => item.id === genericLink.id ? { ...item, status: "revoked" } : item));
      toast.success("公共验证链接已关闭");
      await onChanged();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "关闭公共验证链接失败"); }
    finally { setWorking(false); }
  };

  const seatItems: SeatLinkItem[] = seats.map((seat) => {
    const link = linkFor(seat.id);
    const eligible = sharingSeatLinkEligible(seat, today);
    const usable = Boolean(link && linkUsable(link));
    const copyLink = async () => { if (!link) return; const result = await copyTextToClipboard(link.shortUrl); toast[result.ok ? "success" : "error"](t(result.ok ? "sharing.copySuccess" : "sharing.copyFailed")); };
    const actions = link ? <>{usable ? <><Button size="sm" variant="outline" className="min-h-11 max-md:flex-1" disabled={working || !eligible} onClick={() => void copySeatShare(seat, link.shortUrl)}><Copy className="h-4 w-4" />{t("sharing.copySeatShare")}</Button><Button size="icon" variant="outline" className="min-h-11 min-w-11 max-md:hidden" disabled={working || !eligible} aria-label={t("sharing.copyInboxLink")} title={t("sharing.copyInboxLink")} onClick={() => void copyLink()}><Copy className="h-4 w-4" /></Button><Button size="icon" variant="outline" className="min-h-11 min-w-11 max-md:hidden" asChild aria-label={t("sharing.previewShare")} title={t("sharing.previewShare")}><a href={link.shortUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button></> : null}<DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="outline" className="min-h-11 min-w-11" disabled={working} aria-label={t("sharing.moreLinkActions")}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" mobileTitle={t("sharing.moreLinkActions")}>{usable ? <><DropdownMenuItem className="md:hidden" onSelect={() => void copyLink()}><Copy className="h-4 w-4" />{t("sharing.copyInboxLink")}</DropdownMenuItem><DropdownMenuItem className="md:hidden" asChild><a href={link.shortUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{t("sharing.previewShare")}</a></DropdownMenuItem></> : null}<DropdownMenuItem disabled={!eligible} onSelect={() => setConfirmation({ seat, link, action: "reset" })}><RefreshCw className="h-4 w-4" />{t("sharing.resetInboxLink")}</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmation({ seat, link, action: "revoke" })}><Trash2 className="h-4 w-4" />{t("sharing.revokeInboxLink")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></> : <Button size="sm" className="min-h-11" disabled={working || !eligible || folderIds.length === 0} onClick={() => void mutate(seat, "create")}><Link2 className="h-4 w-4" />{t("sharing.createInboxLink")}</Button>;
    return { seat, href: usable && link ? link.shortUrl : "", valid: usable, statusText: usable ? t("sharing.totpValid") : t("sharing.totpUncreated"), fallbackText: t(link ? "sharing.linkUnavailable" : "sharing.linkNotCreated"), actions };
  });

  return <>
    {selectedAccount ? <ShareLinkManager account={selectedAccount} seats={seats} busy={working} onClose={onClose}>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {genericLink ? <PublicShareCard href={genericLink.shortUrl} onCopy={async () => { const result = await copyTextToClipboard(genericLink.shortUrl); toast[result.ok ? "success" : "error"](t(result.ok ? "sharing.copySuccess" : "sharing.copyFailed")); }} onDisable={() => setGenericDisableConfirmation(true)} /> : null}
        {boundAccount ? <p className="text-sm font-medium">{boundAccount.subscription.platformName} #{boundAccount.accountNumber}</p> : accounts.length > 0 ? <FormField id="seat-link-account" label="合租账号">{(field) => <Select value={accountId} onValueChange={setAccountId} disabled={working}><SelectTrigger id={field.id}><SelectValue /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.subscription.platformName} #{account.accountNumber}{account.name !== account.subscription.platformName ? ` · ${account.name}` : ""}</SelectItem>)}</SelectContent></Select>}</FormField> : null}
        {loading ? <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("sharing.loadingSeats")}</div> : accounts.length === 0 && !error ? <p className="py-4 text-sm text-muted-foreground">{t("sharing.noInboxSubscription")}</p> : null}
        {seats.length > 0 ? <>
          <ShareSettingsCollapse summary={`${sharingEnabled ? "已开启" : "已关闭"} · 最近 ${windowMinutes === 30 ? "30 分钟" : `${windowMinutes} 分钟`} · ${folderIds.map((id) => folders.find((folder) => folder.id === id)?.name || id).join("、") || "未选择文件夹"}`}><div className="flex items-center justify-between gap-4 bg-muted/30 px-3 py-2.5"><div><label htmlFor="seat-sharing-enabled" className="text-sm font-semibold">{t("sharing.seatLinkSharing")}</label><p className="mt-0.5 text-xs text-muted-foreground">{t(sharingEnabled ? "sharing.seatLinkSharingOn" : "sharing.seatLinkSharingOff")}</p></div><Switch id="seat-sharing-enabled" checked={sharingEnabled} disabled={working || loading || (!sharingEnabled && (folderIds.length === 0 || enableCandidates.length === 0))} onCheckedChange={(enabled) => { if (enabled) void toggleSharing(true); else setDisableConfirmation(true); }} /></div>
            <div className="grid divide-y divide-border"><div className="grid gap-2 px-3 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center"><label htmlFor="seat-link-window" className="text-sm font-medium">{t("sharing.recentMailRange")}</label><Select value={String(windowMinutes)} onValueChange={(value) => setWindowMinutes(Number(value))} disabled={working}><SelectTrigger id="seat-link-window" className="h-9"><SelectValue /></SelectTrigger><SelectContent>{[[30, "30 分钟"], [60, "1 小时"], [360, "6 小时"], [1440, "1 天"], [10080, "7 天"]].map(([value, label]) => <SelectItem key={value} value={String(value)}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2 px-3 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start"><span className="pt-1 text-sm font-medium">{t("sharing.linkFolders")}</span><div id="seat-link-folders" className="flex min-h-9 flex-wrap gap-x-3 gap-y-2 rounded-md border bg-background px-2.5 py-2">{folders.map((folder) => <label key={folder.id} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" disabled={working} checked={folderIds.includes(folder.id)} onChange={(event) => setFolderIds((current) => event.target.checked ? [...current, folder.id] : current.filter((id) => id !== folder.id))} />{folder.role === "inbox" ? t("sharing.inboxFolder") : folder.name}</label>)}</div></div></div>
          </ShareSettingsCollapse>
          <ResponsiveSeatList items={seatItems} />
        </> : null}
    </ShareLinkManager> : null}
    <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t(confirmation?.action === "reset" ? "sharing.resetInboxLinkConfirm" : "sharing.revokeInboxLinkConfirm")}</AlertDialogTitle><AlertDialogDescription>{t("sharing.inboxLinkConfirmHelp")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("sharing.inboxCancel")}</AlertDialogCancel><AlertDialogAction className={confirmation?.action === "revoke" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined} onClick={() => { const action = confirmation; setConfirmation(null); if (action) void mutate(action.seat, action.action, action.link); }}>{t("sharing.inboxConfirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={disableConfirmation} onOpenChange={setDisableConfirmation}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("sharing.disableSeatLinksTitle")}</AlertDialogTitle><AlertDialogDescription>{t("sharing.disableSeatLinksHelp")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("sharing.inboxCancel")}</AlertDialogCancel><AlertDialogAction onClick={() => { setDisableConfirmation(false); void toggleSharing(false); }}>{t("sharing.inboxConfirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={genericDisableConfirmation} onOpenChange={setGenericDisableConfirmation}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("sharing.closePublicShareTitle")}</AlertDialogTitle><AlertDialogDescription>{t("sharing.closePublicShareHelp")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("sharing.inboxCancel")}</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { setGenericDisableConfirmation(false); void revokeGenericLink(); }}>{t("sharing.inboxConfirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
