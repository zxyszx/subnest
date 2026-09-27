import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, ShieldCheck } from "lucide-react";
import { useParams } from "react-router";
import { SubscriptionLogo } from "@/components/subscription-logo";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import { onlineTotpService } from "@/services/online-totp-service";
import { useI18n } from "@/i18n/I18nProvider";
import type { z } from "zod";
import type { onlineTotpPublicPayloadSchema } from "@renewlet/shared/schemas/online-totp";
import { onlineTotpCopy } from "@/pages/online-totp-copy";

type PublicAccount = z.infer<typeof onlineTotpPublicPayloadSchema>;

export default function PublicOnlineTotpPage() {
  const { t, locale } = useI18n();
  const text = onlineTotpCopy(locale);
  const { shareKey = "" } = useParams();
  const [account, setAccount] = useState<PublicAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setAccount(await onlineTotpService.publicAccount(shareKey));
      setError(false);
    } catch {
      setError(true);
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [shareKey]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (account && nextNow >= Date.parse(account.validUntil)) void load(true);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [account, load]);

  const copyCode = async () => {
    if (!account) return;
    const result = await copyTextToClipboard(account.code);
    if (result.ok) toast.success(t("sharing.copySuccess"));
    else toast.error(t("sharing.copyFailed"));
  };

  if (error) {
    return <main className="grid min-h-svh place-items-center bg-background p-6 text-foreground"><section className="max-w-md text-center"><ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold">{text.publicUnavailable}</h1><p className="mt-2 text-sm text-muted-foreground">{text.publicUnavailableHint}</p></section></main>;
  }

  const seconds = account ? Math.max(0, Math.ceil((Date.parse(account.validUntil) - now) / 1_000)) : 0;
  return <main className="grid min-h-svh place-items-center bg-background p-4 text-foreground sm:p-6">
    <section className="w-full max-w-md rounded-lg border bg-card p-5 shadow-sm sm:p-7">
      {loading || !account ? <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />{text.publicLoading}</div> : <>
        <div className="flex items-center gap-3"><SubscriptionLogo name={account.platformName} logo={account.logo} size="md" /><div className="min-w-0"><h1 className="truncate text-lg font-semibold">{account.platformName}</h1>{account.serviceName ? <p className="truncate text-sm text-muted-foreground">{account.serviceName}</p> : null}</div></div>
        <div className="mt-6 rounded-md border bg-muted/25 p-5 text-center">
          <p className="text-sm text-muted-foreground">{text.publicTitle}</p>
          <button type="button" className="mt-2 rounded-md font-mono text-4xl font-bold tabular-nums tracking-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void copyCode()}>{account.code.slice(0, 3)} {account.code.slice(3)}</button>
          <div className="mx-auto mt-4 h-1.5 max-w-56 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width] duration-1000" style={{ width: `${Math.max(0, Math.min(100, seconds / 30 * 100))}%` }} /></div>
          <p className="mt-2 text-xs tabular-nums text-muted-foreground">{text.publicHint} · {text.remaining(seconds)}</p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3"><p className="min-w-0 truncate text-sm text-muted-foreground">{account.account}</p><Button type="button" variant="outline" onClick={() => void copyCode()}><Copy className="h-4 w-4" />{text.copyCode}</Button></div>
      </>}
    </section>
  </main>;
}
