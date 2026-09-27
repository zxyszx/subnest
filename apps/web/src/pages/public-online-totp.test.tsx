import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicOnlineTotpPage from "./public-online-totp";

const mocks = vi.hoisted(() => ({
  copy: vi.fn(),
  publicAccount: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("react-router", () => ({ useParams: () => ({ shareKey: "share-key" }) }));
vi.mock("@/services/online-totp-service", () => ({
  onlineTotpService: { publicAccount: mocks.publicAccount },
}));
vi.mock("@/shared/browser/clipboard", () => ({ copyTextToClipboard: mocks.copy }));
vi.mock("@/components/ui/sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));
vi.mock("@/hooks/use-system-color-scheme", () => ({ useSystemColorScheme: vi.fn() }));
vi.mock("@/components/subscription-logo", () => ({
  SubscriptionLogo: ({ name }: { name: string }) => <div data-testid="subscription-logo">{name}</div>,
}));
vi.mock("@/i18n/I18nProvider", () => ({
  useI18n: () => ({
    locale: "zh-CN",
    t: (key: string) => ({
      "sharing.copyAccount": "复制账号",
      "sharing.copyFailed": "复制失败",
      "sharing.copySuccess": "已复制",
    }[key] ?? key),
  }),
}));

describe("PublicOnlineTotpPage", () => {
  beforeEach(() => {
    mocks.copy.mockReset().mockResolvedValue({ ok: true });
    mocks.toastSuccess.mockReset();
    mocks.publicAccount.mockReset().mockResolvedValue({
      platformName: "PrimeVideo",
      serviceName: "PrimeVideo",
      account: "member@example.com",
      logo: null,
      code: "123456",
      validUntil: "2099-01-01T00:00:00.000Z",
    });
  });

  it("hides a duplicate service name and shows inline copy confirmation", async () => {
    const user = userEvent.setup();
    render(<PublicOnlineTotpPage />);

    await screen.findByRole("button", { name: "复制验证码" });
    expect(screen.getAllByText("PrimeVideo")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "复制验证码" }));
    expect(mocks.copy).toHaveBeenCalledWith("123456");
    await waitFor(() => expect(screen.getByRole("button", { name: "复制验证码" })).toHaveTextContent("已复制"));

    await user.click(screen.getByRole("button", { name: /member@example.com/ }));
    expect(mocks.copy).toHaveBeenCalledWith("member@example.com");
    await waitFor(() => expect(screen.getByRole("button", { name: /member@example.com/ })).toHaveTextContent("已复制"));
  });
});
