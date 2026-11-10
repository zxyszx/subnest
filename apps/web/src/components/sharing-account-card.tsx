import { ChevronRight, UsersRound } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import type { SharingAccount } from "@renewlet/shared/schemas/sharing";
import { SubscriptionLogo } from "@/components/subscription-logo";
import { SharingSeatOccupancy, type SharingSeatTone } from "@/components/sharing-seat-occupancy";
import type { SharingSeatDisplayState } from "@/lib/sharing-seat-state";
import { subscriptionPlatformName } from "@/lib/subscription-platform";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/** One account surface across phone, tablet and desktop; management always starts with seats. */
export function SharingAccountCard({ account, nearest, seatStates, seatTones, vacancy, subscriptionExpiryDays, onDetails }: {
  account: SharingAccount;
  nearest: { expiresAt: string; daysUntilExpiry: number } | null;
  seatStates: SharingSeatDisplayState[];
  seatTones: SharingSeatTone[];
  vacancy: boolean;
  subscriptionExpiryDays: number | null;
  onDetails: () => void;
}) {
  const { t, formatDateOnly } = useI18n();
  const platform = subscriptionPlatformName(account.subscription);
  const name = account.subscription.name.trim() || platform;
  const outstanding = Number(account.outstandingAmount) > 0;
  const overdue = nearest !== null && nearest.daysUntilExpiry < 0;
  const expiring = nearest !== null && nearest.daysUntilExpiry >= 0 && nearest.daysUntilExpiry <= 7;
  const available = Math.max(0, account.capacity - account.occupiedSeats);
  const health = overdue ? t("sharing.hasOverdue") : outstanding ? t("sharing.hasOutstanding") : expiring ? t("sharing.expiringWithinSevenDays") : vacancy ? t("sharing.vacantSeatsCount", { count: available }) : t("sharing.accountFull");
  return (
    <article data-testid="sharing-mobile-account" className="relative flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/30">
      <button type="button" className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${t("sharing.accountDetails")} · ${name} #${account.accountNumber}`} onClick={onDetails} />
      <div className="pointer-events-none flex min-h-16 min-w-0 items-start gap-3 md:min-h-22">
        <div className="relative grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl">
          <SubscriptionLogo name={platform} logo={account.subscription.logo ?? undefined} size="md" />
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-card bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{account.accountNumber}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold" title={name}>{name}</h2>
          {platform !== name ? <p className="mt-0.5 text-xs text-muted-foreground">{platform}</p> : null}
          {subscriptionExpiryDays !== null && subscriptionExpiryDays < 0 ? <p className="mt-1 text-xs text-destructive">{t("sharing.subscriptionExpired", { days: Math.abs(subscriptionExpiryDays) })}</p> : null}
          <CopyButton value={account.loginAccount} label={`${t("sharing.copyAccount")} · ${account.loginAccount}`} className="pointer-events-auto relative z-10 max-w-full justify-start px-0 text-left text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-primary"><span className="min-w-0 truncate">{account.loginAccount}</span></CopyButton>
        </div>
        <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      <div data-testid="sharing-card-seats" className="pointer-events-none mb-2 mt-1 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-muted-foreground"><UsersRound className="h-4 w-4" />{t("sharing.seats")} <strong className="font-semibold tabular-nums text-foreground">{account.occupiedSeats}/{account.capacity}</strong></span>
        <Badge variant="outline" className={cn("max-w-full text-xs", (outstanding || overdue) ? "border-destructive/20 bg-destructive/5 text-destructive" : expiring ? "border-warning/30 bg-warning/10 text-foreground" : vacancy ? "border-primary/20 bg-primary/5 text-primary" : "text-muted-foreground")}>{health}</Badge>
      </div>
      <div className="pointer-events-none"><SharingSeatOccupancy occupied={account.occupiedSeats} capacity={account.capacity} seatStates={seatStates} seatTones={seatTones} showCount={false} showStateSummary={false} /></div>
      {available > 0 && (overdue || outstanding || expiring) ? <p className="mt-2 text-xs font-semibold text-primary">{t("sharing.vacantSeatsCount", { count: available })}</p> : null}
      <div className="pointer-events-none mt-2 flex min-h-8 flex-wrap items-center justify-between gap-1 text-xs">
        <span className="text-muted-foreground">{t("sharing.nearestExpiry")}</span>
        <span className={cn("font-medium tabular-nums", overdue && "text-destructive")} title={nearest ? formatDateOnly(nearest.expiresAt) : undefined}>{nearest ? <>{nearest.daysUntilExpiry < 0 ? t("subscription.card.expiredDays", { days: Math.abs(nearest.daysUntilExpiry) }) : nearest.daysUntilExpiry === 0 ? t("upcoming.todayShort") : t("upcoming.daysShort", { days: nearest.daysUntilExpiry })} · {formatDateOnly(nearest.expiresAt)}</> : t("sharing.noMember")}</span>
      </div>

    </article>
  );
}
