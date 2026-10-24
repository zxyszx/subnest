import {
  ArrowRight,
  CalendarClock,
  Clock,
  CircleDollarSign,
  PauseCircle,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import type { SharingAccount } from "@renewlet/shared/schemas/sharing";
import type { buildOperationsOverview } from "@/modules/subscriptions/domain/operations-overview";
import { SubscriptionLogo } from "@/components/subscription-logo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import Link from "@/components/router-link";
import { cn } from "@/lib/utils";
import { UNBOUND_PLATFORM_VALUE } from "@/lib/subscription-platform";

type Overview = ReturnType<typeof buildOperationsOverview>;

export function OperationsPanel({
  todayCount,
  upcomingCount,
  overdueCount,
  memberCount,
  onSubscriptions,
  onMembers,
}: {
  todayCount: number;
  upcomingCount: number;
  overdueCount: number;
  memberCount: number;
  onSubscriptions: (scope: "all" | "today" | "overdue") => void;
  onMembers: () => void;
}) {
  const { t } = useI18n();
  const tasks = [
    {
      label: t("dashboard.dueToday"),
      count: todayCount,
      icon: Clock,
      style: "border-destructive/20 bg-destructive/5 text-destructive",
      action: () => onSubscriptions("today"),
    },
    {
      label: t("dashboard.subscriptionRenewals"),
      count: upcomingCount,
      icon: CalendarClock,
      style: "border-warning/25 bg-warning/5 text-foreground",
      action: () => onSubscriptions("all"),
    },
    {
      label: t("dashboard.memberRenewals"),
      count: memberCount,
      icon: UsersRound,
      style: "border-primary/20 bg-primary/5 text-foreground",
      action: onMembers,
    },
    {
      label: t("dashboard.overdue"),
      count: overdueCount,
      icon: TriangleAlert,
      style: "border-destructive/20 bg-destructive/5 text-destructive",
      action: () => onSubscriptions("overdue"),
    },
  ];
  return (
    <section className="min-w-0">
      <h2 className="mb-4 text-sm font-semibold">
        {t("dashboard.operations")}
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tasks.map((task) => (
          <button
            key={task.label}
            type="button"
            onClick={task.action}
            className={cn(
              "flex min-h-24 items-center gap-3 rounded-2xl border p-3 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4",
              task.count > 0 ? task.style : "border-border bg-card text-muted-foreground",
            )}
          >
            <task.icon className="hidden h-5 w-5 shrink-0 sm:block" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs">{task.label}</span>
              <span className="mt-1 block text-xl font-semibold tabular-nums">
                {task.count}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </button>
        ))}
      </div>
    </section>
  );
}

export function PlatformPanel({
  overview,
  currency,
}: {
  overview: Overview;
  currency: string;
}) {
  const { t, formatCurrency } = useI18n();
  return (
    <section
      className="border-t border-border py-6"
      aria-labelledby="dashboard-platforms"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 id="dashboard-platforms" className="text-base font-semibold">
          {t("dashboard.platforms")}
        </h2>
        <Link
          href="/sharing"
          className="flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-primary"
        >
          {t("dashboard.allPlatforms")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {overview.platforms.slice(0, 5).map((platform) => (
          <Link
            key={platform.name}
            href={`/sharing?platform=${encodeURIComponent(platform.name || UNBOUND_PLATFORM_VALUE)}`}
            className="min-w-0 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-3">
              <SubscriptionLogo
                name={platform.name || t("subscription.platformUnbound")}
                logo={platform.logo}
                size="md"
              />
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">
                  {platform.name || t("subscription.platformUnbound")}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("dashboard.accounts", { count: platform.accounts })}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-between text-xs text-muted-foreground">
              <span>{t("dashboard.utilization")}</span>
              <span>
                {platform.capacity
                  ? Math.round((platform.occupied / platform.capacity) * 100)
                  : 0}
                %
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${platform.capacity ? Math.min(100, (platform.occupied / platform.capacity) * 100) : 0}%`,
                }}
              />
            </div>
            <dl className="mt-4 grid gap-2 text-xs">
              {[
                [t("dashboard.revenue"), platform.revenue],
                [t("dashboard.cost"), platform.cost],
                [t("dashboard.profit"), platform.profit],
              ].map(([label, value], index) => (
                <div
                  key={label}
                  className="flex flex-wrap justify-between gap-1"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd
                    className={cn(
                      "font-semibold tabular-nums",
                      index === 2 &&
                        (Number(value) >= 0
                          ? "text-primary"
                          : "text-destructive"),
                    )}
                  >
                    {formatCurrency(Number(value), currency)}
                  </dd>
                </div>
              ))}
            </dl>
          </Link>
        ))}
      </div>
      {overview.platforms.length === 0 && (
        <p className="py-6 text-sm text-muted-foreground">
          {t("dashboard.noPlatforms")}
        </p>
      )}
    </section>
  );
}

export function InsightPanels({
  overview,
  currency,
  stoppedSeats,
  onManage,
}: {
  overview: Overview;
  currency: string;
  stoppedSeats: number;
  onManage: (account: SharingAccount) => void;
}) {
  const { t, formatCurrency, formatDateTime } = useI18n();
  const reminders = [
    {
      label: t("dashboard.negativeProfit"),
      count: overview.negativeAccounts.length,
      icon: CircleDollarSign,
    },
    {
      label: t("dashboard.availableAccounts"),
      count: overview.vacantAccounts.length,
      icon: UsersRound,
    },
    {
      label: t("dashboard.pausedAccounts"),
      count: overview.pausedAccounts.length,
      icon: PauseCircle,
    },
    {
      label: t("dashboard.stopSeats"),
      count: stoppedSeats,
      icon: CalendarClock,
    },
  ];
  return (
    <div className="grid gap-6 border-t border-border py-6 lg:grid-cols-3">
      <section className="min-w-0">
        <h2 className="mb-4 text-sm font-semibold">{t("dashboard.ranking")}</h2>
        {overview.ranking.map(({ account, profit }, index) => (
          <Button
            key={account.id}
            variant="ghost"
            className="flex h-auto min-h-12 w-full justify-start gap-3 px-0"
            onClick={() => onManage(account)}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-xs">
              {index + 1}
            </span>
            <SubscriptionLogo
              name={account.name}
              logo={account.subscription.logo}
              size="xs"
            />
            <span className="min-w-0 flex-1 truncate text-left text-xs">
              {account.name} #{account.accountNumber}
            </span>
            <span
              className={cn(
                "text-xs tabular-nums",
                profit < 0 && "text-destructive",
              )}
            >
              {formatCurrency(profit, currency)}
            </span>
          </Button>
        ))}
        {overview.ranking.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            {t("dashboard.noPlatforms")}
          </p>
        )}
      </section>
      <section className="min-w-0">
        <h2 className="mb-4 text-sm font-semibold">{t("dashboard.risks")}</h2>
        <div className="grid gap-2">
          {reminders
            .filter((item) => item.count > 0)
            .map((item) => (
              <Link
                key={item.label}
                href="/sharing"
                className="flex min-h-12 items-center gap-3 rounded-md bg-amber-500/8 px-3 text-sm hover:bg-secondary"
              >
                <item.icon className="h-4 w-4 text-amber-600" />
                <span className="flex-1">{item.label}</span>
                <span className="font-semibold tabular-nums">{item.count}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ))}
        </div>
        {reminders.every((item) => item.count === 0) && (
          <p className="py-4 text-sm text-muted-foreground">
            {t("dashboard.noRisks")}
          </p>
        )}
      </section>
      <section className="min-w-0">
        <h2 className="mb-4 text-sm font-semibold">{t("dashboard.recent")}</h2>
        {overview.recent.map((account) => (
          <Button
            key={account.id}
            variant="ghost"
            className="h-auto min-h-12 w-full justify-start gap-3 px-0"
            onClick={() => onManage(account)}
          >
            <SubscriptionLogo
              name={account.name}
              logo={account.subscription.logo}
              size="xs"
            />
            <span className="min-w-0 flex-1 truncate text-left text-xs">
              {account.name} #{account.accountNumber}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {Number.isNaN(Date.parse(account.createdAt))
                ? ""
                : formatDateTime(new Date(account.createdAt), {
                    month: "2-digit",
                    day: "2-digit",
                  })}
            </span>
          </Button>
        ))}
        {overview.recent.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            {t("dashboard.noActivity")}
          </p>
        )}
      </section>
    </div>
  );
}
