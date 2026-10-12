import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, MoreHorizontal, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { SharingAccount, SharingAccountDetail, SharingSeat, SharingTotpLink } from "@renewlet/shared/schemas/sharing";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/I18nProvider";
import { sharingService } from "@/services/sharing-service";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import { PublicShareCard, ResponsiveSeatList, ShareLinkManager, type SeatLinkItem } from "@/components/share-link-manager";
import { sharingSeatLinkEligible } from "@/lib/sharing-seat-state";
import { dateToDateOnly } from "@/lib/time/date-only";

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
  const today = dateToDateOnly(new Date());

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
      const credentials = account.hasPassword || account.additionalCredential
        ? await sharingService.credentials(account.id)
        : { password: "", additionalCredential: null };
      const password = credentials.password || t("sharing.passwordNotSet");
      const value = t("sharing.seatShareTemplate", {
        platform: account.subscription.platformName,
        seat: t("sharing.inboxSeat", { number: scope.seat.seatNumber }),
        member: scope.seat.memberName || t("sharing.totpVacant"),
        account: account.loginAccount,
        password,
        additionalCredential: credentials.additionalCredential ? `\n${credentials.additionalCredential.name}：${credentials.additionalCredential.value}` : "",
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
      enabled: sharingSeatLinkEligible(seat, today),
      seat,
    })),
  ];

  const genericScope = scopes[0]!;
  const genericLink = links.find((item) => item.seatId === "");
  const genericHref = genericLink?.valid ? new URL(genericLink.path, window.location.origin).href : "";
  const seatItems: SeatLinkItem[] = scopes.filter((scope): scope is LinkScope & { seat: SharingSeat } => Boolean(scope.seat)).map((scope) => {
    const link = links.find((item) => item.seatId === scope.id);
    const href = link?.valid ? new URL(link.path, window.location.origin).href : "";
    const copyLink = async () => { const result = await copyTextToClipboard(href); toast[result.ok ? "success" : "error"](result.ok ? t("sharing.totpCopied") : t("sharing.totpCopyFailed")); };
    const actions = href ? <><Button variant="outline" size="sm" className="min-h-11 max-md:flex-1" disabled={busy} onClick={() => void copySeatShare(scope, href)}><Copy className="h-4 w-4" />{t("sharing.copySeatShare")}</Button><Button variant="outline" size="icon" className="min-h-11 min-w-11 max-md:hidden" disabled={busy} aria-label={t("sharing.totpCopy", { title: scope.title })} onClick={() => void copyLink()}><Copy className="h-4 w-4" /></Button><Button variant="outline" size="icon" className="min-h-11 min-w-11 max-md:hidden" asChild aria-label={t("sharing.previewShare")}><a href={href} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="min-h-11 min-w-11" disabled={busy} aria-label={t("sharing.moreLinkActions")}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" mobileTitle={t("sharing.moreLinkActions")}><DropdownMenuItem className="md:hidden" onSelect={() => void copyLink()}><Copy className="h-4 w-4" />{t("sharing.copyInboxLink")}</DropdownMenuItem><DropdownMenuItem className="md:hidden" asChild><a href={href} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{t("sharing.previewShare")}</a></DropdownMenuItem><DropdownMenuItem disabled={!scope.enabled} onSelect={() => setConfirmation({ seatId: scope.id, link: link!, revoke: false, title: scope.title })}><RefreshCw className="h-4 w-4" />{t("sharing.totpReset")}</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmation({ seatId: scope.id, link: link!, revoke: true, title: scope.title })}><Trash2 className="h-4 w-4" />{t("sharing.totpRevoke")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></> : <Button variant="outline" size="sm" className="min-h-11" disabled={busy || !scope.enabled} onClick={() => void change(scope.id, link)}><Plus className="h-4 w-4" />{t("sharing.totpGenerate")}</Button>;
    return { seat: scope.seat, href, valid: Boolean(link?.valid), statusText: link?.valid ? t("sharing.totpValid") : link ? t("sharing.totpInvalid") : t("sharing.totpUncreated"), fallbackText: t(link ? "sharing.totpInvalid" : "sharing.totpUncreated"), actions };
  });

  return <ShareLinkManager account={account} seats={detail?.seats ?? []} busy={busy} onClose={onClose}>
      {genericHref && genericLink ? <PublicShareCard href={genericHref} onCopy={async () => { const result = await copyTextToClipboard(genericHref); toast[result.ok ? "success" : "error"](result.ok ? t("sharing.totpCopied") : t("sharing.totpCopyFailed")); }} onDisable={() => setConfirmation({ seatId: "", link: genericLink, revoke: true, title: genericScope.title })} /> : null}
      {loading ? <div role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-4 w-4 animate-spin" />{t("sharing.totpLoading")}</div> : <ResponsiveSeatList items={seatItems} />}
      {error ? <div role="alert" className="mt-3 grid gap-2 text-sm text-destructive">{error}<Button variant="outline" disabled={busy || loading} onClick={() => setRetry((value) => value + 1)}>{t("sharing.totpRetry")}</Button></div> : null}
    <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("sharing.totpConfirmTitle", { action: t(confirmation?.revoke ? "sharing.totpRevoke" : "sharing.totpResetAction"), title: confirmation?.title ?? "" })}</AlertDialogTitle><AlertDialogDescription>{t("sharing.genericLinkResetWarning")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("sharing.cancel")}</AlertDialogCancel><AlertDialogAction className={confirmation?.revoke ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined} onClick={() => { const action = confirmation; setConfirmation(null); if (action) void change(action.seatId, action.link, action.revoke); }}>{t("sharing.totpConfirm")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </ShareLinkManager>;
}
