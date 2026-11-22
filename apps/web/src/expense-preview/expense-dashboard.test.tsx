import { render, screen, fireEvent } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  loadAndActivateLocale,
  translate,
  type MessageKey,
} from "@/i18n/messages";
beforeAll(async () => {
  await loadAndActivateLocale("zh-CN");
});
vi.mock("@/i18n/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: MessageKey) => translate("zh-CN", key),
    locale: "zh-CN",
  }),
}));
vi.mock("@/hooks/use-subscriptions", () => ({
  useSubscriptionAnalytics: () => ({
    data: [
      {
        id: "sub",
        name: "Real Subscription",
        status: "active",
        nextBillingDate: "2026-11-20",
        currency: "CNY",
        price: "20",
        billingCycle: "monthly",
        startDate: "2026-11-01",
      },
    ],
    isPending: false,
    isError: false,
  }),
}));
const account = {
  id: "car",
  name: "Real Car",
  subscription: { id: "sub", name: "Real Subscription" },
  currency: "CNY",
  monthlyCost: "20",
  monthlyRevenueByCurrency: { CNY: "30" },
  outstandingAmount: "10",
  capacity: 4,
  occupiedSeats: 1,
  nextBillingDate: "2026-11-20",
};
vi.mock("@/hooks/use-sharing", () => ({
  useSharingAccounts: () => ({
    data: { accounts: [account] },
    isPending: false,
    isError: false,
  }),
  useSharingAccountDetails: () => [
    {
      isPending: false,
      isError: false,
      data: {
        totals: {collectedRevenue:"20",contractedRevenue:"30"},
        account,
        seats: [
          {
            id: "seat",
            memberName: "Real Member",
            seatNumber: 1,
            status: "active",
            currency: "CNY",
            monthlyPrice: "30",
            expiresAt: "2026-11-20",
            currentReceivable: {
              periodStart: "2026-11-01",
              periodEnd: "2026-12-01",
              amount: "30",
              paidAmount: "20",
              status: "partial",
              currency: "CNY",
            },
          },
        ],
      },
    },
  ],
}));
vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({
    data: { defaultCurrency: "CNY", timezone: "Asia/Shanghai" },
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/use-report-exchange-rates", () => ({
  useReportExchangeRates: () => ({
    convert: (v: number | string) => Number(v),
    loading: false,
  }),
}));
vi.mock("@/modules/subscriptions/application/use-dashboard-stats", () => ({
  useDashboardStats: () => ({ totalMonthly: 20 }),
}));
vi.mock("@/hooks/use-zoned-today", () => ({
  useZonedToday: () => "2026-11-17",
}));
vi.mock("@/components/route-progress", () => ({
  useRouteReady: () => undefined,
}));
vi.mock("./components/anime-starfield", () => ({ AnimeStarfield: () => null }));
import ExpenseDashboard from "./expense-dashboard";
describe("live expense homepage", () => {
  it("renders live records, links management and does not invent historical charts", () => {
    render(<ExpenseDashboard />);
    expect(screen.getAllByText("Real Car").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Real Subscription").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "合租管理" })).toHaveAttribute(
      "href",
      "/sharing",
    );
    expect(screen.queryByText("¥1,248.00")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /车友/ }));
    expect(screen.getByText("Real Member")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "管理车位 →" })).toHaveAttribute(
      "href",
      "/sharing",
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "no match" },
    });
    expect(screen.queryByText("Real Member")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", {name:/服务器/}));
    expect(screen.getByText("续费日历")).toBeInTheDocument();
    expect(screen.getByRole("img", {name:/横轴/})).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "84");
    fireEvent.click(screen.getByRole("button", {name:"已暂停"}));
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name:"全部"}));
    expect(screen.getByRole("meter")).toBeInTheDocument();
  });
});
