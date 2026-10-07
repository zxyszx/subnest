import { useEffect, useState } from "react";
import { Copy, Link2, Loader2, RefreshCw, Trash2, UsersRound } from "lucide-react";
import type { SharingAccount, SharingSeat } from "@renewlet/shared/schemas/sharing";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField, FormFieldRow } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { newszxcnService, type NewSzxcnFolder, type NewSzxcnMailbox, type SharedInboxLink } from "@/services/newszxcn-service";
import { sharingService } from "@/services/sharing-service";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import { useI18n } from "@/i18n/I18nProvider";

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
    if (generic) {
      setFolderIds(generic.folderIds);
      setWindowMinutes(generic.windowMinutes);
    }
  }, [initialLinks, mailbox.id, loadedAt]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([boundAccount ? Promise.resolve({ accounts: [boundAccount] }) : sharingService.list(), newszxcnService.folders(mailbox.id)]).then(([result, folderResult]) => {
      if (cancelled) return;
      const matches = result.accounts.filter((account) => account.status === "active" && account.loginAccount.trim().toLowerCase() === mailbox.address.trim().toLowerCase());
      setAccounts(matches); setAccountId(matches[0]?.id ?? ""); setFolders(folderResult.items);
    }).catch(() => { if (!cancelled) setError("无法读取车位或文件夹，请关闭后重试。"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mailbox, boundAccount]);
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
        <DialogHeader className="shrink-0 border-b border-border p-4 pr-12"><DialogTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-primary" />{t("sharing.inboxLinks")}</DialogTitle><DialogDescription className="break-all">{mailbox.address}</DialogDescription></DialogHeader>
        <div data-seat-links-scroll className="grid min-h-0 min-w-0 gap-4 overflow-y-auto p-4">
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {genericLink ? <div className="grid gap-2 border-b pb-3"><p role="status" className="text-sm text-amber-700 dark:text-amber-400">{t("sharing.genericLinkWarning")}</p><div className="flex min-w-0 items-center gap-2"><Input aria-label={t("sharing.genericLink")} readOnly value={genericLink.shortUrl} className="min-w-0 text-xs" /><Button size="icon" variant="outline" aria-label={t("sharing.copyGenericLink")} onClick={async () => { const result = await copyTextToClipboard(genericLink.shortUrl); toast[result.ok ? "success" : "error"](t(result.ok ? "sharing.copySuccess" : "sharing.copyFailed")); }}><Copy className="h-4 w-4" /></Button></div></div> : null}
        {boundAccount ? <p className="text-sm font-medium">{boundAccount.subscription.platformName} #{boundAccount.accountNumber}</p> : accounts.length > 0 ? <FormField id="seat-link-account" label="合租账号">{(field) => <Select value={accountId} onValueChange={setAccountId} disabled={working}><SelectTrigger id={field.id}><SelectValue /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.subscription.platformName} #{account.accountNumber}{account.name !== account.subscription.platformName ? ` · ${account.name}` : ""}</SelectItem>)}</SelectContent></Select>}</FormField> : null}
        {loading ? <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("sharing.loadingSeats")}</div> : accounts.length === 0 && !error ? <p className="py-4 text-sm text-muted-foreground">{t("sharing.noInboxSubscription")}</p> : null}
        {seats.length > 0 ? <>
          <div className="flex items-center justify-between gap-4 border-b pb-3"><div><label htmlFor="seat-sharing-enabled" className="text-sm font-medium">{t("sharing.seatLinkSharing")}</label><p className="mt-1 text-xs text-muted-foreground">{t(sharingEnabled ? "sharing.seatLinkSharingOn" : "sharing.seatLinkSharingOff")}</p></div><Switch id="seat-sharing-enabled" checked={sharingEnabled} disabled={working || loading || (!sharingEnabled && (folderIds.length === 0 || enableCandidates.length === 0))} onCheckedChange={(enabled) => { if (enabled) void toggleSharing(true); else setDisableConfirmation(true); }} /></div>
          <FormFieldRow alignAt="sm" rowClassName="sm:grid-cols-2">
            <FormField id="seat-link-window" label="最近可查看邮件范围">{(field) => <Select value={String(windowMinutes)} onValueChange={(value) => setWindowMinutes(Number(value))} disabled={working}><SelectTrigger id={field.id}><SelectValue /></SelectTrigger><SelectContent>{[[30, "30 分钟"], [60, "1 小时"], [360, "6 小时"], [1440, "1 天"], [10080, "7 天"]].map(([value, label]) => <SelectItem key={value} value={String(value)}>{label}</SelectItem>)}</SelectContent></Select>}</FormField>
            <FormField id="seat-link-folders" label={t("sharing.linkFolders")}>{() => <div id="seat-link-folders" className="flex max-h-32 min-h-10 flex-wrap gap-x-3 gap-y-2 overflow-y-auto rounded-md border p-2">{folders.map((folder) => <label key={folder.id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={working} checked={folderIds.includes(folder.id)} onChange={(event) => setFolderIds((current) => event.target.checked ? [...current, folder.id] : current.filter((id) => id !== folder.id))} />{folder.role === "inbox" ? t("sharing.inboxFolder") : folder.name}</label>)}</div>}</FormField>
          </FormFieldRow>
          <div className="grid gap-3">{seats.map((seat) => {
            const link = linkFor(seat.id);
            const eligible = seat.status === "active" && Boolean(seat.memberName);
            const usable = Boolean(link && linkUsable(link));
            return <section key={seat.id} className="grid gap-3 rounded-md border border-border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-semibold">{t("sharing.inboxSeat", { number: seat.seatNumber })} · {seat.memberName || t("sharing.inboxVacant")}</p><p className="mt-1 text-xs text-muted-foreground">{usable ? t("sharing.linkLongTerm") : link ? t("sharing.linkUnavailable") : t("sharing.linkNotCreated")}</p></div><span className={usable ? "text-xs font-medium text-primary" : "text-xs text-muted-foreground"}>{usable ? t("sharing.totpValid") : t("sharing.totpUncreated")}</span></div>
              {usable && link ? <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted/40 px-3 py-1"><span className="min-w-0 flex-1 break-all text-xs text-muted-foreground">{link.shortUrl}</span><Button size="icon" variant="ghost" disabled={working || !eligible} aria-label={t("sharing.copyInboxLink")} onClick={async () => { const result = await copyTextToClipboard(link.shortUrl); toast[result.ok ? "success" : "error"](t(result.ok ? "sharing.copySuccess" : "sharing.copyFailed")); }}><Copy className="h-4 w-4" /></Button></div> : null}
              <div className="flex flex-wrap justify-end gap-2">{link ? <><Button size="sm" variant="outline" disabled={working || !eligible} onClick={() => setConfirmation({ seat, link, action: "reset" })}><RefreshCw className="h-3.5 w-3.5" />{t("sharing.resetInboxLink")}</Button><Button size="sm" variant="destructive" disabled={working} onClick={() => setConfirmation({ seat, link, action: "revoke" })}><Trash2 className="h-3.5 w-3.5" />{t("sharing.revokeInboxLink")}</Button></> : <Button size="sm" disabled={working || !eligible || folderIds.length === 0} onClick={() => void mutate(seat, "create")}><Link2 className="h-3.5 w-3.5" />{t("sharing.createInboxLink")}</Button>}</div>
            </section>;
          })}</div>
        </> : null}
        </div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t(confirmation?.action === "reset" ? "sharing.resetInboxLinkConfirm" : "sharing.revokeInboxLinkConfirm")}</AlertDialogTitle><AlertDialogDescription>{t("sharing.inboxLinkConfirmHelp")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("sharing.inboxCancel")}</AlertDialogCancel><AlertDialogAction className={confirmation?.action === "revoke" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined} onClick={() => { const action = confirmation; setConfirmation(null); if (action) void mutate(action.seat, action.action, action.link); }}>{t("sharing.inboxConfirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={disableConfirmation} onOpenChange={setDisableConfirmation}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("sharing.disableSeatLinksTitle")}</AlertDialogTitle><AlertDialogDescription>{t("sharing.disableSeatLinksHelp")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("sharing.inboxCancel")}</AlertDialogCancel><AlertDialogAction onClick={() => { setDisableConfirmation(false); void toggleSharing(false); }}>{t("sharing.inboxConfirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
