import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, MoreHorizontal, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import type { SharingAccount, SharingAccountDetail, SharingSeat, SharingTotpLink } from "@renewlet/shared/schemas/sharing";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SubscriptionLogo } from "@/components/subscription-logo";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/I18nProvider";
import { sharingService } from "@/services/sharing-service";
import { copyTextToClipboard } from "@/shared/browser/clipboard";

type LinkScope = { id: string; title: string; enabled: boolean; seat?: SharingSeat };

export function SharingTotpLinksDialog({ account, onClose }: { account: SharingAccount; onClose: () => void }) {
  const { t } = useI18n();
  const [links, setLinks] = useState<SharingTotpLink[]>([]);
  const [detail, setDetail] = useState<SharingAccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [confirmation, setConfirmation] = useState<{ seatId: string; link: SharingTotpLink; revoke: boolean; title: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    void Promise.all([sharingService.totpLinks(account.id), sharingService.detail(account.id)])
      .then(([result, data]) => { if (!cancelled) { setLinks(result.links); setDetail(data); } })
      .catch(() => { if (!cancelled) setError(t("sharing.totpLoadFailed")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [account.id, retry, t]);

  async function change(seatId: string, link: SharingTotpLink | undefined, revoke = false) {
    setBusy(true); setError("");
    try {
      if (revoke && link) await sharingService.revokeTotpLink(account.id, link.id);
      else await sharingService.totpLinks(account.id, { seatId, reset: true });
      setLinks((await sharingService.totpLinks(account.id)).links);
    } catch {
      setLinks([]); setError(t("sharing.totpActionFailed"));
    } finally { setBusy(false); }
  }

  async function copySeatShare(scope: LinkScope, href: string) {
    if (!scope.seat) return;
    try {
      const password = account.hasPassword ? await sharingService.password(account.id) : t("sharing.passwordNotSet");
      const value = t("sharing.seatShareTemplate", {
        platform: account.subscription.platformName,
        seat: t("sharing.inboxSeat", { number: scope.seat.seatNumber }),
        member: scope.seat.memberName || t("sharing.totpVacant"),
        account: account.loginAccount,
        password,
        link: href,
        expiresAt: scope.seat.expiresAt || "-",
      });
      const result = await copyTextToClipboard(value);
      toast[result.ok ? "success" : "error"](result.ok ? t("sharing.copySeatShareSuccess") : t("sharing.copyFailed"));
    } catch {
      toast.error(t("sharing.passwordUnavailable"));
    }
  }

  const scopes: LinkScope[] = [
    { id: "", title: t("sharing.genericLink"), enabled: true },
    ...(detail?.seats ?? []).map((seat) => ({
      id: seat.id,
      title: t("sharing.totpSeat", { number: seat.seatNumber, member: seat.memberName || t("sharing.totpVacant") }),
      enabled: seat.status === "active" && Boolean(seat.memberName),
      seat,
    })),
  ];

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[92dvh] w-[calc(100vw-2rem)] max-w-5xl gap-0 p-0">
    <DialogHeader className="border-b border-border p-4 pr-12 sm:px-5"><DialogTitle className="flex items-center gap-3"><SubscriptionLogo name={account.subscription.platformName} logo={account.subscription.logo ?? undefined} size="sm" /><span>{t("sharing.totpTitle")} {account.subscription.platformName} #{account.accountNumber}</span></DialogTitle><DialogDescription className="break-all">{account.loginAccount}</DialogDescription></DialogHeader>
    <div className="h5-mobile-sheet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 touch-pan-y sm:p-4">
      {loading ? <div role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-4 w-4 animate-spin" />{t("sharing.totpLoading")}</div> : <section className="overflow-hidden rounded-md border border-border">
        <div className="hidden grid-cols-[minmax(11rem,1fr)_minmax(15rem,2fr)_5rem_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid"><span>{t("sharing.seatMemberColumn")}</span><span>{t("sharing.inboxLinks")}</span><span>{t("sharing.statusColumn")}</span><span className="text-right">{t("sharing.operationColumn")}</span></div>
        <div className="divide-y divide-border">{scopes.map((scope) => {
          const link = links.find((item) => item.seatId === scope.id);
          const href = link?.valid ? new URL(link.path, window.location.origin).href : "";
          return <div key={scope.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(11rem,1fr)_minmax(15rem,2fr)_5rem_auto] sm:items-center sm:gap-3 sm:py-2.5">
            <div className="min-w-0"><p className="truncate text-sm font-semibold" title={scope.title}>{scope.title}</p>{scope.seat?.expiresAt ? <p className="mt-0.5 text-xs text-muted-foreground">{scope.seat.expiresAt}</p> : <p className="mt-0.5 text-xs text-muted-foreground">{link?.valid ? t("sharing.linkLongTerm") : ""}</p>}</div>
            <p className="min-w-0 truncate rounded-md bg-muted/40 px-2.5 py-2 font-mono text-xs text-muted-foreground" title={href}>{href || t(link ? "sharing.totpInvalid" : "sharing.totpUncreated")}</p>
            <span className={link?.valid ? "inline-flex items-center gap-1 text-xs font-medium text-primary" : "text-xs text-muted-foreground"}><ShieldCheck className="h-3.5 w-3.5" />{link?.valid ? t("sharing.totpValid") : link ? t("sharing.totpInvalid") : t("sharing.totpUncreated")}</span>
            <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
              {href && scope.seat ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void copySeatShare(scope, href)}><Copy className="h-4 w-4" />{t("sharing.copySeatShare")}</Button> : null}
              {href ? <Button variant="outline" size="icon" disabled={busy} aria-label={t("sharing.totpCopy", { title: scope.title })} title={t("sharing.copyInboxLink")} onClick={async () => { const result = await copyTextToClipboard(href); toast[result.ok ? "success" : "error"](result.ok ? t("sharing.totpCopied") : t("sharing.totpCopyFailed")); }}><Copy className="h-4 w-4" /></Button> : null}
              {href ? <Button variant="outline" size="icon" asChild aria-label={t("sharing.previewShare")} title={t("sharing.previewShare")}><a href={href} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button> : null}
              {link?.valid ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" disabled={busy} aria-label={t("sharing.moreLinkActions")} title={t("sharing.moreLinkActions")}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" mobileTitle={t("sharing.moreLinkActions")}><DropdownMenuItem disabled={!scope.enabled} onSelect={() => setConfirmation({ seatId: scope.id, link, revoke: false, title: scope.title })}><RefreshCw className="h-4 w-4" />{t("sharing.totpReset")}</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmation({ seatId: scope.id, link, revoke: true, title: scope.title })}><Trash2 className="h-4 w-4" />{t("sharing.totpRevoke")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : <Button variant="outline" size="sm" disabled={busy || !scope.enabled} onClick={() => void change(scope.id, link)}><Plus className="h-4 w-4" />{t("sharing.totpGenerate")}</Button>}
            </div>
          </div>;
        })}</div>
      </section>}
      {error ? <div role="alert" className="mt-3 grid gap-2 text-sm text-destructive">{error}<Button variant="outline" disabled={busy || loading} onClick={() => setRetry((value) => value + 1)}>{t("sharing.totpRetry")}</Button></div> : null}
    </div>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("sharing.totpConfirmTitle", { action: t(confirmation?.revoke ? "sharing.totpRevoke" : "sharing.totpResetAction"), title: confirmation?.title ?? "" })}</AlertDialogTitle><AlertDialogDescription>{t("sharing.genericLinkResetWarning")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("sharing.cancel")}</AlertDialogCancel><AlertDialogAction className={confirmation?.revoke ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined} onClick={() => { const action = confirmation; setConfirmation(null); if (action) void change(action.seatId, action.link, action.revoke); }}>{t("sharing.totpConfirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </DialogContent></Dialog>;
}
