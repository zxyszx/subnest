import { useMemo, useState } from "react";
import { addMonths, eachDayOfInterval, format, isSameMonth, isToday, setMonth, setYear, subMonths, subWeeks, subYears } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { SharingAccountDetail } from "@renewlet/shared/schemas/sharing";
import type { SubscriptionCollectionItem } from "@/types/subscription";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { formatCompactCurrencyAmount } from "@/lib/currency";
import { assertDateOnly, compareDateOnly, dateOnlyToLocalDate, type DateOnly } from "@/lib/time/date-only";
import { getSubscriptionCalendarRange } from "@/modules/subscriptions/domain/subscription-calendar-range";
import { isOneTimeBuyout } from "@/lib/subscription-billing";
import { addBillingCycles } from "@renewlet/shared/subscription-renewal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  items: Array<{ id: string; label: string; amount: number; kind: "spend" | "income" }>;
}

function createEmptyDay(): DayFinancials {
  return {
    subscriptionCount: 0,
    subscriptionSpend: 0,
    memberCount: 0,
    memberIncome: 0,
    items: [],
  };
}

const MAX_PROJECTED_OCCURRENCES = 500;

function subtractBillingCycle(date: DateOnly, cycle: SubscriptionCollectionItem["billingCycle"], customDays?: number | null, customCycleUnit?: SubscriptionCollectionItem["customCycleUnit"]): DateOnly {
  if (cycle === "weekly") return format(subWeeks(dateOnlyToLocalDate(date), 1), "yyyy-MM-dd") as DateOnly;
  if (cycle === "monthly") return format(subMonths(dateOnlyToLocalDate(date), 1), "yyyy-MM-dd") as DateOnly;
  if (cycle === "quarterly") return format(subMonths(dateOnlyToLocalDate(date), 3), "yyyy-MM-dd") as DateOnly;
  if (cycle === "semi-annual") return format(subMonths(dateOnlyToLocalDate(date), 6), "yyyy-MM-dd") as DateOnly;
  if (cycle === "annual") return format(subYears(dateOnlyToLocalDate(date), 1), "yyyy-MM-dd") as DateOnly;
  if (cycle === "custom" && customDays && customDays > 0) {
    const days = customCycleUnit === "week" ? customDays * 7 : customCycleUnit === "month" ? customDays * 30 : customDays;
    return format(new Date(dateOnlyToLocalDate(date).getTime() - days * 86400000), "yyyy-MM-dd") as DateOnly;
  }
  return date;
}

export function DashboardRenewalCalendar({ subscriptions, sharingDetails, today, defaultCurrency, convert }: DashboardRenewalCalendarProps) {
  const { t, formatCurrency, formatDateTime, locale } = useI18n();
  const [currentMonth, setCurrentMonth] = useState(() => dateOnlyToLocalDate(today));
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [yearRangeStart, setYearRangeStart] = useState(() => dateOnlyToLocalDate(today).getFullYear() - 5);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
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
    const getDay = (date: string) => values.get(date) ?? createEmptyDay();

    const addSubscriptionOccurrence = (subscription: SubscriptionCollectionItem, date: string) => {
      const day = getDay(date);
      const amount = convert(subscription.price, subscription.currency, defaultCurrency);
      day.subscriptionCount += 1;
      day.subscriptionSpend += amount;
      day.items.push({ id: `subscription:${subscription.id}:${date}`, label: subscription.platformName || subscription.name, amount, kind: "spend" });
      values.set(date, day);
    };

    subscriptions.forEach((subscription) => {
      if (subscription.status === "paused" || subscription.status === "cancelled" || isOneTimeBuyout(subscription)) return;
      let dueDate = subscription.nextBillingDate;
      // 以保存的下一次续费日为锚点向前补齐可见范围，切换到历史月份时金额仍能落在正确日期。
      const previousDates: DateOnly[] = [];
      let previousDate = subtractBillingCycle(dueDate, subscription.billingCycle, subscription.customDays, subscription.customCycleUnit);
      for (let occurrence = 0; compareDateOnly(previousDate, range.from) >= 0 && occurrence < MAX_PROJECTED_OCCURRENCES; occurrence += 1) {
        previousDates.push(previousDate);
        const nextPreviousDate = subtractBillingCycle(previousDate, subscription.billingCycle, subscription.customDays, subscription.customCycleUnit);
        if (compareDateOnly(nextPreviousDate, previousDate) >= 0) break;
        previousDate = nextPreviousDate;
      }
      previousDates.reverse().forEach((date) => addSubscriptionOccurrence(subscription, date));
      for (let occurrence = 0; compareDateOnly(dueDate, range.to) <= 0 && occurrence < MAX_PROJECTED_OCCURRENCES; occurrence += 1) {
        if (compareDateOnly(dueDate, range.from) >= 0) addSubscriptionOccurrence(subscription, dueDate);
        const nextDate = addBillingCycles(dueDate, subscription.billingCycle, 1, subscription.customDays, subscription.customCycleUnit);
        if (compareDateOnly(nextDate, dueDate) <= 0) break;
        dueDate = nextDate;
      }
    });

    sharingDetails.forEach((detail) => detail.seats.forEach((seat) => {
      if (!seat.expiresAt || !seat.memberName || !seat.currency || seat.status !== "active") return;
      const periodAmount = seat.currentReceivable
        ? Number(seat.currentReceivable.amount)
        : Number(seat.monthlyPrice ?? 0) * (seat.billingMonths ?? 1);
      const amount = convert(periodAmount, seat.currency, defaultCurrency);
      let dueDate = assertDateOnly(seat.expiresAt);
      const months = Math.max(1, seat.billingMonths ?? 1);
      const addSeatOccurrence = (date: DateOnly) => {
        const day = getDay(date);
        day.memberCount += 1;
        day.memberIncome += amount;
        day.items.push({ id: `seat:${seat.id}:${date}`, label: seat.memberName!, amount, kind: "income" });
        values.set(date, day);
      };
      const previousDates: DateOnly[] = [];
      let previousDate = format(subMonths(dateOnlyToLocalDate(dueDate), months), "yyyy-MM-dd") as DateOnly;
      for (
        let occurrence = 0;
        compareDateOnly(previousDate, range.from) >= 0
          && (!seat.startDate || compareDateOnly(previousDate, seat.startDate) >= 0)
          && occurrence < MAX_PROJECTED_OCCURRENCES;
        occurrence += 1
      ) {
        previousDates.push(previousDate);
        const nextPreviousDate = format(subMonths(dateOnlyToLocalDate(previousDate), months), "yyyy-MM-dd") as DateOnly;
        if (compareDateOnly(nextPreviousDate, previousDate) >= 0) break;
        previousDate = nextPreviousDate;
      }
      previousDates.reverse().forEach(addSeatOccurrence);
      for (let occurrence = 0; compareDateOnly(dueDate, range.to) <= 0 && occurrence < MAX_PROJECTED_OCCURRENCES; occurrence += 1) {
        if (compareDateOnly(dueDate, range.from) >= 0) addSeatOccurrence(dueDate);
        dueDate = format(addMonths(dateOnlyToLocalDate(dueDate), months), "yyyy-MM-dd") as DateOnly;
      }
    }));

    return values;
  }, [convert, defaultCurrency, range.from, range.to, sharingDetails, subscriptions]);

  const monthlyFinancials = useMemo(() => {
    const monthPrefix = format(currentMonth, "yyyy-MM-");
    let subscriptionSpend = 0;
    let memberIncome = 0;

    financialsByDate.forEach((financials, date) => {
      if (!date.startsWith(monthPrefix)) return;
      subscriptionSpend += financials.subscriptionSpend;
      memberIncome += financials.memberIncome;
    });

    return {
      subscriptionSpend,
      memberIncome,
      netProfit: memberIncome - subscriptionSpend,
    };
  }, [currentMonth, financialsByDate]);

  const monthlySummary = [
    {
      testId: "dashboard-calendar-monthly-spend",
      label: t("dashboard.calendarMonthlySpend"),
      value: monthlyFinancials.subscriptionSpend,
      valueClassName: "text-destructive",
    },
    {
      testId: "dashboard-calendar-monthly-income",
      label: t("dashboard.calendarMonthlyIncome"),
      value: monthlyFinancials.memberIncome,
      valueClassName: "text-emerald-600 dark:text-emerald-400",
    },
    {
      testId: "dashboard-calendar-monthly-profit",
      label: t("dashboard.calendarMonthlyProfit"),
      value: monthlyFinancials.netProfit,
      valueClassName: monthlyFinancials.netProfit >= 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-destructive",
    },
  ] as const;

  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-card sm:p-4" aria-labelledby="dashboard-calendar-title">
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
        <h2 id="dashboard-calendar-title" className="col-span-2 flex min-w-0 items-center gap-2 text-base font-semibold text-foreground sm:col-span-1 sm:col-start-1 sm:row-start-1 sm:text-lg">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
          <span className="truncate">{t("dashboard.renewalCalendar")}</span>
        </h2>
        <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:gap-2">
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

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-muted/35">
          {weekdayLabels.map((label) => <div key={label} className="py-1.5 text-center text-xs font-semibold text-muted-foreground">{label}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border">
          {calendarDays.map((day) => {
            const date = format(day, "yyyy-MM-dd");
            const financials = financialsByDate.get(date) ?? createEmptyDay();
            const belongsToMonth = isSameMonth(day, currentMonth);
            const hasActivity = belongsToMonth && (financials.subscriptionCount > 0 || financials.memberCount > 0);
            const spendLabel = financials.subscriptionCount > 0
              ? formatCompactCurrencyAmount(financials.subscriptionSpend, defaultCurrency, locale)
              : "";
            const incomeLabel = financials.memberCount > 0
              ? formatCompactCurrencyAmount(financials.memberIncome, defaultCurrency, locale)
              : "";
            return (
              <button
                type="button"
                key={date}
                className={cn(
                  "min-h-12 min-w-0 overflow-hidden bg-card px-1.5 py-1 text-center transition-colors hover:bg-muted/45 sm:px-2",
                  !belongsToMonth && "pointer-events-none bg-muted/45 text-muted-foreground/50",
                )}
                disabled={!belongsToMonth}
                onClick={() => setSelectedDate(date)}
              >
                <div className="flex justify-center">
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold tabular-nums", isToday(day) && "bg-primary text-primary-foreground")}>{format(day, "d")}</span>
                </div>
                {hasActivity ? (
                  <div className="mt-1 grid min-w-0 grid-cols-2 gap-1 overflow-hidden text-[9px] font-semibold leading-3 sm:text-[11px]">
                    <span className="min-w-0 truncate text-left tabular-nums text-destructive" title={financials.subscriptionCount > 0 ? t("dashboard.calendarSpend", { amount: formatCurrency(financials.subscriptionSpend, defaultCurrency) }) : undefined}>{spendLabel ? `-${spendLabel}` : ""}</span>
                    <span className="min-w-0 truncate text-right tabular-nums text-emerald-600 dark:text-emerald-400" title={financials.memberCount > 0 ? t("dashboard.calendarIncome", { amount: formatCurrency(financials.memberIncome, defaultCurrency) }) : undefined}>{incomeLabel ? `+${incomeLabel}` : ""}</span>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 divide-x divide-border border-t border-border pt-2">
        {monthlySummary.map((item) => (
          <div key={item.testId} data-testid={item.testId} className="min-w-0 px-2 first:pl-0 last:pr-0 sm:px-3">
            <p className="truncate text-[10px] text-muted-foreground sm:text-xs">{item.label}</p>
            <p
              className={cn("mt-0.5 truncate text-xs font-semibold tabular-nums sm:text-sm", item.valueClassName)}
              title={formatCurrency(item.value, defaultCurrency)}
            >
              {formatCompactCurrencyAmount(item.value, defaultCurrency, locale)}
            </p>
          </div>
        ))}
      </div>
      <Dialog open={selectedDate !== null} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedDate ? formatDateTime(dateOnlyToLocalDate(selectedDate as DateOnly), { year: "numeric", month: "long", day: "numeric" }) : ""}</DialogTitle>
            <DialogDescription>{t("dashboard.renewalCalendarDescription")}</DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border rounded-lg border border-border">
            {(selectedDate ? financialsByDate.get(selectedDate)?.items ?? [] : []).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-4 px-3 py-3 text-sm">
                <span className="min-w-0 truncate font-medium text-foreground">{item.label}</span>
                <span className={cn("shrink-0 font-semibold tabular-nums", item.kind === "spend" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                  {item.kind === "spend" ? "-" : "+"}{formatCompactCurrencyAmount(item.amount, defaultCurrency, locale)}
                </span>
              </div>
            ))}
            {selectedDate && (financialsByDate.get(selectedDate)?.items.length ?? 0) === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("sharing.upcomingDialogEmpty")}</p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
