import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { copyTextToClipboard } from "@/shared/browser/clipboard";

/** A copy action always stays beside its value and confirms actual clipboard success. */
export function CopyButton({ value, getValue, label, children, className, showLabel = false }: {
  value?: string | undefined;
  getValue?: (() => Promise<string | null>) | undefined;
  label: string;
  children?: ReactNode;
  className?: string;
  showLabel?: boolean;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { setCopied(false); }, [value]);
  const copy = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setCopied(false);
    if (timer.current) clearTimeout(timer.current);
    try {
      const text = getValue ? await getValue() : value;
      // A credential provider reports its own fetch error and returns null.
      if (text == null) return;
      const result = await copyTextToClipboard(text);
      if (!result.ok) {
        toast.error(t("rawErrorResponse.copyFailed"));
        return;
      }
      setCopied(true);
      toast.success(t("rawErrorResponse.copied"));
      timer.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error(t("rawErrorResponse.copyFailed"));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return (
    <Button type="button" variant="ghost" size={showLabel || children ? "default" : "icon"}
      className={cn("min-h-11 min-w-11 shrink-0 gap-2", className)}
      aria-label={label} title={label} aria-busy={pending} disabled={pending}
      onClick={() => void copy()}>
      {children}
      {pending ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : copied ? <Check className="size-4 shrink-0 text-primary" aria-hidden="true" /> : <Copy className="size-4 shrink-0" aria-hidden="true" />}
      {showLabel ? <span>{copied ? t("rawErrorResponse.copied") : t("subscription.copy")}</span> : null}
    </Button>
  );
}
