import Link from "@/components/router-link";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import type { SharingUpcomingSeatRenewal } from "@/lib/sharing-financials";
import { formatDateOnlyMonthDay } from "@/lib/time/date-only";
import { cn } from "@/lib/utils";
import { ArrowRight, Users } from "lucide-react";

interface SharingUpcomingRenewalsProps {
  items: readonly SharingUpcomingSeatRenewal[];
  pending?: boolean;
  limit?: number;
}

export function SharingUpcomingRenewals({ items, pending = false, limit = 5 }: SharingUpcomingRenewalsProps) {
  const { t, locale, formatCurrency } = useI18n();
  const visibleItems = items.slice(0, limit);

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
      <p className="py-4 text-center text-sm leading-6 text-muted-foreground">
        {t("sharing.upcomingDialogEmpty")}
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {visibleItems.map(({ account, seat, daysUntilExpiry }) => (
        <div
          key={seat.id}
          className={cn(
            "grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_max-content] items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3",
            daysUntilExpiry < 0
              ? "border-destructive/30 bg-linear-to-br from-destructive/10 via-card to-card"
              : daysUntilExpiry <= 3 && "border-warning/30 bg-warning/5",
          )}
        >
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold tabular-nums",
              daysUntilExpiry < 0
                ? "bg-destructive/10 text-destructive"
                : daysUntilExpiry <= 3
                  ? "bg-warning/20 text-warning"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {daysUntilExpiry < 0
              ? t("subscription.card.expiredDays", { days: Math.abs(daysUntilExpiry) })
              : daysUntilExpiry === 0
                ? t("upcoming.todayShort")
                : t("upcoming.daysShort", { days: daysUntilExpiry })}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{seat.memberName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {account.subscription.platformName} #{account.accountNumber} · {t("sharing.seatNumber")} #{seat.seatNumber}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("upcoming.expiresOn", { date: formatDateOnlyMonthDay(seat.expiresAt!, locale) })}
            </p>
          </div>
          <p className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-foreground">
            {seat.monthlyPrice && seat.currency ? formatCurrency(seat.monthlyPrice, seat.currency) : "-"}
          </p>
        </div>
      ))}
      <div className="flex justify-end">
        <Link href="/sharing">
          <Button variant="ghost" size="sm" className="min-h-11 gap-2 text-muted-foreground hover:text-foreground">
            <Users className="h-4 w-4" />
            {t("dashboard.viewAll", { count: items.length })}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
