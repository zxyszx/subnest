import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartNoAxesCombined } from "lucide-react";
import type { ForecastMonth } from "@/modules/subscriptions/domain/operations-overview";
import { useI18n } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/button";
import { RechartsFrame } from "@/components/recharts-frame";

export function RevenueChart({
  data,
  currency,
  pending,
}: {
  data: ForecastMonth[];
  currency: string;
  pending: boolean;
}) {
  const { t, formatCurrency } = useI18n();
  const [months, setMonths] = useState(12);
  return (
    <section className="min-w-0" aria-labelledby="dashboard-trend-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="dashboard-trend-heading"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <ChartNoAxesCombined className="h-4 w-4 text-primary" />
          {t("dashboard.trend")}
        </h2>
        <div className="flex gap-1" aria-label={t("dashboard.trend")}>
          {[6, 12].map((count) => (
            <Button
              key={count}
              variant={months === count ? "secondary" : "ghost"}
              size="sm"
              className="h-9 px-2 text-xs"
              aria-pressed={months === count}
              onClick={() => setMonths(count)}
            >
              {t("dashboard.forecastRange", { count })}
            </Button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {t("dashboard.forecastHint")}
      </p>
      {pending ? (
        <div
          className="mt-5 flex h-64 items-center justify-center text-sm text-muted-foreground"
          role="status"
        >
          {t("common.loading")}
        </div>
      ) : (
        <>
          <RechartsFrame height={256} className="mt-5" testId="dashboard-revenue-chart">
              <LineChart
                data={data.slice(0, months)}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={(value: string) => value.slice(5)}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  width={54}
                  tickFormatter={(value: number) =>
                    new Intl.NumberFormat(undefined, {
                      notation: "compact",
                    }).format(value)
                  }
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value), currency)}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    color: "hsl(var(--foreground))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={7}
                  wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name={t("dashboard.revenue")}
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  name={t("dashboard.cost")}
                  stroke="#f43f5e"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  name={t("dashboard.profit")}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
          </RechartsFrame>
          <details className="mt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer py-2">
              {t("statistics.trendDetailsTitle", { month: "" })}
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>{t("dashboard.month")}</th>
                    <th>{t("dashboard.revenue")}</th>
                    <th>{t("dashboard.cost")}</th>
                    <th>{t("dashboard.profit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, months).map((item) => (
                    <tr key={item.month}>
                      <td className="py-2">{item.month}</td>
                      <td>{formatCurrency(item.revenue, currency)}</td>
                      <td>{formatCurrency(item.cost, currency)}</td>
                      <td>{formatCurrency(item.profit, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
