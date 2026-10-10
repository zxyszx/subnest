import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnlineTotpAccountRow } from "@/pages/online-totp";
import type { OnlineTotpAccount } from "@renewlet/shared/schemas/online-totp";

vi.mock("@/i18n/I18nProvider", () => ({
  useI18n: () => ({
    locale: "zh-CN",
    t: (key: string) => ({
      "subscription.card.expandDetails": "展开全部信息",
      "subscription.card.collapseDetails": "收起全部信息",
      "sharing.copyLink": "复制链接",
      "common.edit": "编辑",
    }[key] ?? key),
  }),
}));

const account: OnlineTotpAccount = {
  id: "totp-1",
  platformName: "PrimeVideo",
  serviceName: "PrimeVideo",
  accountNumber: 2,
  account: "primevideo01@example.com",
  logo: null,
  code: "123456",
  validUntil: "2099-01-01T00:00:00.000Z",
  enabled: true,
  sharingEnabled: true,
  sharePath: "/s/example",
  createdAt: "2026-10-10T00:00:00.000Z",
  updatedAt: "2026-10-10T00:00:00.000Z",
};

describe("OnlineTotpAccountRow", () => {
  it("keeps mobile secondary actions collapsed until requested", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    const onEdit = vi.fn();
    render(<OnlineTotpAccountRow account={account} onCopy={onCopy} onEdit={onEdit} />);

    expect(screen.getAllByText("PrimeVideo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("primevideo01@example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("123 456").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "编辑" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "分享链接" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "展开全部信息" }));
    expect(screen.getByRole("button", { name: "收起全部信息" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", { name: "编辑" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "分享链接" })).toHaveLength(2);
  });
});
