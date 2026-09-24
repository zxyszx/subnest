import { CreditCard } from "lucide-react";

import { AuthorizedImage } from "@/components/authorized-image";
import { useCustomConfigState } from "@/contexts/CustomConfigContext";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

export function SharingPaymentSummary({
  paymentMethod,
  cardLast4,
  className,
}: {
  paymentMethod: string | null;
  cardLast4: string | null;
  className?: string;
}) {
  const { config } = useCustomConfigState();
  const { label } = useI18n();
  const configuredMethod = paymentMethod
    ? config.paymentMethods.find((item) => item.value === paymentMethod)
    : undefined;
  if (!paymentMethod && !cardLast4) return null;

  const paymentLabel = configuredMethod ? label(configuredMethod.labels) : paymentMethod;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {configuredMethod?.icon ? (
        <AuthorizedImage src={configuredMethod.icon} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
      ) : (
        <CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{[paymentLabel, cardLast4 ? `•••• ${cardLast4}` : null].filter(Boolean).join(" · ")}</span>
    </span>
  );
}

