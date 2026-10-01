import Link from "@/components/router-link";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import type { SharingUpcomingSeatRenewal } from "@/lib/sharing-financials";
import { formatDateOnlyMonthDay } from "@/lib/time/date-only";
import { cn } from "@/lib/utils";
import { ArrowRight, Users } from "lucide-react";
import { CalendarAccountIdentity } from "@/components/calendar-account-identity";
import { subscriptionPlatformName } from "@/lib/subscription-platform";

interface SharingUpcomingRenewalsProps {
  items: readonly SharingUpcomingSeatRenewal[];
  pending?: boolean;
  limit?: number;
  showFooter?: boolean;
  /** 仪表盘卡片使用紧凑密度；弹窗保留默认密度。 */
  density?: "default" | "compact";
}

export function SharingUpcomingRenewals({ items, pending = false, limit = 5, showFooter = true, density = "default" }: SharingUpcomingRenewalsProps) {
  const { t, locale, formatCurrency } = useI18n();
  const visibleItems = items.slice(0, limit);
  const compact = density === "compact";

  if (pending) {
    return (
      <div className="grid gap-3" aria-label={t("common.loading")}>
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-18 animate-pulse rounded-lg bg-secondary" />
        ))}
      </div>
    );
  }

  if (visibleItems.length === 0) {
    return (
      <p className="flex min-h-40 flex-1 items-center justify-center py-4 text-center text-sm leading-6 text-muted-foreground">
        {t("sharing.upcomingDialogEmpty")}
      </p>
    );
  }

  return (
    <div className="min-w-0 divide-y divide-border">
      {visibleItems.map(({ account, seat, daysUntilExpiry }) => (
        <div
          key={seat.id}
          className={cn(
            "grid min-h-14 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center first:pt-0 last:pb-0 sm:grid-cols-[minmax(8rem,1fr)_7rem_6rem]",
            "gap-x-3 gap-y-2 py-2.5",
            daysUntilExpiry < 0
              ? "text-destructive"
              : daysUntilExpiry <= 3 && "text-warning",
          )}
        >
          <div className="min-w-0">
            <CalendarAccountIdentity
              platformName={subscriptionPlatformName(account.subscription)}
              logo={account.subscription.logo ?? undefined}
              accountNumber={account.accountNumber}
              size="sm"
            />
            {compact ? (
              <p className="mt-0.5 truncate pl-6.5 text-xs text-muted-foreground">
                <span>{seat.memberName}</span><span aria-hidden="true"> · </span><span>{t("sharing.seatNumber")} #{seat.seatNumber} · {t("upcoming.expiresOn", { date: formatDateOnlyMonthDay(seat.expiresAt!, locale) })}</span>
              </p>
            ) : (
              <>
                <p className="mt-1 truncate pl-11 text-xs text-foreground">{seat.memberName}</p>
                <p className="truncate pl-11 text-xs text-muted-foreground">
                  {t("sharing.seatNumber")} #{seat.seatNumber} · {t("upcoming.expiresOn", { date: formatDateOnlyMonthDay(seat.expiresAt!, locale) })}
                </p>
              </>
            )}
          </div>
          <div className="order-3 col-span-2 min-w-0 rounded-md bg-muted/30 px-2 py-1.5 text-right sm:order-0 sm:col-span-1 sm:bg-transparent sm:p-0">
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">{t("subscription.field.price")}</p>
              <p className="mt-0.5 truncate whitespace-nowrap text-right text-sm font-semibold tabular-nums text-foreground">
                {seat.currentReceivable && seat.currency
                  ? formatCurrency(seat.currentReceivable.amount, seat.currentReceivable.currency)
                  : seat.monthlyPrice && seat.currency
                    ? formatCurrency(Number(seat.monthlyPrice) * (seat.billingMonths ?? 1), seat.currency)
                    : "-"}
              </p>
            </div>
          </div>
          <div className="flex min-w-24 flex-col items-end gap-1">
            <span className={cn("whitespace-nowrap text-xs font-semibold tabular-nums", daysUntilExpiry < 0 ? "text-destructive" : daysUntilExpiry <= 3 ? "text-warning" : "text-muted-foreground")}>
              {daysUntilExpiry < 0
                ? t("subscription.card.expiredDays", { days: Math.abs(daysUntilExpiry) })
                : daysUntilExpiry === 0
                  ? t("upcoming.todayShort")
                  : t("upcoming.daysShort", { days: daysUntilExpiry })}
            </span>
            <Button asChild type="button" variant="outline" size="sm" className="shrink-0 gap-1.5">
              <Link href="/sharing"><Users className="h-4 w-4" />{t("sharing.manageAccount")}</Link>
            </Button>
          </div>
        </div>
      ))}
      {showFooter ? <div className="flex justify-end">
        <Link href="/sharing">
          <Button variant="ghost" size="sm" className="min-h-11 gap-2 text-muted-foreground hover:text-foreground">
            <Users className="h-4 w-4" />
            {t("dashboard.viewAll", { count: items.length })}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div> : null}
    </div>
  );
}
