import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { useSubscriptionAnalytics } from "@/hooks/use-subscriptions";
import {
  useSharingAccounts,
  useSharingAccountDetails,
} from "@/hooks/use-sharing";
import { useSettings } from "@/hooks/use-settings";
import { useReportExchangeRates } from "@/hooks/use-report-exchange-rates";
import { useDashboardStats } from "@/modules/subscriptions/application/use-dashboard-stats";
import { useRouteReady } from "@/components/route-progress";
import { useZonedToday } from "@/hooks/use-zoned-today";
import {
  sharingMonthlyRevenue,
  sharingOutstandingAmount,
} from "@/lib/sharing-financials";
import { daysBetweenDateOnly } from "@/lib/time/date-only";
import { getEffectiveSubscriptionStatus, isEffectivelyActiveSubscription } from "@/modules/subscriptions/domain/subscription-status";
import { ExpenseCostCharts } from "./expense-cost-charts";
import { ExpenseServers } from "./expense-servers";
import { isRenewableService, renewalWindow, serviceProgress } from "./expense-service-model";
import { toSubscriptionMonthlyAmount } from "@/lib/subscription-billing";
import { Panel, Icon } from "./expense-components";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { AnimeStarfield } from "./components/anime-starfield";
import { Sun, Moon, Ellipsis } from "lucide-react";
import "./styles/anime-theme.css";
import "./expense-preview.css";
import "./expense-dashboard.css";

const receivableLabels = {pending: "expenseService.pending", partial: "expenseService.partial", paid: "expenseService.paid", overdue: "expenseService.overduePayment", waived: "expenseService.waived"} as const;
const applicationName = "SubNest";
export default function ExpenseDashboard() {
  const { t, locale } = useI18n();
  const subscriptionsQuery = useSubscriptionAnalytics(),
    fleetQuery = useSharingAccounts(),
    settingsQuery = useSettings();
  const settings = settingsQuery.data,
    subscriptions = subscriptionsQuery.data ?? [],
    accounts = fleetQuery.data?.accounts ?? [];
  const details = useSharingAccountDetails(accounts.map((a) => a.id));
  const { convert, loading: ratesLoading } = useReportExchangeRates(
    settings?.exchangeRateProvider,
  );
  const currency = settings?.defaultCurrency ?? "CNY",
    today = useZonedToday(settings?.timezone ?? "UTC");
  const format = (value: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(
      value,
    );
  const { totalMonthly } = useDashboardStats(
    subscriptions,
    currency,
    convert,
    today,
    settings?.notificationReminderDays ?? 7,
  );
  const [tab, setTab] = useState(0),
    [query, setQuery] = useState(""),
    [onlyDue, setOnlyDue] = useState(false),
    [menu, setMenu] = useState(false),
    [light, setLight] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.classList.contains("dark");
    root.classList.add("theme-anime", "dark");
    return () => {
      root.classList.remove("theme-anime");
      root.classList.toggle("dark", previous);
    };
  }, []);
  const seats = details.flatMap((d) =>
    d.data
      ? d.data.seats
          .filter((s) => s.status !== "vacant" && s.status !== "archived")
          .map((s) => ({ ...s, account: d.data!.account }))
      : [],
  );
  const income = accounts.reduce(
    (sum, a) => sum + sharingMonthlyRevenue(a, currency, convert),
    0,
  );
  const outstanding = accounts.reduce(
    (sum, a) => sum + sharingOutstandingAmount(a, currency, convert),
    0,
  );
  const capacity = accounts.reduce((sum, a) => sum + a.capacity, 0),
    occupied = accounts.reduce((sum, a) => sum + a.occupiedSeats, 0);
  const due = subscriptions.filter(
    (s) =>
      daysBetweenDateOnly(today, s.nextBillingDate) <= 7 &&
      isRenewableService(s),
  );
  const actionSeats = seats.filter(s => (s.status === "active" && s.expiresAt && daysBetweenDateOnly(today,s.expiresAt) <= 7) || (s.currentReceivable && ["pending", "partial", "overdue"].includes(s.currentReceivable.status)));
  const pending = details.some((d) => d.isPending),
    incomplete = details.some((d) => d.isError);
  const seatCount = pending || incomplete ? "—" : String(seats.length);
  const tabs = [
    t("expenseLive.text1"),
    t("expenseLive.text2"),
    t("expenseLive.text3"),
    t("expenseLive.text4"),
  ];
  const nav = [
    [t("expenseLive.text5"), "home", "/"],
    [t("expenseLive.text6"), "nodes", "/sharing"],
    [t("expenseLive.text7"), "servers", "/subscriptions"],
    [t("expenseLive.text8"), "users", "/sharing"],
    [t("expenseLive.text9"), "subscription", "/status"],
    [t("expenseLive.text10"), "settings", "/settings"],
  ];
  const loading =
    subscriptionsQuery.isPending ||
    fleetQuery.isPending ||
    settingsQuery.isPending;
  useRouteReady(loading);
  const failed =
    subscriptionsQuery.isError || fleetQuery.isError || settingsQuery.isError;
  const metrics =
    tab === 0
      ? [
          [
            t("dashboard.monthlySpend"),
            format(totalMonthly),
            t("expenseLive.text12"),
          ],
          [t("expenseLive.text13"), format(income), t("expenseLive.text14")],
          [t("expenseLive.text15"), seatCount, t("expenseLive.text16")],
          [
            t("expenseLive.text17"),
            String(
              subscriptions.filter(
                (s) => isEffectivelyActiveSubscription(s,today),
              ).length,
            ),
            t("expenseLive.text18"),
          ],
          [
            t("expenseLive.text19"),
            capacity ? `${Math.round((occupied / capacity) * 100)}%` : "—",
            `${occupied} / ${capacity}`,
          ],
          [
            t("expenseLive.text20"),
            format(outstanding),
            t("expenseLive.text21"),
          ],
        ]
      : tab === 1
        ? [
            [t("expenseLive.text15"), seatCount, t("expenseLive.text16")],
            [
              t("expenseLive.text22"),
              String(occupied),
              t("expenseLive.text18"),
            ],
            [t("expenseLive.text13"), format(income), t("expenseLive.text14")],
            [
              t("expenseLive.text20"),
              format(outstanding),
              t("expenseLive.text21"),
            ],
            [
              t("expenseLive.text23"),
              pending || incomplete
                ? "—"
                : String(
                    seats.filter(
                      (s) =>
                        s.expiresAt &&
                        daysBetweenDateOnly(today, s.expiresAt) <= 7,
                    ).length,
                  ),
              t("expenseLive.text24"),
            ],
          ]
        : tab === 2
          ? [
              [
                t("expenseLive.text25"),
                String(accounts.length),
                t("expenseLive.text26"),
              ],
              [
                t("expenseLive.text27"),
                String(accounts.filter((a) => a.occupiedSeats > 0).length),
                t("expenseLive.text28"),
              ],
              [
                t("expenseLive.text13"),
                format(income),
                t("expenseLive.text14"),
              ],
              [
                t("expenseLive.text29"),
                String(occupied),
                `${occupied} / ${capacity}`,
              ],
            ]
          : [
              [
                t("expenseLive.text17"),
                String(
                  subscriptions.filter(
                    (s) => isEffectivelyActiveSubscription(s,today),
                  ).length,
                ),
                t("expenseLive.text18"),
              ],
              [
                t("dashboard.monthlySpend"),
                format(totalMonthly),
                t("expenseLive.text12"),
              ],
              [
                t("expenseLive.text13"),
                format(income),
                t("expenseLive.text14"),
              ],
              [
                t("expenseLive.text23"),
                String(due.length),
                t("expenseLive.text30"),
              ],
              [
                t("expenseService.due30"),
                format(renewalWindow(subscriptions, today, 30).reduce((n,s) => n + convert(s.price,s.currency,currency),0)),
                t("expenseService.nextRenewals"),
              ],
            ];
  const colors = ["#9564f5", "#5b48d3", "#e16bb1", "#43c2b7", "#efd073"];
  const rank = [...accounts].sort(
    (a, b) =>
      sharingMonthlyRevenue(b, currency, convert) -
      sharingMonthlyRevenue(a, currency, convert),
  );
  const costs = subscriptions.filter(s => isEffectivelyActiveSubscription(s,today)).map((s) => ({
    id: s.id,
    name: s.name,
    value: Math.max(0, convert(toSubscriptionMonthlyAmount(s.price, s), s.currency, currency)),
  }));
  const totalCost = costs.reduce((sum, a) => sum + a.value, 0);
  const costGradient = costs
    .map((a, i) => {
      const start = totalCost ? costs.slice(0,i).reduce((n,c) => n+c.value,0) / totalCost * 100 : 0;
      const end = start + (totalCost ? a.value / totalCost * 100 : 0);
      return `${colors[i % colors.length]} ${start}% ${end}%`;
    })
    .join(",");
  const maxIncome = Math.max(
    1,
    ...rank.map((a) => sharingMonthlyRevenue(a, currency, convert)),
  );
  const match = (name: string) =>
    name.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const seatRows = seats.filter(
    (s) =>
      match(`${s.memberName ?? ""} ${s.contact ?? ""} ${s.account.name}`) &&
      (!onlyDue ||
        Boolean(s.expiresAt && daysBetweenDateOnly(today, s.expiresAt) <= 7)),
  );
  const accountRows = accounts.filter(
    (a) =>
      match(`${a.name} ${a.subscription.name}`) &&
      (!onlyDue || daysBetweenDateOnly(today, a.nextBillingDate) <= 7),
  );
  const retry = () => {
    void subscriptionsQuery.refetch();
    void fleetQuery.refetch();
    void settingsQuery.refetch();
    details.forEach((d) => void d.refetch());
  };
  const empty = <p className="empty">{t("expensePreview.text171")}</p>;
  const historical = (
    <div className="empty history-empty">{t("expenseLive.text33")}</div>
  );
  const rankPanel = (
    <div className="ranking">
      {rank.map((a) => (
        <div key={a.id}>
          <p>
            <span className="name-label">
              <Icon />
              {a.name}
            </span>
            <span>{format(sharingMonthlyRevenue(a, currency, convert))}</span>
          </p>
          <div className="track">
            <i
              style={{
                width: `${(Math.max(0, sharingMonthlyRevenue(a, currency, convert)) / maxIncome) * 100}%`,
              }}
            />
          </div>
        </div>
      ))}
      {!rank.length && empty}
    </div>
  );
  const serviceStatus = (
    <div className="ranking">
      {subscriptions.map((s) => (
        <div key={s.id}>
          <p>
            <span className="name-label">
              <Icon />
              {s.name}
            </span>
            <span>{t(`status.${getEffectiveSubscriptionStatus(s,today)}`)}</span>
          </p>
          <small>
            {t("expenseLive.text34")} {s.nextBillingDate}
          </small>
          {serviceProgress(s,today) !== null && <div className="track"><i style={{width:`${serviceProgress(s,today)}%`}}/></div>}
        </div>
      ))}
      {!subscriptions.length && empty}
    </div>
  );
  return (
    <div className="expense-live">
      <AnimeStarfield />
      <header className="expense-topbar">
        <a className="expense-brand" href="/" aria-label={applicationName}>
          <img src="/images/reference-preview/meowx-icon-dark.webp" alt="" />
          <strong>{applicationName}</strong>
        </a>
        <nav className="top-navigation" aria-label={t("expensePreview.text86")}>
          {nav.map(([name, icon, href], i) => (
            <a
              className="pixel-button"
              href={href}
              aria-label={name}
              title={name}
              key={href + String(i)}
              data-status={i === 0 ? "active" : undefined}
            >
              <img
                src={`/images/reference-preview/anime-nav/${icon}.png`}
                alt=""
              />
              <span>{name}</span>
            </a>
          ))}
        </nav>
        <div className="top-actions">
          <button
            className="pixel-button"
            aria-label={t("expensePreview.text89")}
            onClick={() => {
              document.documentElement.classList.toggle("dark", light);
              setLight(!light);
            }}
          >
            {light ? <Moon size={19} /> : <Sun size={19} />}
          </button>
          <button
            className="pixel-button"
            aria-label={t("expensePreview.text87")}
            onClick={() => setMenu(!menu)}
          >
            <Ellipsis size={20} />
          </button>
          <a className="pixel-button account-button" href="/settings">
            <img src="/images/reference-preview/meowx-icon-dark.webp" alt="" />
            <span>{t("expenseLive.text35")}</span>
          </a>
        </div>
        {menu && (
          <div className="top-menu">
            {nav.map(([name, , href], i) => (
              <a className="pixel-button" href={href} key={String(i)}>
                {name}
              </a>
            ))}
          </div>
        )}
      </header>
      <main data-testid="operations-dashboard">
        <div className="toolbar">
          <nav role="tablist" aria-label={t("expensePreview.text97")}>
            {tabs.map((n, i) => (
              <Button
                role="tab"
                aria-selected={tab === i}
                key={n}
                variant={tab === i ? "default" : "ghost"}
                onClick={() => {
                  setTab(i);
                  setQuery("");
                  setOnlyDue(false);
                }}
              >
                {n}
                {i > 0 && (
                  <small>
                    {i === 1
                      ? seatCount
                      : i === 2
                        ? accounts.length
                        : subscriptions.length}
                  </small>
                )}
              </Button>
            ))}
          </nav>
          <span>{today}</span>
        </div>
        {loading ? (
          <Panel title={t("expenseLive.text36")}>
            <p>{t("expenseLive.text37")}</p>
          </Panel>
        ) : failed ? (
          <Panel title={t("expenseLive.text38")}>
            <Button onClick={retry}>{t("expenseLive.text39")}</Button>
          </Panel>
        ) : (
          <>
            <p className="notice">
              {t("expenseLive.text40")}{" "}
              {ratesLoading && t("expenseLive.text41")}
            </p>
            {(pending || incomplete) && (
              <p role="status" className="notice">
                {pending ? t("expenseLive.text42") : t("expenseLive.text43")}
                {incomplete && (
                  <Button onClick={retry}>{t("expenseLive.text39")}</Button>
                )}
              </p>
            )}
            <section
              data-testid="dashboard-stat-grid"
              className="metrics"
              style={{
                gridTemplateColumns: `repeat(${metrics.length},minmax(0,1fr))`,
              }}
            >
              {metrics.map(([name, value, hint]) => (
                <Panel key={name} title={name ?? ""}>
                  <b className="value">{value}</b>
                  <p>{hint}</p>
                </Panel>
              ))}
            </section>
            {tab === 0 ? (
              <>
                <ExpenseCostCharts subscriptions={subscriptions} accounts={accounts} today={today} currency={currency} convert={convert}/>
                <section className="grid thirds">
                  <Panel
                    title={t("expenseLive.text46")}
                    hint={t("expenseLive.text47")}
                  >
                    <div className="ranking">
                      {seats
                        .filter(
                          (s) =>
                            s.currentReceivable &&
                            Number(s.currentReceivable.amount) >
                              Number(s.currentReceivable.paidAmount),
                        )
                        .map((s) => (
                          <div key={s.id}>
                            <p>
                              <span className="name-label">
                                <Icon user />
                                {s.memberName || s.seatNumber}
                              </span>
                              <span>
                                {s.currentReceivable?.currency}{" "}
                                {Number(s.currentReceivable?.amount) -
                                  Number(s.currentReceivable?.paidAmount)}
                              </span>
                            </p>
                            <small>{s.account.name}</small>
                          </div>
                        ))}
                    </div>
                  </Panel>
                  <Panel title={t("expenseLive.text48")}>{rankPanel}</Panel>
                  <Panel
                    title={t("expenseLive.text49")}
                    hint={t("expenseLive.text12")}
                  >
                    <div className="ring-box">
                      {totalCost > 0 && (
                        <div
                          className="ring"
                          style={{
                            background: `conic-gradient(${costGradient})`,
                          }}
                        />
                      )}
                      {costs.map((a, i) => (
                        <p key={a.id}>
                          <i
                            style={{ background: colors[i % colors.length] }}
                          />
                          {a.name}
                          <span>{format(a.value)}</span>
                        </p>
                      ))}
                      {!costs.length && empty}
                    </div>
                  </Panel>
                </section>
                <section className="grid halves">
                  <Panel
                    title={t("expenseLive.text51")}
                    hint={t("expenseLive.text52")}
                  >
                    <div className="alerts">
                      {due.map((s) => (
                        <a key={s.id} href="/subscriptions">
                          <span>{s.name}</span>
                          <small>{s.nextBillingDate}</small>
                          <b>{t("expenseLive.text53")}</b>
                        </a>
                      ))}
                      {actionSeats
                        .map((s) => (
                          <a key={s.id} href="/sharing">
                            <span>
                              {s.memberName || s.seatNumber} · {s.account.name}
                            </span>
                            <small>{s.expiresAt}</small>
                            <b>{t("expenseLive.text53")}</b>
                          </a>
                        ))}
                      {!due.length &&
                        !actionSeats.length &&
                        !pending &&
                        !incomplete && <p>{t("expenseLive.text54")}</p>}
                    </div>
                  </Panel>
                  <Panel
                    title={t("expenseLive.text9")}
                    hint={t("expenseLive.text55")}
                  >
                    {serviceStatus}
                  </Panel>
                </section>
              </>
            ) : tab === 1 ? (
              <section className="grid thirds">
                <Panel title={t("expenseLive.text56")}>
                  <div className="ranking">
                    {(["pending", "partial", "paid", "overdue", "waived"] as const).map(
                      (status) => (
                        <p key={status}>
                          {t(receivableLabels[status])}
                          <span>
                            {
                              seats.filter(
                                (s) => s.currentReceivable?.status === status,
                              ).length
                            }
                          </span>
                        </p>
                      ),
                    )}
                  </div>
                </Panel>
                <Panel title={t("expenseLive.text57")}>
                  {accounts.map((a) => (
                    <p key={a.id}>
                      {a.name} · {a.occupiedSeats} / {a.capacity}
                    </p>
                  ))}
                </Panel>
                <Panel title={t("expenseLive.text58")}>{historical}</Panel>
              </section>
            ) : tab === 2 ? (
              <section className="grid wide">
                <Panel title={t("expenseLive.text59")}>{rankPanel}</Panel>
                <Panel title={t("expenseLive.text60")}>
                  {accounts.map((a) => (
                    <p key={a.id}>
                      {a.subscription.name} · {a.name}
                    </p>
                  ))}
                </Panel>
              </section>
            ) : (
              <ExpenseServers subscriptions={subscriptions} accounts={accounts}
                details={details.flatMap(d => d.data ? [d.data] : [])} today={today}
                currency={currency} convert={convert} incomplete={pending || incomplete}/>
            )}
            {tab > 0 && tab < 3 && (
              <Panel title={tabs[tab] ?? ""} hint={t("expenseLive.text64")}>
                <div className="filters">
                  <Input
                    aria-label={t("expensePreview.text149")}
                    placeholder={t("expensePreview.text149")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <Button
                    variant={onlyDue ? "outline" : "default"}
                    onClick={() => setOnlyDue(false)}
                  >
                    {t("expenseLive.text65")}
                  </Button>
                  <Button
                    variant={onlyDue ? "default" : "outline"}
                    onClick={() => setOnlyDue(true)}
                  >
                    {t("expenseLive.text23")}
                  </Button>
                </div>
                {tab === 1 ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {[
                            t("expenseLive.text2"),
                            t("expenseLive.text66"),
                            t("expenseLive.text67"),
                            t("expenseLive.text68"),
                            t("expenseLive.text69"),
                            t("expenseLive.text70"),
                            t("expenseLive.text71"),
                          ].map((n) => (
                            <th key={n}>{n}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {seatRows.map((s) => (
                          <tr key={s.id}>
                            <td>
                              <span className="name-label">
                                <Icon user />
                                {s.memberName || t("expenseLive.text72")}
                              </span>
                            </td>
                            <td>{s.account.name}</td>
                            <td>{s.seatNumber}</td>
                            <td>
                              {s.currency} {s.monthlyPrice ?? "—"}
                            </td>
                            <td>{s.currentReceivable ? t(receivableLabels[s.currentReceivable.status]) : "—"}</td>
                            <td>{s.expiresAt ?? "—"}</td>
                            <td>
                              <a href="/sharing">{t("expenseLive.text73")}</a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!seatRows.length && empty}
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {[
                            t("expenseLive.text66"),
                            t("expenseLive.text4"),
                            t("expenseLive.text74"),
                            t("expenseLive.text75"),
                            t("expenseLive.text67"),
                            t("expenseLive.text71"),
                          ].map((n) => (
                            <th key={n}>{n}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {accountRows.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <span className="name-label">
                                <Icon />
                                {a.name}
                              </span>
                            </td>
                            <td>{a.subscription.name}</td>
                            <td>
                              {format(
                                sharingMonthlyRevenue(a, currency, convert),
                              )}
                            </td>
                            <td>
                              {a.currency} {a.monthlyCost}
                            </td>
                            <td>
                              {a.occupiedSeats} / {a.capacity}
                            </td>
                            <td>
                              <a href="/sharing">{t("expenseLive.text76")}</a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!accountRows.length && empty}
                  </div>

                )}
              </Panel>
            )}
          </>
        )}
      </main>
    </div>
  );
}
