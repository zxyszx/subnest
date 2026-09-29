import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SharingAccountDetailDialog } from "@/components/sharing-account-detail-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SharingSeat, SharingSeatUpdate } from "@renewlet/shared/schemas/sharing";

const mocks = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
  password: vi.fn(),
  updateSeat: vi.fn<(payload: { seatId: string; input: SharingSeatUpdate }) => Promise<void>>(),
  seats: [] as SharingSeat[],
}));

const account = {
  id: "share-17",
  subscription: { id: "sub-17", name: "Netflix", platformName: "Netflix", logo: null },
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
    mocks.seats = [];
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

    await user.click(screen.getAllByRole("button", { name: "sharing.editSeat" })[0]!);
    expect(screen.getByRole("button", { name: "sharing.monthly" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sharing.quarterly" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sharing.semiAnnual" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sharing.annual" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sharing.custom" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "sharing.twoMonths" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "sharing.customMonths" })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("textbox", { name: "sharing.periodCharge" }));
    await user.type(screen.getByRole("textbox", { name: "sharing.periodCharge" }), "15");
    await user.click(screen.getByRole("button", { name: "sharing.quarterly" }));
    await user.click(screen.getByRole("combobox", { name: "sharing.contactType" }));
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
});
