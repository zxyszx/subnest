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
import { buildOperationsForecast, buildOperationsOverview } from "@/modules/subscriptions/domain/operations-overview";

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

vi.mock("@/components/sharing-account-detail-dialog", () => ({
  SharingAccountDetailDialog: ({ account, open }: { account: SharingAccount | null; open: boolean }) => (
    open ? <div role="dialog" aria-label={`家庭共享 ${account?.accountNumber}`}>{account?.loginAccount}</div> : null
  ),
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
    tags: overrides.tags ?? [],
  };
}

function sharingAccount(): SharingAccount {
  return {
    id: "sharing-1",
    subscription: {
      id: "netflix",
      name: "Netflix",
      platformName: "Netflix",
      logo: null,
      status: "active",
    },
    name: "Netflix",
    accountNumber: 2,
    loginAccount: "netflix@example.com",
    hasPassword: true,
    additionalCredential: null,
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

describe("Dashboard operations overview", () => {
  beforeEach(() => {
    mocks.ratesLoading = false;
    mocks.sharingAccounts = [];
    mocks.sharingDetailQueries = [];
    mocks.upcomingRenewalsCalls = [];
    mockResolvedDashboardData();
  });

  it("keeps current content visible during exchange-rate refresh", () => {
    mocks.ratesLoading = true;
    renderDashboard();
    expect(screen.queryByTestId("dashboard-skeleton")).not.toBeInTheDocument();
    expect(screen.getByText("日均 ¥46.67 · 汇率加载中...")).toBeInTheDocument();
    expect(mocks.upcomingRenewalsCalls.at(-1)).toEqual({ count: 1, today: "2026-06-15", notificationReminderDays: 5 });
  });

  it("shows recoverable errors instead of zeroed analytics", async () => {
    const refetch = vi.fn();
    mocks.useSubscriptionAnalytics.mockReturnValue({ data: undefined, isPending: false, error: new Error(), refetch });
    renderDashboard();
    expect(screen.getByRole("alert")).toHaveTextContent("操作失败，请稍后重试");
    expect(screen.queryByTestId("dashboard-stat-grid")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows five real metrics and no calendar or payment-failure feature", () => {
    const account = sharingAccount();
    mocks.sharingAccounts = [account];
    renderDashboard();
    expect(screen.getByTestId("dashboard-stat-grid").children).toHaveLength(5);
    expect(screen.getByTestId("dashboard-stat-sharing-income")).toHaveTextContent("¥60");
    expect(screen.getByTestId("dashboard-stat-sharing-profit")).toHaveTextContent("¥20");
    expect(screen.getByTestId("dashboard-stat-active")).toHaveTextContent("1");
    expect(screen.getByTestId("dashboard-stat-vacancies")).toHaveTextContent("4");
    expect(screen.getByRole("link", { name: /可招募车位/ })).toHaveAttribute("href", "/sharing?status=available");
    expect(screen.queryByTestId("dashboard-calendar-monthly-income")).not.toBeInTheDocument();
    expect(screen.queryByText("扣款失败")).not.toBeInTheDocument();
  });

  it("provides honest empty states without fabricated platform data", () => {
    mocks.useSubscriptionAnalytics.mockReturnValue({ data: [], isPending: false });
    renderDashboard();
    expect(screen.getByTestId("dashboard-stat-active")).toHaveTextContent("0");
    expect(screen.getAllByText("暂无共享账号")).toHaveLength(2);
    expect(screen.getByText("暂无新增账号记录")).toBeInTheDocument();
    expect(screen.getByText("暂无需要关注的事项")).toBeInTheDocument();
  });

  it("displays unbound platforms and provides a usable filter destination", () => {
    const account = sharingAccount();
    account.subscription.platformName = "__unbound__";
    mocks.sharingAccounts = [account];
    renderDashboard();
    expect(screen.getByRole("heading", { name: "未绑定" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /未绑定/ })).toHaveAttribute("href", "/sharing?platform=__unbound__");
  });

  it("opens subscription and member worklists without leaving the dashboard", async () => {
    const user = userEvent.setup();
    const account = sharingAccount();
    mocks.sharingAccounts = [account];
    mocks.sharingDetailQueries = [{ data: sharingDetail(account), isPending: false }];
    mocks.useSubscriptionAnalytics.mockReturnValue({ data: [subscription({ nextBillingDate: assertDateOnly("2026-06-20") })], isPending: false });
    renderDashboard();
    await user.click(screen.getByRole("button", { name: /订阅续费\s*1/ }));
    expect(screen.getByRole("dialog", { name: "7 天内订阅续费" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    await user.click(screen.getByRole("button", { name: /车友续费\s*1/ }));
    expect(screen.getByRole("dialog", { name: "7 天内车友续费" })).toHaveTextContent("已过期 1 天");
  });

  it("preserves overdue members and manual account management", async () => {
    const account = sharingAccount();
    mocks.sharingAccounts = [account];
    mocks.sharingDetailQueries = [{ data: sharingDetail(account), isPending: false }];
    renderDashboard();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("已过期 1 天")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "管理账号" }));
    expect(await screen.findByRole("dialog", { name: "家庭共享 2" })).toHaveTextContent("netflix@example.com");
  });

  it.each(["subscriptions", "settings"])("shows skeleton while %s is pending", (source) => {
    if (source === "subscriptions") mocks.useSubscriptionAnalytics.mockReturnValue({ data: undefined, isPending: true });
    else mocks.useSettings.mockReturnValue({ data: undefined, isPending: true });
    renderDashboard();
    expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();
  });
});

describe("Operations projection boundaries", () => {
  const convert = (amount: number | string) => Number(amount);

  it("normalizes annual subscription costs and member terms without inventing receipts", () => {
    const account = sharingAccount();
    const detail = sharingDetail(account);
    detail.seats = Array.from({ length: 5 }, (_, index) => ({
      ...detail.seats[0]!, id: `annual-seat-${index}`, monthlyPrice: String(50 / 12), billingMonths: 12,
      startDate: assertDateOnly("2026-01-01"), expiresAt: assertDateOnly("2027-01-01"),
    }));
    const projection = buildOperationsForecast([subscription({ billingCycle: "annual", price: "100", currency: "CNY", startDate: null })], [detail], assertDateOnly("2026-01-01"), "CNY", convert);
    expect(projection.reduce((sum, month) => sum + month.cost, 0)).toBeCloseTo(100);
    expect(projection.reduce((sum, month) => sum + month.revenue, 0)).toBeCloseTo(250);
    expect(projection.reduce((sum, month) => sum + month.profit, 0)).toBeCloseTo(150);
  });

  it("keeps scheduled-stop seats valid until expiry and excludes future or expired contracts", () => {
    const detail = sharingDetail(sharingAccount());
    detail.seats[0] = { ...detail.seats[0]!, status: "paused", startDate: assertDateOnly("2026-10-01"), expiresAt: assertDateOnly("2026-11-01") };
    const projection = buildOperationsForecast([], [detail], assertDateOnly("2026-10-13"), "CNY", convert);
    expect(projection[0]!.revenue).toBeCloseTo(15);
    expect(projection[1]!.revenue).toBe(0);
    detail.seats[0] = { ...detail.seats[0]!, startDate: assertDateOnly("2026-11-01"), expiresAt: assertDateOnly("2026-12-01") };
    expect(buildOperationsForecast([], [detail], assertDateOnly("2026-10-13"), "CNY", convert)[0]!.revenue).toBe(0);
  });

  it("groups unbound platforms and excludes archived accounts from recruitable seats", () => {
    const account = sharingAccount();
    account.subscription.platformName = "__unbound__";
    const overview = buildOperationsOverview([account, { ...account, id: "archive", status: "archived" }], [], "CNY", convert, assertDateOnly("2026-10-13"));
    expect(overview.capacity).toBe(5);
    expect(overview.vacancies).toBe(4);
    expect(overview.platforms).toHaveLength(1);
    expect(overview.platforms[0]!.name).toBe("");
  });
});
