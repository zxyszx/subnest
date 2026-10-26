import { SubscriptionLogo } from "@/components/subscription-logo";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

interface CalendarAccountIdentityProps {
  platformName: string;
  logo?: string | null | undefined;
  accountNumber?: number | undefined;
  fallbackColor?: string | undefined;
  size?: "xs" | "sm" | undefined;
  className?: string | undefined;
  nameClassName?: string | undefined;
  logoContrast?: boolean;
  secondaryText?: string | undefined;
}

export function CalendarAccountIdentity({
  platformName,
  logo,
  accountNumber,
  fallbackColor,
  size = "sm",
  className,
  nameClassName,
  logoContrast = true,
  secondaryText,
}: CalendarAccountIdentityProps) {
  const { t } = useI18n();
  const compact = size === "xs";
  const name = <span className={cn("min-w-0 truncate font-medium text-foreground", compact ? "text-xs" : "text-sm", nameClassName)}>{platformName}</span>;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center",
        compact ? "gap-1.5" : "gap-3",
        className,
      )}
    >
      <span className="relative shrink-0" aria-hidden="true">
        <SubscriptionLogo
          name={platformName}
          logo={logo}
          fallbackColor={fallbackColor}
          size={size}
          className={cn(
            logoContrast && "subscription-logo-contrast",
            compact && "h-5 w-5 rounded",
          )}
        />
        {accountNumber ? (
          <span
            className={cn(
              "absolute flex items-center justify-center rounded-full border-2 border-card bg-primary font-bold leading-none text-primary-foreground tabular-nums",
              compact
                ? "-right-1 -top-1 h-3.5 min-w-3.5 px-0.5 text-[8px]"
                : "-right-1.5 -top-1.5 h-5 min-w-5 px-1 text-[10px]",
            )}
            title={t("subscription.accountNumberBadge", {
              number: accountNumber,
            })}
          >
            {accountNumber}
          </span>
        ) : null}
      </span>
      {secondaryText ? <span className="grid min-w-0 gap-0.5">
        {name}
        <span title={secondaryText} className="line-clamp-2 text-xs font-normal text-muted-foreground wrap-anywhere md:block md:truncate" data-testid="renewal-login-account">{secondaryText}</span>
      </span> : name}
    </div>
  );
}
