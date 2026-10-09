import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Link2, Loader2, RefreshCw, Trash2, UsersRound } from "lucide-react";
import type { SharingAccount, SharingSeat } from "@renewlet/shared/schemas/sharing";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { newszxcnService, type NewSzxcnFolder, type NewSzxcnMailbox, type SharedInboxLink } from "@/services/newszxcn-service";
import { sharingService } from "@/services/sharing-service";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import { useI18n } from "@/i18n/I18nProvider";

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
  const eligibleSeats = seats.filter((seat) => seat.status === "active" && Boolean(seat.memberName));
  const enableCandidates = eligibleSeats.filter((seat) => !accountLinks.some((link) => link.seatId === seat.id && linkUsable(link)));
  const genericLink = links.find((link) => !link.seatId && link.mailboxId === mailbox.id && link.status === "active" && linkUsable(link));
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

  return <>
    <Dialog open onOpenChange={(open) => { if (!open && !working) onClose(); }}>
      <DialogContent className="max-h-[88dvh] w-[calc(100vw-2rem)] min-w-0 max-w-2xl gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border p-4 pr-12 text-left"><DialogTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-primary" />{t("sharing.inboxLinks")}</DialogTitle><DialogDescription className="break-all">{mailbox.address}</DialogDescription></DialogHeader>
        <div data-seat-links-scroll className="grid min-h-0 min-w-0 gap-4 overflow-y-auto p-4">
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {genericLink ? <section className="overflow-hidden rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20"><div className="border-b border-amber-200 px-3 py-2 dark:border-amber-900"><p className="text-xs font-semibold text-amber-900 dark:text-amber-200">{t("sharing.genericLink")}</p><p role="status" className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">{t("sharing.genericLinkWarning")}</p></div><div className="flex min-w-0 items-center gap-2 p-2"><Input aria-label={t("sharing.genericLink")} readOnly value={genericLink.shortUrl} title={genericLink.shortUrl} className="h-9 min-w-0 truncate bg-background font-mono text-xs" /><Button size="sm" aria-label={t("sharing.copyGenericLink")} onClick={async () => { const result = await copyTextToClipboard(genericLink.shortUrl); toast[result.ok ? "success" : "error"](t(result.ok ? "sharing.copySuccess" : "sharing.copyFailed")); }}><Copy className="h-4 w-4" />{t("sharing.copyInboxLink")}</Button></div></section> : null}
        {boundAccount ? <p className="text-sm font-medium">{boundAccount.subscription.platformName} #{boundAccount.accountNumber}</p> : accounts.length > 0 ? <FormField id="seat-link-account" label="合租账号">{(field) => <Select value={accountId} onValueChange={setAccountId} disabled={working}><SelectTrigger id={field.id}><SelectValue /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.subscription.platformName} #{account.accountNumber}{account.name !== account.subscription.platformName ? ` · ${account.name}` : ""}</SelectItem>)}</SelectContent></Select>}</FormField> : null}
        {loading ? <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("sharing.loadingSeats")}</div> : accounts.length === 0 && !error ? <p className="py-4 text-sm text-muted-foreground">{t("sharing.noInboxSubscription")}</p> : null}
        {seats.length > 0 ? <>
          <section className="overflow-hidden rounded-md border border-border"><div className="flex items-center justify-between gap-4 bg-muted/30 px-3 py-2.5"><div><label htmlFor="seat-sharing-enabled" className="text-sm font-semibold">{t("sharing.seatLinkSharing")}</label><p className="mt-0.5 text-xs text-muted-foreground">{t(sharingEnabled ? "sharing.seatLinkSharingOn" : "sharing.seatLinkSharingOff")}</p></div><Switch id="seat-sharing-enabled" checked={sharingEnabled} disabled={working || loading || (!sharingEnabled && (folderIds.length === 0 || enableCandidates.length === 0))} onCheckedChange={(enabled) => { if (enabled) void toggleSharing(true); else setDisableConfirmation(true); }} /></div>
            <div className="grid divide-y divide-border"><div className="grid gap-2 px-3 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center"><label htmlFor="seat-link-window" className="text-sm font-medium">{t("sharing.recentMailRange")}</label><Select value={String(windowMinutes)} onValueChange={(value) => setWindowMinutes(Number(value))} disabled={working}><SelectTrigger id="seat-link-window" className="h-9"><SelectValue /></SelectTrigger><SelectContent>{[[30, "30 分钟"], [60, "1 小时"], [360, "6 小时"], [1440, "1 天"], [10080, "7 天"]].map(([value, label]) => <SelectItem key={value} value={String(value)}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2 px-3 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start"><span className="pt-1 text-sm font-medium">{t("sharing.linkFolders")}</span><div id="seat-link-folders" className="flex min-h-9 flex-wrap gap-x-3 gap-y-2 rounded-md border bg-background px-2.5 py-2">{folders.map((folder) => <label key={folder.id} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" disabled={working} checked={folderIds.includes(folder.id)} onChange={(event) => setFolderIds((current) => event.target.checked ? [...current, folder.id] : current.filter((id) => id !== folder.id))} />{folder.role === "inbox" ? t("sharing.inboxFolder") : folder.name}</label>)}</div></div></div>
          </section>
          <section aria-labelledby="seat-links-list-title" className="overflow-hidden rounded-md border border-border"><div className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto] items-center gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground"><span id="seat-links-list-title">{t("sharing.seatMemberColumn")}</span><span>{t("sharing.statusColumn")}</span><span className="text-right">{t("sharing.operationColumn")}</span></div><div className="divide-y divide-border">{seats.map((seat) => {
            const link = linkFor(seat.id);
            const eligible = seat.status === "active" && Boolean(seat.memberName);
            const usable = Boolean(link && linkUsable(link));
            const seatLabel = `${t("sharing.inboxSeat", { number: seat.seatNumber })} · ${seat.memberName || t("sharing.inboxVacant")}`;
            return <div key={seat.id} className="grid min-h-16 grid-cols-[minmax(0,1fr)_4.5rem_auto] items-center gap-3 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium" title={seatLabel}>{seatLabel}</p>{usable && link ? <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={link.shortUrl}>{link.shortUrl}</p> : <p className="mt-0.5 text-xs text-muted-foreground">{link ? t("sharing.linkUnavailable") : t("sharing.linkNotCreated")}</p>}</div><span className={usable ? "inline-flex items-center gap-1 text-xs font-medium text-primary" : "text-xs text-muted-foreground"}>{usable ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}{usable ? t("sharing.totpValid") : t("sharing.totpUncreated")}</span><div className="flex justify-end gap-1">{link ? <>{usable ? <Button size="icon" variant="ghost" disabled={working || !eligible} aria-label={t("sharing.copyInboxLink")} title={t("sharing.copyInboxLink")} onClick={async () => { const result = await copyTextToClipboard(link.shortUrl); toast[result.ok ? "success" : "error"](t(result.ok ? "sharing.copySuccess" : "sharing.copyFailed")); }}><Copy className="h-4 w-4" /></Button> : null}<Button size="icon" variant="ghost" disabled={working || !eligible} aria-label={t("sharing.resetInboxLink")} title={t("sharing.resetInboxLink")} onClick={() => setConfirmation({ seat, link, action: "reset" })}><RefreshCw className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={working} aria-label={t("sharing.revokeInboxLink")} title={t("sharing.revokeInboxLink")} onClick={() => setConfirmation({ seat, link, action: "revoke" })}><Trash2 className="h-4 w-4" /></Button></> : <Button size="sm" disabled={working || !eligible || folderIds.length === 0} onClick={() => void mutate(seat, "create")}><Link2 className="h-3.5 w-3.5" />{t("sharing.createInboxLink")}</Button>}</div></div>;
          })}</div></section>
        </> : null}
        </div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t(confirmation?.action === "reset" ? "sharing.resetInboxLinkConfirm" : "sharing.revokeInboxLinkConfirm")}</AlertDialogTitle><AlertDialogDescription>{t("sharing.inboxLinkConfirmHelp")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("sharing.inboxCancel")}</AlertDialogCancel><AlertDialogAction className={confirmation?.action === "revoke" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined} onClick={() => { const action = confirmation; setConfirmation(null); if (action) void mutate(action.seat, action.action, action.link); }}>{t("sharing.inboxConfirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={disableConfirmation} onOpenChange={setDisableConfirmation}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("sharing.disableSeatLinksTitle")}</AlertDialogTitle><AlertDialogDescription>{t("sharing.disableSeatLinksHelp")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("sharing.inboxCancel")}</AlertDialogCancel><AlertDialogAction onClick={() => { setDisableConfirmation(false); void toggleSharing(false); }}>{t("sharing.inboxConfirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
