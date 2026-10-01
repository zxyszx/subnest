import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSeatExpiryUrgency, SharingAccountDetailDialog } from "@/components/sharing-account-detail-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SharingAccount, SharingAccountDetail, SharingSeat, SharingSeatUpdate } from "@renewlet/shared/schemas/sharing";

const mocks = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
  password: vi.fn(),
  updateSeat: vi.fn<(payload: { seatId: string; input: SharingSeatUpdate }) => Promise<void>>(),
  moveSeat: vi.fn(),
  seats: [] as SharingSeat[],
  accounts: [] as SharingAccount[],
  details: new Map<string, SharingAccountDetail>(),
}));

const account = {
  id: "share-17",
  subscription: { id: "sub-17", name: "Netflix", platformName: "Netflix", logo: null, status: "active" as const },
  name: "编号 17",
  accountNumber: 17,
  loginAccount: "netflix17@newszxcn.com",
  hasPassword: true,
  verificationLink: "https://dingyue.xzys.me/s/example",
  monthlyCost: "42.93",
  currency: "CNY",
  nextBillingDate: "2026-10-02",
  paymentMethod: "Moniepoint",
  cardLast4: "7186",
  capacity: 5,
  occupiedSeats: 3,
  monthlyRevenue: "45.00",
  monthlyRevenueByCurrency: { CNY: "45.00" },
  outstandingAmount: "0.00",
  monthlyProfit: 2.07,
  status: "active" as const,
  notes: null,
  createdAt: "2026-01-01T00:00:00Z",
};

vi.mock("@/hooks/use-sharing", () => ({
  useSharingAccountDetail: () => ({
    data: {
      account,
      seats: mocks.seats,
      totals: {
        monthlyRevenue: "45.00",
        contractedRevenue: "105.00",
        collectedRevenue: "105.00",
        outstandingAmount: "0.00",
        monthlyProfit: 2.07,
      },
    },
    isPending: false,
    isError: false,
  }),
  useSharingAccounts: () => ({ data: { accounts: mocks.accounts, total: mocks.accounts.length }, isPending: false }),
  useSharingAccountDetails: (ids: string[]) => ids.map((id) => ({ data: mocks.details.get(id), isPending: false, isError: false })),
  useMoveSharingSeat: () => ({ mutateAsync: mocks.moveSeat, isPending: false }),
  useUpdateSharingSeat: () => ({ mutateAsync: mocks.updateSeat, isPending: false }),
}));

vi.mock("@/hooks/use-settings", () => ({
  useSettingsEnvelope: () => ({ data: { settings: { defaultCurrency: "CNY" } } }),
}));

vi.mock("@/hooks/use-exchange-rates", () => ({
  useExchangeRates: () => ({ convert: (value: number | string) => Number(value) }),
}));

vi.mock("@/contexts/CustomConfigContext", () => ({
  useCustomConfigState: () => ({ config: { currencies: [] } }),
}));

vi.mock("@/hooks/use-managed-currency-options", () => ({
  useManagedCurrencyOptions: () => [{ value: "CNY", label: "CNY" }],
}));

vi.mock("@/services/sharing-service", () => ({
  sharingService: { password: mocks.password },
}));

vi.mock("@/components/sharing-payment-summary", () => ({
  SharingPaymentSummary: ({ paymentMethod }: { paymentMethod: string | null }) => paymentMethod,
}));

vi.mock("@/shared/browser/clipboard", () => ({
  copyTextToClipboard: mocks.copyTextToClipboard,
}));

vi.mock("@/i18n/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => key === "sharing.accountCopyTemplate"
      ? `账号：${values?.["account"]}\n密码：${values?.["password"]}\n链接：${values?.["link"]}`
      : key,
    formatCurrency: (value: number, currency: string) => `${value.toFixed(2)} ${currency}`,
    formatDateOnly: (value: string) => value,
    locale: "zh-CN",
  }),
}));

describe("SharingAccountDetailDialog account credentials", () => {
  beforeEach(() => {
    mocks.copyTextToClipboard.mockReset().mockResolvedValue({ ok: true });
    mocks.password.mockReset().mockResolvedValue("secret-17");
    mocks.updateSeat.mockReset().mockResolvedValue(undefined);
    mocks.moveSeat.mockReset().mockResolvedValue(undefined);
    mocks.seats = [];
    mocks.accounts = [account];
    mocks.details = new Map();
  });

  it("copies account, password and link independently and supports copying all", async () => {
    const user = userEvent.setup();
    render(
      <SharingAccountDetailDialog
        account={account}
        mode="account"
        open
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "sharing.copyAccount" }));
    await user.click(screen.getByRole("button", { name: "sharing.copyPassword" }));
    await user.click(screen.getByRole("button", { name: "复制验证码链接" }));
    await user.click(screen.getByRole("button", { name: "sharing.copyAll" }));

    await waitFor(() => expect(mocks.copyTextToClipboard).toHaveBeenCalledTimes(4));
    expect(mocks.copyTextToClipboard).toHaveBeenNthCalledWith(1, account.loginAccount);
    expect(mocks.copyTextToClipboard).toHaveBeenNthCalledWith(2, "secret-17");
    expect(mocks.copyTextToClipboard).toHaveBeenNthCalledWith(3, account.verificationLink);
    expect(mocks.copyTextToClipboard).toHaveBeenNthCalledWith(
      4,
      `账号：${account.loginAccount}\n密码：secret-17\n链接：${account.verificationLink}`,
    );
    expect(mocks.password).toHaveBeenCalledTimes(1);
  });

  it("saves member contact and rescales a monthly charge when switching to quarterly", async () => {
    mocks.seats = [{
      id: "seat-2",
      seatNumber: 2,
      memberName: "Member",
      contact: "member-id",
      contactType: "wechat",
      monthlyPrice: "15",
      currency: "CNY",
      billingMonths: 1,
      startDate: "2026-09-25",
      expiresAt: "2026-10-25",
      status: "active",
      notes: null,
      currentReceivable: null,
    }];
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <SharingAccountDetailDialog account={account} mode="seats" open onOpenChange={vi.fn()} />
      </TooltipProvider>,
    );

    expect(screen.getByRole("dialog", { name: "sharing.editAccount" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "sharing.editSeat" })[0]!);
    expect(screen.getByRole("button", { name: "sharing.monthly" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sharing.quarterly" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sharing.semiAnnual" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sharing.annual" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sharing.custom" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "sharing.twoMonths" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "sharing.customMonths" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sharing.active" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sharing.paused" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sharing.vacant" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "sharing.archived" })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "sharing.periodCharge" }));
    await user.type(screen.getByRole("textbox", { name: "sharing.periodCharge" }), "15");
    await user.click(screen.getByRole("button", { name: "sharing.quarterly" }));
    await user.click(screen.getByRole("combobox", { name: "sharing.contactType" }));
    expect(screen.queryByRole("option", { name: /sharing\.email/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /sharing\.phone/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /sharing\.other/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /sharing\.xianyu/ }));
    await user.click(screen.getByRole("button", { name: "sharing.saveSeat" }));

    await waitFor(() => expect(mocks.updateSeat).toHaveBeenCalledTimes(1));
    const saved = mocks.updateSeat.mock.calls[0]?.[0];
    expect(saved?.seatId).toBe("seat-2");
    expect(saved?.input).toMatchObject({
      contactType: "xianyu",
      billingAmount: "45",
      monthlyPrice: "15",
      billingMonths: 3,
    });
  });

  it("keeps mobile account content in one scroll region", () => {
    mocks.seats = [{
      id: "seat-scroll",
      seatNumber: 1,
      memberName: "Member",
      contact: null,
      contactType: null,
      monthlyPrice: "15",
      currency: "CNY",
      billingMonths: 1,
      startDate: "2026-09-25",
      expiresAt: "2026-10-05",
      status: "active",
      notes: null,
      currentReceivable: null,
    }];

    render(
      <TooltipProvider>
        <SharingAccountDetailDialog account={account} mode="seats" open onOpenChange={vi.fn()} />
      </TooltipProvider>,
    );

    expect(screen.getByTestId("sharing-account-scroll")).toHaveClass("overflow-y-auto", "touch-pan-y");
    expect(screen.getByTestId("sharing-seat-mobile-list")).not.toHaveClass("overflow-y-auto");
  });

  it("selects a searchable target account before exposing its vacant seats", async () => {
    const user = userEvent.setup();
    const movingSeat: SharingSeat = {
      id: "seat-moving",
      seatNumber: 1,
      memberName: "Yihun",
      contact: "member-id",
      contactType: "wechat",
      monthlyPrice: "15",
      currency: "CNY",
      billingMonths: 1,
      startDate: "2026-09-25",
      expiresAt: "2026-10-04",
      status: "active",
      notes: null,
      currentReceivable: null,
    };
    const targetAccount: SharingAccount = {
      ...account,
      id: "share-18",
      accountNumber: 18,
      loginAccount: "netflix18@example.com",
      occupiedSeats: 0,
    };
    const targetSeat: SharingSeat = {
      ...movingSeat,
      id: "seat-target",
      seatNumber: 2,
      memberName: null,
      contact: null,
      contactType: null,
      monthlyPrice: null,
      currency: null,
      startDate: null,
      expiresAt: null,
      status: "vacant",
    };
    mocks.seats = [movingSeat];
    mocks.accounts = [account, targetAccount];
    mocks.details = new Map([
      [account.id, { account, seats: [movingSeat], totals: { monthlyRevenue: "15", contractedRevenue: "0", collectedRevenue: "0", outstandingAmount: "0", monthlyProfit: -27.93 } }],
      [targetAccount.id, { account: targetAccount, seats: [targetSeat], totals: { monthlyRevenue: "0", contractedRevenue: "0", collectedRevenue: "0", outstandingAmount: "0", monthlyProfit: -42.93 } }],
    ]);

    render(
      <TooltipProvider>
        <SharingAccountDetailDialog account={account} mode="seats" open onOpenChange={vi.fn()} />
      </TooltipProvider>,
    );
    await user.click(screen.getAllByRole("button", { name: "sharing.moveSeat" })[0]!);

    expect(screen.queryByLabelText("sharing.targetVacantSeat")).not.toBeInTheDocument();
    expect(screen.getByText("sharing.selectAccountBeforeSeat")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "sharing.targetAccount" }));
    const accountSearch = screen.getByPlaceholderText("sharing.searchTargetAccount");
    await user.type(accountSearch, "1");
    expect(screen.queryByText("Netflix #18 · netflix18@example.com")).not.toBeInTheDocument();
    await user.clear(accountSearch);
    await user.type(accountSearch, "18");
    await user.click(screen.getByText("Netflix #18 · netflix18@example.com"));

    expect(screen.getByLabelText("sharing.targetVacantSeat")).toBeInTheDocument();
  });
});

describe("getSeatExpiryUrgency", () => {
  it.each([
    ["2026-09-30", "danger", -1],
    ["2026-10-01", "danger", 0],
    ["2026-10-04", "danger", 3],
    ["2026-10-05", "warning", 4],
    ["2026-10-08", "warning", 7],
    ["2026-10-09", "default", 8],
  ] as const)("classifies %s as %s", (expiresAt, tone, daysUntilExpiry) => {
    expect(getSeatExpiryUrgency("2026-10-01", expiresAt)).toEqual({ tone, daysUntilExpiry });
  });
});
