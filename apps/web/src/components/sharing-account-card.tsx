import { ChevronRight, Link2, UsersRound } from "lucide-react";
import type { SharingAccount } from "@renewlet/shared/schemas/sharing";
import { SubscriptionLogo } from "@/components/subscription-logo";
import { SharingSeatOccupancy, type SharingSeatTone } from "@/components/sharing-seat-occupancy";
import type { SharingSeatDisplayState } from "@/lib/sharing-seat-state";
import { subscriptionPlatformName } from "@/lib/subscription-platform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

/** One account surface across phone, tablet and desktop; management always starts with seats. */
export function SharingAccountCard({ account, nearest, seatStates, seatTones, vacancy, sharingReady, subscriptionExpiryDays, onManage, onDetails, onLinks, onCopyAccount }: {
  account: SharingAccount;
  nearest: { expiresAt: string; daysUntilExpiry: number } | null;
  seatStates: SharingSeatDisplayState[];
  seatTones: SharingSeatTone[];
  vacancy: boolean;
  sharingReady: boolean;
  subscriptionExpiryDays: number | null;
  onManage: () => void;
  onDetails: () => void;
  onLinks: () => void;
  onCopyAccount: () => void;
}) {
  const { t, formatDateOnly } = useI18n();
  const platform = subscriptionPlatformName(account.subscription);
  const name = account.subscription.name.trim() || platform;
  const outstanding = Number(account.outstandingAmount) > 0;
  const overdue = nearest !== null && nearest.daysUntilExpiry < 0;
  const expiring = nearest !== null && nearest.daysUntilExpiry >= 0 && nearest.daysUntilExpiry <= 7;
  const health = overdue ? t("sharing.hasOverdue") : outstanding ? t("sharing.hasOutstanding") : expiring ? t("sharing.expiringWithinSevenDays") : vacancy ? t("sharing.hasVacancies") : t("sharing.accountFull");
  return (
    <article data-testid="sharing-mobile-account" className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/30 sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <button type="button" className="relative grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("sharing.accountDetails")} onClick={onDetails}>
          <SubscriptionLogo name={platform} logo={account.subscription.logo ?? undefined} size="md" />
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-card bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{account.accountNumber}</span>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold" title={name}>{name}</h2>
          {platform !== name ? <p className="mt-0.5 text-xs text-muted-foreground">{platform}</p> : null}
          {subscriptionExpiryDays !== null && subscriptionExpiryDays < 0 ? <p className="mt-1 text-xs text-destructive">{t("sharing.subscriptionExpired", { days: Math.abs(subscriptionExpiryDays) })}</p> : null}
          <button type="button" title={t("sharing.copyAccount")} className="block min-h-11 max-w-full truncate text-left text-xs text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring" onClick={onCopyAccount}>{account.loginAccount}</button>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full" aria-label={t("sharing.accountDetails")} onClick={onDetails}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="my-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-muted-foreground"><UsersRound className="h-4 w-4" />{t("sharing.seats")}</span>
        <Badge variant="outline" className={cn("max-w-full text-xs", (outstanding || overdue) ? "border-destructive/20 bg-destructive/5 text-destructive" : expiring ? "border-warning/30 bg-warning/10 text-foreground" : vacancy ? "border-primary/20 bg-primary/5 text-primary" : "text-muted-foreground")}>{health}</Badge>
      </div>
      <SharingSeatOccupancy occupied={account.occupiedSeats} capacity={account.capacity} seatStates={seatStates} seatTones={seatTones} />
      <div className="mt-3 flex min-h-10 flex-wrap items-center justify-between gap-1 border-t border-border/60 pt-3 text-xs">
        <span className="text-muted-foreground">{t("sharing.nearestExpiry")}</span>
        <span className={cn("font-medium tabular-nums", overdue && "text-destructive")}>{nearest ? formatDateOnly(nearest.expiresAt) : t("sharing.noMember")}</span>
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
        <Button type="button" className="min-h-11" onClick={onManage}><UsersRound className="h-4 w-4" />{t("sharing.manageAccount")}</Button>
        <Button type="button" variant="outline" className="min-h-11" title={!sharingReady ? t("sharing.configureGenericMailbox") : undefined} onClick={onLinks}><Link2 className="h-4 w-4" />{t("sharing.viewLinks")}</Button>
      </div>
      {!sharingReady ? <span className="sr-only">{t("sharing.configureGenericMailbox")}</span> : null}
    </article>
  );
}
