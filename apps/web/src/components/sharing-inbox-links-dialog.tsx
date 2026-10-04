import { useCallback, useEffect, useState } from "react";
import type { SharingAccount } from "@renewlet/shared/schemas/sharing";
import { Loader2 } from "lucide-react";
import { SeatInboxLinksDialog } from "@/components/seat-inbox-links-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { newszxcnService, type NewSzxcnMailbox, type SharedInboxLink } from "@/services/newszxcn-service";

export function SharingInboxLinksDialog({ account, onClose }: { account: SharingAccount; onClose: () => void }) {
  const { t } = useI18n();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";
  const [mailbox, setMailbox] = useState<NewSzxcnMailbox | null>(null);
  const [links, setLinks] = useState<SharedInboxLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<MessageKey | "">("");
  const [retry, setRetry] = useState(0);
  const reloadLinks = useCallback(async () => {
    const result = await newszxcnService.links();
    setLinks(result.links);
  }, []);
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void Promise.all([newszxcnService.mailboxes(), newszxcnService.links()]).then(([mailboxes, result]) => {
      if (cancelled) return;
      const match = mailboxes.items.find((item) => item.address.trim().toLowerCase() === account.loginAccount.trim().toLowerCase());
      setMailbox(match ?? null);
      setLinks(result.links);
      if (!match) setError("sharing.mailboxNotMatched");
    }).catch(() => { if (!cancelled) setError("sharing.loadLinksFailed"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [account, isAdmin, retry]);
  if (isAdmin && mailbox && !loading && !error) return <SeatInboxLinksDialog boundAccount={account} mailbox={mailbox} links={links} onClose={onClose} onChanged={reloadLinks} />;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{t("sharing.viewLinks")} · {account.subscription.platformName} #{account.accountNumber}</DialogTitle><DialogDescription className="break-all">{account.loginAccount}</DialogDescription></DialogHeader>
    {!isAdmin ? <p className="text-sm text-muted-foreground">{t("sharing.linkAdminOnly")}</p> : loading ? <div role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("sharing.loadingLinks")}</div> : <div className="space-y-3"><p role="alert" className="text-sm text-destructive">{error ? t(error) : null}</p><Button variant="outline" onClick={() => setRetry((current) => current + 1)}>{t("sharing.retryLinks")}</Button></div>}
  </DialogContent></Dialog>;
}
