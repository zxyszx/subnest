import { useCallback, useEffect, useState } from "react";
import { Check, Copy, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { useParams } from "react-router";
import { SubscriptionLogo } from "@/components/subscription-logo";
import { toast } from "@/components/ui/sonner";
import { copyTextToClipboard } from "@/shared/browser/clipboard";
import { onlineTotpService } from "@/services/online-totp-service";
import { useI18n } from "@/i18n/I18nProvider";
import type { z } from "zod";
import type { onlineTotpPublicPayloadSchema } from "@renewlet/shared/schemas/online-totp";
import { onlineTotpCopy } from "@/pages/online-totp-copy";
import { useSystemColorScheme } from "@/hooks/use-system-color-scheme";

type PublicAccount = z.infer<typeof onlineTotpPublicPayloadSchema>;

export default function PublicOnlineTotpPage() {
  useSystemColorScheme();
  const { t, locale } = useI18n();
  const text = onlineTotpCopy(locale);
  const { shareKey = "" } = useParams();
  const [account, setAccount] = useState<PublicAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState<"code" | "account" | null>(null);

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

  const copyValue = async (value: string, target: "code" | "account") => {
    const result = await copyTextToClipboard(value);
    if (result.ok) {
      setCopied(target);
      window.setTimeout(() => setCopied((current) => current === target ? null : current), 2_000);
      toast.success(t("sharing.copySuccess"));
    } else toast.error(t("sharing.copyFailed"));
  };
  const copyCode = async () => { if (account) await copyValue(account.code, "code"); };

  if (error) {
    return <main className="grid min-h-svh place-items-center bg-background p-6 text-foreground"><section className="max-w-md text-center"><ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-semibold">{text.publicUnavailable}</h1><p className="mt-2 text-sm text-muted-foreground">{text.publicUnavailableHint}</p></section></main>;
  }

  const seconds = account ? Math.max(0, Math.ceil((Date.parse(account.validUntil) - now) / 1_000)) : 0;
  const showServiceName = account?.serviceName && account.serviceName.trim().toLocaleLowerCase() !== account.platformName.trim().toLocaleLowerCase();
  return <main className="grid min-h-svh place-items-center bg-muted/30 px-4 py-8 text-foreground sm:p-6">
    <section className="w-full max-w-lg rounded-xl border bg-card p-4 shadow-sm sm:p-7">
      {loading || !account ? <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />{text.publicLoading}</div> : <>
        <div className="flex items-center gap-3 border-b pb-4"><SubscriptionLogo name={account.platformName} logo={account.logo} size="md" /><div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{text.publicTitle}</p><h1 className="mt-0.5 truncate text-xl font-semibold">{account.platformName}</h1>{showServiceName ? <p className="truncate text-sm text-muted-foreground">{account.serviceName}</p> : null}</div></div>
        <button type="button" aria-label={text.copyCode} className="mt-4 block w-full rounded-lg border bg-muted/25 px-4 py-5 text-center transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6 sm:py-6" onClick={() => void copyCode()}>
          <p className="font-mono text-4xl font-bold tabular-nums tracking-normal sm:text-5xl">{account.code.slice(0, 3)} {account.code.slice(3)}</p>
          <div className="mx-auto mt-5 h-2 max-w-72 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width] duration-1000" style={{ width: `${Math.max(0, Math.min(100, seconds / 30 * 100))}%` }} /></div>
          <p className="mt-3 text-xs tabular-nums text-muted-foreground">{text.publicHint} · {text.remaining(seconds)}</p>
          <span className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-md bg-primary/10 px-3 text-sm font-medium text-primary">{copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied === "code" ? t("sharing.copySuccess") : text.copyCode}</span>
        </button>
        <button type="button" className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-lg border bg-secondary/30 px-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void copyValue(account.account, "account")}><UserRound className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">{text.account}</span><span className="block truncate text-sm font-medium text-foreground">{account.account}</span></span><span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary">{copied === "account" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied === "account" ? t("sharing.copySuccess") : text.copy}</span></button>
      </>}
    </section>
  </main>;
}
