import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { Copy, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import type { SharingAccount, SharingAccountDetail, SharingTotpLink } from "@renewlet/shared/schemas/sharing";
import { sharingService } from "@/services/sharing-service";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import { toast } from "@/components/ui/sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useSettingsEnvelope } from "@/hooks/use-settings";
import { useZonedToday } from "@/hooks/use-zoned-today";

export function SharingTotpLinksDialog({ account, onClose }: { account: SharingAccount; onClose: () => void }) {
  const { t } = useI18n();
  const settingsQuery = useSettingsEnvelope();
  const today = useZonedToday(settingsQuery.data?.settings.timezone ?? "UTC");
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
      setLinks([]);
      setError(t("sharing.totpActionFailed"));
    }
    finally { setBusy(false); }
  }
  const scopes = [{ id: "", title: t("sharing.totpDefault"), enabled: true }, ...(detail?.seats ?? []).map((seat) => ({ id: seat.id, title: t("sharing.totpSeat", { number: seat.seatNumber, member: seat.memberName || t("sharing.totpVacant") }), enabled: seat.status === "active" && Boolean(seat.memberName) && Boolean(seat.expiresAt && seat.expiresAt >= today) }))];
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="flex flex-wrap items-center gap-2"><ShieldCheck className="h-5 w-5" />{t("sharing.totpTitle")} {account.subscription.platformName} #{account.accountNumber}</DialogTitle><DialogDescription className="break-all">{account.loginAccount}</DialogDescription></DialogHeader>
    {loading ? <div role="status" className="flex items-center gap-2 py-3"><Loader2 className="h-4 w-4 animate-spin" />{t("sharing.totpLoading")}</div> : <div className="divide-y divide-border">{scopes.map((scope) => {
      const link = links.find((item) => item.seatId === scope.id);
      return <div key={scope.id} className="grid gap-3 py-1"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{scope.title}</span><span className={link?.valid ? "text-xs text-primary" : "text-xs text-muted-foreground"}>{link?.valid ? t("sharing.totpValid") : link ? t("sharing.totpInvalid") : t("sharing.totpUncreated")}</span></div>
        {link?.valid ? <><div className="flex min-w-0 items-center gap-2"><span className="min-w-0 flex-1 break-all text-xs text-muted-foreground">{new URL(link.path, window.location.origin).href}</span><Button variant="ghost" size="icon" aria-label={t("sharing.totpCopy", { title: scope.title })} disabled={busy} onClick={async () => { const result = await copyTextToClipboard(new URL(link.path, window.location.origin).href); toast[result.ok ? "success" : "error"](result.ok ? t("sharing.totpCopied") : t("sharing.totpCopyFailed")); }}><Copy className="h-4 w-4" /></Button></div><p className="text-xs text-muted-foreground">{link.expiresAt ? t("sharing.totpExpiry", { date: new Date(link.expiresAt).toLocaleString() }) : t("sharing.linkLongTerm")}</p></> : null}
        <div className="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={busy || !scope.enabled} onClick={() => { if (link?.valid) setConfirmation({ seatId: scope.id, link, revoke: false, title: scope.title }); else void change(scope.id, link); }}>{link?.valid ? <RefreshCw className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{link?.valid ? t("sharing.totpReset") : t("sharing.totpGenerate")}</Button>{link?.valid ? <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirmation({ seatId: scope.id, link, revoke: true, title: scope.title })}><Trash2 className="h-4 w-4" />{t("sharing.totpRevoke")}</Button> : null}</div>
      </div>;
    })}</div>}
    {error ? <div role="alert" className="grid gap-2 text-sm text-destructive">{error}<Button variant="outline" disabled={busy || loading} onClick={() => setRetry((value) => value + 1)}>{t("sharing.totpRetry")}</Button></div> : null}
    <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("sharing.totpConfirmTitle", { action: t(confirmation?.revoke ? "sharing.totpRevoke" : "sharing.totpResetAction"), title: confirmation?.title ?? "" })}</AlertDialogTitle><AlertDialogDescription>{t("sharing.genericLinkResetWarning")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("sharing.cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => { const action = confirmation; setConfirmation(null); if (action) void change(action.seatId, action.link, action.revoke); }}>{t("sharing.totpConfirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </DialogContent></Dialog>;
}
