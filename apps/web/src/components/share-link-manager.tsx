import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpDown, CalendarDays, CheckCircle2, ChevronRight, Copy, Link2, PowerOff, Search, Settings2, UsersRound } from "lucide-react";
import type { SharingAccount, SharingSeat } from "@renewlet/shared/schemas/sharing";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SubscriptionLogo } from "@/components/subscription-logo";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { sharingSeatDisplayState } from "@/lib/sharing-seat-state";
import { dateToDateOnly } from "@/lib/time/date-only";

export function ShareLinkManager({ account, seats, busy, onClose, children }: {
  account: SharingAccount;
  seats: SharingSeat[];
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const today = dateToDateOnly(new Date());
  const occupied = seats.filter((seat) => sharingSeatDisplayState(seat, today) === "active").length;
  const nearestExpiry = seats.map((seat) => seat.expiresAt).filter((value): value is string => value !== null && value >= today).sort()[0];
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-screen max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0">
      <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12 text-left sm:px-5 sm:py-4">
        <DialogTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-primary" />{t("sharing.inboxLinks")}</DialogTitle>
        <DialogDescription className="break-all">{account.loginAccount}</DialogDescription>
      </DialogHeader>
      <div data-seat-links-scroll className="h5-mobile-sheet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 touch-pan-y [-webkit-overflow-scrolling:touch] sm:px-5">
        <section className="mb-4 flex min-w-0 flex-wrap items-center gap-3 border-b border-border pb-4" aria-label={t("sharing.platformInformation")}>
          <SubscriptionLogo name={account.subscription.platformName} logo={account.subscription.logo ?? undefined} size="sm" />
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">{account.subscription.platformName} #{account.accountNumber}</p><p className="truncate text-xs text-muted-foreground">{account.name}</p></div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-muted px-2.5"><UsersRound className="h-3.5 w-3.5" />{t("sharing.seatCount", { count: seats.length })}</span>
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-muted px-2.5"><CheckCircle2 className="h-3.5 w-3.5" />{t("sharing.activeMemberCount", { count: occupied })}</span>
            {nearestExpiry ? <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-muted px-2.5"><CalendarDays className="h-3.5 w-3.5" />{t("sharing.nearestExpiry")} {nearestExpiry}</span> : null}
          </div>
        </section>
        {children}
      </div>
    </DialogContent>
  </Dialog>;
}

export function PublicShareCard({ href, onCopy, onDisable, disableLabel }: {
  href: string;
  onCopy: () => void;
  onDisable?: () => void;
  disableLabel?: string;
}) {
  const { t } = useI18n();
  return <section className="mb-4 border-y border-emerald-200 bg-emerald-50/70 px-3 py-3 dark:border-emerald-900 dark:bg-emerald-950/20 sm:rounded-md sm:border">
    <div className="mb-2 flex flex-wrap items-start justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-emerald-600" />{t("sharing.publicValidationLink")} <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{t("sharing.enabled")}</span></h3><p className="mt-1 text-xs text-muted-foreground">{t("sharing.publicValidationHelp")}</p></div></div>
    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><Input readOnly value={href} title={href} aria-label={t("sharing.publicValidationLink")} className="h-11 min-w-0 truncate bg-background font-mono text-xs" /><button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90" onClick={onCopy}><Copy className="h-4 w-4" />{t("sharing.copyInboxLink")}</button>{onDisable ? <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted" onClick={onDisable}><PowerOff className="h-4 w-4" />{disableLabel ?? t("sharing.closePublicShare")}</button> : null}</div>
  </section>;
}

export function ShareSettingsCollapse({ summary, children }: { summary: string; children: ReactNode }) {
  const { t } = useI18n();
  return <details className="group mb-4 overflow-hidden rounded-md border border-border bg-background">
    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden"><Settings2 className="h-4 w-4 shrink-0" /><span className="font-medium">{t("sharing.shareSettings")}</span><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{summary}</span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" /></summary>
    <div className="border-t border-border">{children}</div>
  </details>;
}

function avatarStyle(name: string) {
  const palette = ["bg-blue-100 text-blue-700", "bg-rose-100 text-rose-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-violet-100 text-violet-700"];
  const hash = [...name].reduce((value, char) => value + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

export function SeatAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return <span aria-hidden className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold", avatarStyle(name))}>{initial}</span>;
}

function remainingDays(expiresAt: string | null) {
  if (!expiresAt) return null;
  const end = new Date(`${expiresAt}T23:59:59`).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.ceil((end - Date.now()) / 86_400_000);
}

export function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const { t } = useI18n();
  const days = remainingDays(expiresAt);
  if (days === null) return <span className="text-xs text-muted-foreground">-</span>;
  const style = days <= 7 ? "bg-red-100 text-red-700" : days <= 30 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
  return <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-medium", style)}>{t(days < 0 ? "sharing.expiredDays" : "sharing.remainingDays", { days: Math.abs(days) })}</span>;
}

export type SeatLinkItem = {
  seat: SharingSeat;
  href: string;
  valid: boolean;
  statusText: string;
  fallbackText: string;
  actions: ReactNode;
};

export function ResponsiveSeatList({ items }: { items: SeatLinkItem[] }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"seat" | "expiry">("seat");
  const visible = useMemo(() => items.filter(({ seat }) => `${seat.seatNumber} ${seat.memberName ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => sort === "expiry" ? (a.seat.expiresAt ?? "9999").localeCompare(b.seat.expiresAt ?? "9999") : a.seat.seatNumber - b.seat.seatNumber), [items, query, sort]);
  return <section aria-labelledby="seat-link-list-title">
    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center"><h3 id="seat-link-list-title" className="mr-auto font-semibold">{t("sharing.seatListTitle", { count: items.length })}</h3><label className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("sharing.searchSeats")} className="h-10 pl-9 sm:w-56" /></label><button type="button" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm" onClick={() => setSort((value) => value === "seat" ? "expiry" : "seat")}><ArrowUpDown className="h-4 w-4" />{t(sort === "seat" ? "sharing.sortBySeat" : "sharing.sortByExpiry")}</button></div>
    <div data-seat-links-table className="hidden overflow-hidden rounded-md border md:block"><div className="grid grid-cols-[minmax(12rem,1.25fr)_minmax(12rem,1.5fr)_5rem_7rem_7rem_minmax(13rem,auto)] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground"><span>{t("sharing.seatMemberColumn")}</span><span>{t("sharing.linkColumn")}</span><span>{t("sharing.statusColumn")}</span><span>{t("sharing.expiryColumn")}</span><span>{t("sharing.remainingDaysColumn")}</span><span className="text-right">{t("sharing.operationColumn")}</span></div><div className="divide-y">{visible.map((item) => <SeatRow key={item.seat.id} item={item} />)}</div></div>
    <div data-seat-links-cards className="grid gap-3 md:hidden">{visible.map((item) => <SeatCard key={item.seat.id} item={item} />)}</div>
  </section>;
}

function SeatIdentity({ seat }: { seat: SharingSeat }) {
  const { t } = useI18n();
  const member = seat.memberName || t("sharing.totpVacant");
  return <div className="flex min-w-0 items-center gap-3"><SeatAvatar name={member} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{t("sharing.totpSeat", { number: seat.seatNumber, member })}</p><p className="truncate text-xs text-muted-foreground">{seat.startDate ? t("sharing.joinedAt", { date: seat.startDate }) : t("sharing.joinDateMissing")}</p></div></div>;
}

function SeatRow({ item }: { item: SeatLinkItem }) {
  return <div className="grid min-h-16 grid-cols-[minmax(12rem,1.25fr)_minmax(12rem,1.5fr)_5rem_7rem_7rem_minmax(13rem,auto)] items-center gap-3 px-3 py-2"><SeatIdentity seat={item.seat} /><p className="truncate rounded-md bg-muted/40 px-2.5 py-2 font-mono text-xs text-muted-foreground" title={item.href}>{item.href || item.fallbackText}</p><span className={item.valid ? "inline-flex items-center gap-1 text-xs font-medium text-emerald-600" : "text-xs text-muted-foreground"}>{item.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}{item.statusText}</span><span className="text-sm">{item.seat.expiresAt || "-"}</span><ExpiryBadge expiresAt={item.seat.expiresAt} /><div className="flex min-w-0 justify-end gap-1.5">{item.actions}</div></div>;
}

function SeatCard({ item }: { item: SeatLinkItem }) {
  const { t } = useI18n();
  return <article className="rounded-md border bg-background p-3"><div className="flex items-start justify-between gap-3"><SeatIdentity seat={item.seat} /><span className={item.valid ? "inline-flex items-center gap-1 text-xs font-medium text-emerald-600" : "text-xs text-muted-foreground"}>{item.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}{item.statusText}</span></div><dl className="mt-3 grid grid-cols-2 gap-2 border-y py-3 text-sm"><div><dt className="text-xs text-muted-foreground">{t("sharing.expiryColumn")}</dt><dd className="mt-1">{item.seat.expiresAt || "-"}</dd></div><div><dt className="text-xs text-muted-foreground">{t("sharing.remainingTime")}</dt><dd className="mt-1"><ExpiryBadge expiresAt={item.seat.expiresAt} /></dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">{t("sharing.linkColumn")}</dt><dd className="mt-1 truncate font-mono text-xs text-muted-foreground">{item.href || item.fallbackText}</dd></div></dl><div className="mt-3 flex min-h-11 flex-wrap justify-end gap-2">{item.actions}</div></article>;
}
