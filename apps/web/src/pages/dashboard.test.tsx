// Dashboard 页面测试保护首页 hook 装配和统计入口，避免页面层绕过 domain 模型直接计算金额。
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertDateOnly } from "@/lib/time/date-only";
import { DEFAULT_CUSTOM_CONFIG } from "@/types/config";
import type { RecurringCycleSubscriptionCollectionItem, SubscriptionCollectionItem } from "@/types/subscription";
import type { SharingAccount, SharingAccountDetail } from "@renewlet/shared/schemas/sharing";
import Dashboard from "./dashboard";

interface MockSubscriptionAnalyticsResult {
  data: SubscriptionCollectionItem[] | undefined;
  isPending: boolean;
  error?: unknown;
  refetch?: () => void;
}

const mocks = vi.hoisted(() => ({
  handleAddSubscription: vi.fn(),
  handleDeleteSubscription: vi.fn(),
  handleEditDialogOpenChange: vi.fn(),
  handleEditSubscription: vi.fn(),
  handleTogglePublicHiddenSubscription: vi.fn(),
  handleSaveSubscription: vi.fn(),
  handleRenewSubscription: vi.fn(),
  compactRenewalLayout: false,
  ratesLoading: false,
  sharingAccounts: [] as SharingAccount[],
  sharingDetailQueries: [] as Array<{ data?: SharingAccountDetail; isPending: boolean }>,
  upcomingRenewalsCalls: [] as Array<{ count: number; today: string; notificationReminderDays: number }>,
  useSettings: vi.fn(),
  useSubscriptionAnalytics: vi.fn<() => MockSubscriptionAnalyticsResult>(),
}));

vi.mock("@/components/header", () => ({
  Header: ({ pageActions }: { pageActions?: React.ReactNode }) => <header data-testid="header">{pageActions}</header>,
}));

vi.mock("@/components/router-link", () => ({
  default: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/loading-skeleton", () => ({
  DashboardPageSkeleton: () => <div data-testid="dashboard-skeleton" />,
}));

vi.mock("@/components/upcoming-renewals", () => ({
  UpcomingRenewals: ({
    subscriptions,
    today,
    notificationReminderDays,
  }: {
    subscriptions: SubscriptionCollectionItem[];
    today: string;
    notificationReminderDays: number;
  }) => {
    mocks.upcomingRenewalsCalls.push({ count: subscriptions.length, today, notificationReminderDays });
    return <div data-testid="upcoming-renewals">{subscriptions.length}</div>;
  },
}));

vi.mock("@/components/edit-subscription-dialog", () => ({
  EditSubscriptionDialog: () => null,
}));

vi.mock("@/components/add-subscription-dialog", () => ({
  AddSubscriptionDialog: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));

vi.mock("@/hooks/use-report-exchange-rates", () => ({
  useReportExchangeRates: () => ({
    convert: (amount: number | string, from: string, to: string) => {
      const value = typeof amount === "number" ? amount : Number(amount);
      if (from === to) return value;
      if (from === "USD" && to === "CNY") return value * 7;
      return value;
    },
    loading: mocks.ratesLoading,
    sourceDate: "2026-08-01",
    reportBasisStatus: { month: "2026-08", locked: true, sourceDate: "2026-08-01", capturedAt: "2026-08-06T00:00:00Z" },
  }),
}));

vi.mock("@/hooks/use-settings", () => ({
  useSettings: mocks.useSettings,
}));

vi.mock("@/hooks/use-sharing", () => ({
  useSharingAccounts: () => ({
    data: { accounts: mocks.sharingAccounts, total: mocks.sharingAccounts.length },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSharingAccountDetails: () => mocks.sharingDetailQueries,
}));

vi.mock("@/hooks/use-zoned-today", () => ({
  useZonedToday: () => "2026-06-15",
}));

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => mocks.compactRenewalLayout,
}));

vi.mock("@/hooks/use-subscriptions", () => ({
  prefetchSubscriptionDetail: vi.fn(),
  useSubscriptionAnalytics: mocks.useSubscriptionAnalytics,
  useSubscriptionFacets: () => ({
    data: { total: 1, categoryCounts: { productivity: 1 }, tags: [], visibleCount: 1, hiddenCount: 0 },
  }),
}));

vi.mock("@/contexts/CustomConfigContext", () => ({
  useCustomConfigState: () => ({
    config: DEFAULT_CUSTOM_CONFIG,
  }),
}));

vi.mock("@/modules/subscriptions/application/use-subscription-crud", () => ({
  useSubscriptionCrud: () => ({
    editingSubscription: undefined,
    editDialogOpen: false,
    handleAddSubscription: mocks.handleAddSubscription,
    handleDeleteSubscription: mocks.handleDeleteSubscription,
    handleEditDialogOpenChange: mocks.handleEditDialogOpenChange,
    handleEditSubscription: mocks.handleEditSubscription,
    handleTogglePublicHiddenSubscription: mocks.handleTogglePublicHiddenSubscription,
    handleSaveSubscription: mocks.handleSaveSubscription,
    handleRenewSubscription: mocks.handleRenewSubscription,
    handleSubmitRenewSubscription: vi.fn(),
    handleRenewDialogOpenChange: vi.fn(),
    renewDialogOpen: false,
    renewSubmitting: false,
    renewDetailPending: false,
    renewError: null,
    renewRestoreFocusRef: { current: null },
  }),
}));

function subscription(
  overrides: Partial<RecurringCycleSubscriptionCollectionItem> = {},
): RecurringCycleSubscriptionCollectionItem {
  // 页面装配测试不验证过期规则；远期扣费日避免真实系统时间把公共夹具判为过期。
  return {
    id: "codex-pro",
    name: "Codex Pro",
    logo: undefined,
    price: "200",
    currency: "USD",
    billingCycle: "monthly",
    customDays: undefined,
    customCycleUnit: undefined,
    oneTimeTermCount: undefined,
    oneTimeTermUnit: undefined,
    category: "productivity",
    status: "active",
    pinned: false,
    publicHidden: false,
    paymentMethod: undefined,
    startDate: assertDateOnly("2026-04-18"),
    nextBillingDate: assertDateOnly("2099-05-18"),
    autoRenew: false,
    autoCalculateNextBillingDate: true,
    trialEndDate: undefined,
    reminderDays: 3,
    ...overrides,
  };
}

function sharingAccount(): SharingAccount {
  return {
    id: "sharing-1",
    subscription: { id: "netflix", name: "Netflix", platformName: "Netflix", logo: null },
    name: "Netflix",
    accountNumber: 2,
    loginAccount: "netflix@example.com",
    hasPassword: true,
    verificationLink: null,
    monthlyCost: "40",
    currency: "CNY",
    nextBillingDate: assertDateOnly("2026-07-01"),
    paymentMethod: null,
    cardLast4: null,
    capacity: 5,
    occupiedSeats: 1,
    monthlyRevenue: "60",
    monthlyRevenueByCurrency: { CNY: "60" },
    outstandingAmount: "15",
    monthlyProfit: 20,
    status: "active",
    notes: null,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function sharingDetail(account: SharingAccount): SharingAccountDetail {
  return {
    account,
    seats: [{
      id: "seat-1",
      seatNumber: 3,
      memberName: "Alice",
      contact: "alice",
      contactType: "wechat",
      monthlyPrice: "15",
      currency: "CNY",
      billingMonths: 1,
      startDate: assertDateOnly("2026-05-14"),
      expiresAt: assertDateOnly("2026-06-14"),
      status: "active",
      notes: null,
      currentReceivable: null,
    }],
    totals: {
      monthlyRevenue: "60",
      contractedRevenue: "60",
      collectedRevenue: "45",
      outstandingAmount: "15",
      monthlyProfit: 20,
    },
  };
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

function mockResolvedDashboardData() {
  mocks.useSubscriptionAnalytics.mockReturnValue({
    data: [subscription()],
    isPending: false,
  });
  mocks.useSettings.mockReturnValue({
    data: {
      defaultCurrency: "CNY",
      exchangeRateProvider: "exchange-api",
      notificationReminderDays: 5,
      subscriptionPriceReferenceEnabled: true,
      subscriptionPriceReferenceCurrency: "USD",
      timezone: "Asia/Shanghai",
    },
    isPending: false,
  });
}

describe("Dashboard page loading state", () => {
  beforeEach(() => {
    mocks.ratesLoading = false;
    mocks.compactRenewalLayout = false;
    mocks.sharingAccounts = [];
    mocks.sharingDetailQueries = [];
    mocks.upcomingRenewalsCalls = [];
    mockResolvedDashboardData();
  });

  it("keeps dashboard content visible while exchange rates are loading", () => {
    mocks.ratesLoading = true;

    renderDashboard();

    expect(screen.queryByTestId("dashboard-skeleton")).not.toBeInTheDocument();
    expect(screen.getAllByText("订阅续费").length).toBeGreaterThan(0);
    expect(screen.getAllByText("车友续费").length).toBeGreaterThan(0);
    expect(mocks.upcomingRenewalsCalls.at(-1)).toEqual({
      count: 1,
      today: "2026-06-15",
      notificationReminderDays: 5,
    });
    expect(screen.queryByText("支出分布")).not.toBeInTheDocument();
    expect(screen.getByText("日均 ¥46.67 · 汇率加载中...")).toBeInTheDocument();
  });

  it("shows a recoverable error instead of zeroed analytics", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mocks.useSubscriptionAnalytics.mockReturnValue({
      data: undefined,
      isPending: false,
      error: new Error(),
      refetch,
    });

    renderDashboard();

    expect(screen.getByRole("alert")).toHaveTextContent("操作失败，请稍后重试");
    expect(screen.queryByTestId("dashboard-stat-grid")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("uses one primary empty-state action while keeping secondary panels compact", () => {
    mocks.useSubscriptionAnalytics.mockReturnValue({
      data: [],
      isPending: false,
    });

    renderDashboard();

    expect(screen.getAllByRole("heading", { name: "从第一个订阅开始" })).toHaveLength(1);
    expect(screen.getByText("添加订阅后，这里会汇总支出、续费和提醒。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加第一个订阅" })).toBeInTheDocument();
    expect(screen.queryByTestId("upcoming-renewals")).not.toBeInTheDocument();
    expect(screen.getByText("未来 7 天内没有车友到期")).toBeInTheDocument();
  });

  it("keeps the three financial cards and adds two seven-day renewal cards", () => {
    renderDashboard();

    const grid = screen.getByTestId("dashboard-stat-grid");
    const monthlySpend = screen.getByTestId("dashboard-stat-monthly-spend");
    const sharingProfit = screen.getByTestId("dashboard-stat-sharing-profit");

    expect(grid).toHaveClass("grid", "grid-cols-5", "gap-3", "sm:grid-cols-2", "sm:gap-3", "lg:grid-cols-5");
    expect(monthlySpend).toHaveClass("p-1.5", "sm:p-3", "col-span-1");
    expect(monthlySpend).not.toHaveClass("p-6");
    expect(screen.getByTestId("dashboard-stat-sharing-income")).toHaveClass("p-1.5", "sm:p-3");
    expect(sharingProfit).toHaveClass("p-1.5", "sm:p-3");
    expect(screen.getByTestId("dashboard-stat-subscription-renewals")).toHaveClass("p-1.5", "sm:p-3");
    expect(screen.getByTestId("dashboard-stat-member-renewals")).toHaveClass("p-1.5", "sm:p-3");
    expect(screen.getByText("日均 ¥46.67 · 实时汇率换算 (CNY)")).toBeInTheDocument();
  });

  it("shows subscription and sharing renewal worklists without a spending chart", () => {
    renderDashboard();

    expect(screen.getByTestId("upcoming-renewals")).toHaveTextContent("1");
    expect(screen.getByText("未来 7 天内没有车友到期")).toBeInTheDocument();
    expect(screen.queryByText("支出分布")).not.toBeInTheDocument();
  });

  it("jumps directly to a selected year and month from the dashboard calendar", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "2026年6月" }));
    await user.click(screen.getByRole("button", { name: "2026年", expanded: false }));
    await user.click(screen.getByRole("button", { name: "2025" }));
    await user.click(screen.getByRole("button", { name: "11月" }));

    expect(screen.getByRole("button", { name: "2025年11月" })).toBeInTheDocument();
  });

  it("recalculates calendar spend, sharing income, and profit for the selected month", async () => {
    const user = userEvent.setup();
    const juneAccount = sharingAccount();
    const juneDetail = sharingDetail(juneAccount);
    juneDetail.seats[0] = {
      ...juneDetail.seats[0]!,
      monthlyPrice: "150",
      expiresAt: assertDateOnly("2026-06-20"),
    };
    const julyAccount = { ...sharingAccount(), id: "sharing-2" };
    const julyDetail = sharingDetail(julyAccount);
    julyDetail.seats[0] = {
      ...julyDetail.seats[0]!,
      id: "seat-2",
      monthlyPrice: "25",
      expiresAt: assertDateOnly("2026-07-04"),
    };
    mocks.sharingAccounts = [juneAccount, julyAccount];
    mocks.sharingDetailQueries = [
      { data: juneDetail, isPending: false },
      { data: julyDetail, isPending: false },
    ];
    mocks.useSubscriptionAnalytics.mockReturnValue({
      data: [
        subscription({ id: "june-subscription", price: "100", currency: "CNY", nextBillingDate: assertDateOnly("2026-06-18") }),
        subscription({ id: "july-subscription", price: "40", currency: "CNY", nextBillingDate: assertDateOnly("2026-07-03") }),
      ],
      isPending: false,
    });

    renderDashboard();

    expect(screen.getByTestId("dashboard-calendar-monthly-spend")).toHaveTextContent("¥140");
    expect(screen.getByTestId("dashboard-calendar-monthly-income")).toHaveTextContent("¥150");
    expect(screen.getByTestId("dashboard-calendar-monthly-profit")).toHaveTextContent("¥10");

    await user.click(screen.getByRole("button", { name: "下个月" }));

    expect(screen.getByTestId("dashboard-calendar-monthly-spend")).toHaveTextContent("¥140");
    expect(screen.getByTestId("dashboard-calendar-monthly-income")).toHaveTextContent("¥175");
    expect(screen.getByTestId("dashboard-calendar-monthly-profit")).toHaveTextContent("¥35");
  });

  it("counts only subscriptions and members due within the next seven days", async () => {
    const user = userEvent.setup();
    const account = sharingAccount();
    const detail = sharingDetail(account);
    detail.seats[0] = { ...detail.seats[0]!, expiresAt: assertDateOnly("2026-06-20") };
    mocks.sharingAccounts = [account];
    mocks.sharingDetailQueries = [{ data: detail, isPending: false }];
    mocks.useSubscriptionAnalytics.mockReturnValue({
      data: [subscription({ nextBillingDate: assertDateOnly("2026-06-20") })],
      isPending: false,
    });

    renderDashboard();

    expect(screen.getByTestId("dashboard-stat-subscription-renewals")).toHaveTextContent("1");
    expect(screen.getByTestId("dashboard-stat-member-renewals")).toHaveTextContent("1");
    await user.click(screen.getByRole("button", { name: "查看 7 天内需要续费的订阅" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("7 天内订阅续费");
  });

  it("keeps overdue sharing members visible with their account and charge", () => {
    const account = sharingAccount();
    mocks.sharingAccounts = [account];
    mocks.sharingDetailQueries = [{ data: sharingDetail(account), isPending: false }];

    renderDashboard();

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByTitle("账号编号 2")).toBeInTheDocument();
    expect(screen.getByText("车位 #3 · 6月14日 到期")).toBeInTheDocument();
    expect(screen.getByText("已过期 1 天")).toBeInTheDocument();
    expect(screen.getAllByText("¥15 CNY").length).toBeGreaterThan(0);
    expect(screen.getByTestId("dashboard-stat-sharing-income")).toHaveTextContent("¥60");
    expect(screen.getByTestId("dashboard-stat-sharing-profit")).toHaveTextContent("¥20");
  });

  it("combines renewal worklists into switchable tabs on compact screens", async () => {
    const user = userEvent.setup();
    mocks.compactRenewalLayout = true;
    mocks.useSubscriptionAnalytics.mockReturnValue({ data: [], isPending: false });

    renderDashboard();

    expect(screen.getByRole("tab", { name: /订阅续费/ })).toHaveAttribute("data-state", "active");
    await user.click(screen.getByRole("tab", { name: /车友续费/ }));
    expect(screen.getByText("未来 7 天内没有车友到期")).toBeInTheDocument();
  });

  it.each([
    ["subscriptions", { subscriptionsPending: true, settingsPending: false }],
    ["settings", { subscriptionsPending: false, settingsPending: true }],
  ])("shows the skeleton while %s data is still pending", (_label, state) => {
    mocks.useSubscriptionAnalytics.mockReturnValue({
      data: state.subscriptionsPending ? undefined : [subscription()],
      isPending: state.subscriptionsPending,
    });
    mocks.useSettings.mockReturnValue({
      data: state.settingsPending
        ? undefined
        : {
            defaultCurrency: "CNY",
            exchangeRateProvider: "exchange-api",
            notificationReminderDays: 5,
            subscriptionPriceReferenceEnabled: true,
            subscriptionPriceReferenceCurrency: "USD",
            timezone: "Asia/Shanghai",
          },
      isPending: state.settingsPending,
    });

    renderDashboard();

    expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();
  });
});
