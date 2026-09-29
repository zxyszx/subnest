import { useMemo, useState } from "react";
import { addMonths, eachDayOfInterval, format, isSameMonth, isToday, setMonth, setYear, subMonths } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { SharingAccountDetail } from "@renewlet/shared/schemas/sharing";
import type { SubscriptionCollectionItem } from "@/types/subscription";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { dateOnlyToLocalDate, type DateOnly } from "@/lib/time/date-only";
import { getSubscriptionCalendarRange } from "@/modules/subscriptions/domain/subscription-calendar-range";
import { isOneTimeBuyout } from "@/lib/subscription-billing";

type CurrencyConvert = (amount: number | string, fromCurrency: string, toCurrency: string) => number;

interface DashboardRenewalCalendarProps {
  subscriptions: readonly SubscriptionCollectionItem[];
  sharingDetails: readonly SharingAccountDetail[];
  today: DateOnly;
  defaultCurrency: string;
  convert: CurrencyConvert;
}

interface DayFinancials {
  subscriptionCount: number;
  subscriptionSpend: number;
  memberCount: number;
  memberIncome: number;
}

const EMPTY_DAY: DayFinancials = {
  subscriptionCount: 0,
  subscriptionSpend: 0,
  memberCount: 0,
  memberIncome: 0,
};

export function DashboardRenewalCalendar({ subscriptions, sharingDetails, today, defaultCurrency, convert }: DashboardRenewalCalendarProps) {
  const { t, formatCurrency, formatDateTime } = useI18n();
  const [currentMonth, setCurrentMonth] = useState(() => dateOnlyToLocalDate(today));
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [yearRangeStart, setYearRangeStart] = useState(() => dateOnlyToLocalDate(today).getFullYear() - 5);
  const range = useMemo(() => getSubscriptionCalendarRange(currentMonth), [currentMonth]);
  const calendarDays = useMemo(() => eachDayOfInterval({
    start: dateOnlyToLocalDate(range.from),
    end: dateOnlyToLocalDate(range.to),
  }), [range.from, range.to]);
  const weekdayLabels = useMemo(() => Array.from({ length: 7 }, (_, index) => (
    formatDateTime(new Date(2024, 0, index + 1), { weekday: "short" })
  )), [formatDateTime]);
  const monthLabels = useMemo(() => Array.from({ length: 12 }, (_, index) => (
    formatDateTime(new Date(2024, index, 1), { month: "short" })
  )), [formatDateTime]);

  const financialsByDate = useMemo(() => {
    const values = new Map<string, DayFinancials>();
    const getDay = (date: string) => values.get(date) ?? { ...EMPTY_DAY };

    subscriptions.forEach((subscription) => {
      if (subscription.status === "paused" || subscription.status === "cancelled" || isOneTimeBuyout(subscription)) return;
      const day = getDay(subscription.nextBillingDate);
      day.subscriptionCount += 1;
      day.subscriptionSpend += convert(subscription.price, subscription.currency, defaultCurrency);
      values.set(subscription.nextBillingDate, day);
    });

    sharingDetails.forEach((detail) => detail.seats.forEach((seat) => {
      if (!seat.expiresAt || !seat.memberName || !seat.currency || seat.status !== "active") return;
      const day = getDay(seat.expiresAt);
      const periodAmount = seat.currentReceivable
        ? Number(seat.currentReceivable.amount)
        : Number(seat.monthlyPrice ?? 0) * (seat.billingMonths ?? 1);
      day.memberCount += 1;
      day.memberIncome += convert(periodAmount, seat.currency, defaultCurrency);
      values.set(seat.expiresAt, day);
    }));

    return values;
  }, [convert, defaultCurrency, sharingDetails, subscriptions]);

  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-card sm:p-4" aria-labelledby="dashboard-calendar-title">
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5">
        <h2 id="dashboard-calendar-title" className="flex min-w-0 items-center gap-2 text-base font-semibold text-foreground sm:text-lg">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
          <span className="truncate">{t("dashboard.renewalCalendar")}</span>
        </h2>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8" aria-label={t("calendar.previousMonth")} onClick={() => setCurrentMonth((month) => subMonths(month, 1))}><ChevronLeft /></Button>
          <Popover
            open={monthPickerOpen}
            onOpenChange={(open) => {
              setMonthPickerOpen(open);
              setYearPickerOpen(false);
              if (open) setYearRangeStart(currentMonth.getFullYear() - 5);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-11 min-w-28 gap-2 px-2 text-xs font-semibold text-foreground sm:h-8 sm:min-w-32 sm:text-sm"
                aria-label={formatDateTime(currentMonth, { year: "numeric", month: "long" })}
              >
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                {formatDateTime(currentMonth, { year: "numeric", month: "long" })}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="center"
              className="w-72 border-border bg-popover p-3"
              mobileTitle={t("dashboard.renewalCalendar")}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label={yearPickerOpen
                    ? formatDateTime(new Date(yearRangeStart - 12, 0, 1), { year: "numeric" })
                    : formatDateTime(setYear(currentMonth, currentMonth.getFullYear() - 1), { year: "numeric" })}
                  onClick={() => {
                    if (yearPickerOpen) setYearRangeStart((year) => year - 12);
                    else setCurrentMonth((month) => setYear(month, month.getFullYear() - 1));
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 min-w-24 text-sm font-semibold tabular-nums text-foreground"
                  aria-expanded={yearPickerOpen}
                  onClick={() => {
                    setYearRangeStart(currentMonth.getFullYear() - 5);
                    setYearPickerOpen((open) => !open);
                  }}
                >
                  {formatDateTime(currentMonth, { year: "numeric" })}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label={yearPickerOpen
                    ? formatDateTime(new Date(yearRangeStart + 12, 0, 1), { year: "numeric" })
                    : formatDateTime(setYear(currentMonth, currentMonth.getFullYear() + 1), { year: "numeric" })}
                  onClick={() => {
                    if (yearPickerOpen) setYearRangeStart((year) => year + 12);
                    else setCurrentMonth((month) => setYear(month, month.getFullYear() + 1));
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              {yearPickerOpen ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {Array.from({ length: 12 }, (_, index) => yearRangeStart + index).map((year) => {
                    const selected = year === currentMonth.getFullYear();
                    return (
                      <button
                        key={year}
                        type="button"
                        aria-pressed={selected}
                        className={cn(
                          "min-h-11 rounded-lg px-2 text-sm font-medium tabular-nums transition-colors sm:min-h-9",
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                        onClick={() => {
                          setCurrentMonth((month) => setYear(month, year));
                          setYearPickerOpen(false);
                        }}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {monthLabels.map((label, index) => {
                    const selected = index === currentMonth.getMonth();
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={selected}
                        className={cn(
                          "min-h-11 rounded-lg px-2 text-sm font-medium transition-colors sm:min-h-9",
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                        onClick={() => {
                          setCurrentMonth((month) => setMonth(month, index));
                          setMonthPickerOpen(false);
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3 w-full text-xs text-primary hover:text-primary"
                onClick={() => {
                  setCurrentMonth(dateOnlyToLocalDate(today));
                  setYearPickerOpen(false);
                  setMonthPickerOpen(false);
                }}
              >
                {t("common.today")}
              </Button>
            </PopoverContent>
          </Popover>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 sm:h-8 sm:w-8" aria-label={t("calendar.nextMonth")} onClick={() => setCurrentMonth((month) => addMonths(month, 1))}><ChevronRight /></Button>
        </div>
        <p className="col-span-2 truncate text-xs text-muted-foreground sm:text-sm">{t("dashboard.renewalCalendarDescription")}</p>
      </div>

      <div className="mb-0.5 grid grid-cols-7">
        {weekdayLabels.map((label) => <div key={label} className="py-0.5 text-center text-xs font-semibold text-muted-foreground">{label}</div>)}
      </div>
      <div className="grid grid-cols-7 overflow-hidden bg-card">
        {calendarDays.map((day) => {
          const date = format(day, "yyyy-MM-dd");
          const financials = financialsByDate.get(date) ?? EMPTY_DAY;
          const hasActivity = financials.subscriptionCount > 0 || financials.memberCount > 0;
          return (
            <div
              key={date}
              className={cn(
                "min-h-10 bg-card p-1 text-center sm:min-h-8 sm:p-1.5",
                !isSameMonth(day, currentMonth) && "bg-muted/20 text-muted-foreground/50",
              )}
            >
              <div className="flex justify-center">
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold tabular-nums", isToday(day) && "bg-primary text-primary-foreground")}>{format(day, "d")}</span>
              </div>
              {hasActivity ? (
                <div className="mt-1 grid grid-cols-2 gap-0.5 text-[10px] font-semibold leading-3 sm:text-xs">
                  <p className="min-w-0 truncate text-left text-destructive" title={financials.subscriptionCount > 0 ? t("dashboard.calendarSpend", { amount: formatCurrency(financials.subscriptionSpend, defaultCurrency) }) : undefined}>{financials.subscriptionCount > 0 ? `-${formatCurrency(financials.subscriptionSpend, defaultCurrency)}` : ""}</p>
                  <p className="min-w-0 truncate text-right text-emerald-600 dark:text-emerald-400" title={financials.memberCount > 0 ? t("dashboard.calendarIncome", { amount: formatCurrency(financials.memberIncome, defaultCurrency) }) : undefined}>{financials.memberCount > 0 ? `+${formatCurrency(financials.memberIncome, defaultCurrency)}` : ""}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
