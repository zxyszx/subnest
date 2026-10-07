import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewSzxcnAdminPanel } from "@/components/newszxcn-admin-panel";

const mocks = vi.hoisted(() => ({ getConfig: vi.fn(), mailboxes: vi.fn(), links: vi.fn(), folders: vi.fn() }));
vi.mock("@/services/newszxcn-service", () => ({ newszxcnService: mocks }));
vi.mock("@/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

function renderPanel() {
  return render(<QueryClientProvider client={new QueryClient()}><NewSzxcnAdminPanel showHeader={false} /></QueryClientProvider>);
}

describe("NewSzxcnAdminPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockResolvedValue({ integration: { baseUrl: "https://mail.example.test" } });
    mocks.mailboxes.mockResolvedValue({ items: [{ id: "mailbox-1", address: "netflix01@example.test" }] });
    mocks.links.mockResolvedValue({ links: [{ id: "link-1", mailboxId: "mailbox-1", mailboxAddress: "netflix01@example.test", shortUrl: "https://example.test/s/key", folderIds: ["inbox", "custom"], windowMinutes: 30, expiresAt: null, status: "active", createdAt: "2026-10-07", updatedAt: "2026-10-07" }] });
    mocks.folders.mockResolvedValue({ items: [{ id: "inbox", name: "Inbox", role: "inbox" }, { id: "custom", name: "Netflix" }] });
  });

  it("shows selected folder names in the list and uses the management action label", async () => {
    renderPanel();
    expect(await screen.findByText("已分享 · 收件箱、Netflix · 最近 30 分钟")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "管理分享" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "共享收件箱" })).not.toBeInTheDocument();
  });

  it("shows a concise summary before editing an existing share", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "管理分享" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("当前分享")).toBeInTheDocument();
    expect(within(dialog).getByText("收件箱、Netflix")).toBeInTheDocument();
    expect(within(dialog).queryByText("访问范围")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "更改访问范围" }));
    expect(within(dialog).getByText("访问范围")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "保存更改" })).toBeDisabled();
  });

  it("opens an unshared mailbox directly in setup mode", async () => {
    mocks.links.mockResolvedValue({ links: [] });
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "管理分享" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("访问范围")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "开启分享" })).toBeDisabled();
    expect(within(dialog).queryByText("当前分享")).not.toBeInTheDocument();
  });
});
