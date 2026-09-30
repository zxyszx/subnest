import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SubscriptionFamilySharingFields } from "@/components/subscription-family-sharing-fields";
import type { FamilySharingFormState } from "@/types/subscription-form";

const mocks = vi.hoisted(() => ({
  mailboxes: vi.fn(),
  links: vi.fn(),
  folders: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("@/services/newszxcn-service", () => ({
  newszxcnService: mocks,
}));

vi.mock("@/i18n/I18nProvider", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function Harness({
  onPendingChange,
  verificationLink = "",
  showEnabledControl = true,
}: {
  onPendingChange: (pending: boolean) => void;
  verificationLink?: string;
  showEnabledControl?: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [value, setValue] = useState<FamilySharingFormState>({
    enabled: true,
    loginAccount: "netflix16@newszxcn.com",
    password: "saved-password",
    hasPassword: true,
    passwordMask: "s***d",
    verificationLink,
    capacity: "5",
  });
  return (
    <QueryClientProvider client={queryClient}>
      <SubscriptionFamilySharingFields
        id={(name) => `test-${name}`}
        value={value}
        onChange={setValue}
        onShareSetupPendingChange={onPendingChange}
        showEnabledControl={showEnabledControl}
      />
    </QueryClientProvider>
  );
}

describe("SubscriptionFamilySharingFields managed mailbox", () => {
  beforeEach(() => {
    mocks.mailboxes.mockResolvedValue({ items: [{ id: "mailbox-16", address: "netflix16@newszxcn.com" }] });
    mocks.links.mockResolvedValue({ links: [] });
    mocks.folders.mockResolvedValue({ items: [
      { id: "folder-inbox", name: "Inbox", role: "inbox", totalCount: 4 },
      { id: "folder-netflix", name: "Netflix", totalCount: 12 },
    ] });
    mocks.create.mockResolvedValue({ link: {
      id: "link-new",
      shortUrl: "https://dingyue.xzys.me/s/new-link",
      mailboxId: "mailbox-16",
      mailboxAddress: "netflix16@newszxcn.com",
      folderIds: ["folder-netflix"],
      windowMinutes: 30,
      expiresAt: null,
      status: "active",
      createdAt: "2026-09-26T00:00:00Z",
      updatedAt: "2026-09-26T00:00:00Z",
    } });
  });

  it("keeps the master switch out of the focused family-sharing editor", async () => {
    render(<Harness onPendingChange={vi.fn()} showEnabledControl={false} />);

    expect(screen.queryByRole("switch", { name: "subscription.familySharing.title" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("subscription.familySharing.loginAccount")).toHaveValue("netflix16@newszxcn.com");
    expect(screen.getByLabelText("subscription.familySharing.capacity")).toHaveValue(5);
    expect(screen.getByLabelText("subscription.familySharing.password")).toBeInTheDocument();
  });

  it("requires an explicit folder selection before creating a managed share", async () => {
    const user = userEvent.setup();
    const onPendingChange = vi.fn();
    render(<Harness onPendingChange={onPendingChange} />);

    const managedSwitch = await screen.findByRole("switch", { name: "开启共享收件箱" });
    await waitFor(() => expect(mocks.folders).toHaveBeenCalledWith("mailbox-16"));
    expect(screen.queryByText("管理")).not.toBeInTheDocument();

    await user.click(managedSwitch);
    const inbox = await screen.findByRole("checkbox", { name: /收件箱/ });
    const netflix = screen.getByRole("checkbox", { name: /Netflix/ });
    expect(inbox).not.toBeChecked();
    expect(netflix).not.toBeChecked();
    expect(screen.getByRole("button", { name: "开启分享" })).toBeDisabled();
    expect(onPendingChange).toHaveBeenLastCalledWith(true);

    await user.click(netflix);
    await user.click(screen.getByRole("button", { name: "开启分享" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      mailboxId: "mailbox-16",
      folderIds: ["folder-netflix"],
      windowMinutes: 30,
    }));
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(false));
  });

  it("resets the active link while preserving its folder scope and time window", async () => {
    const user = userEvent.setup();
    mocks.links.mockResolvedValueOnce({ links: [{
      id: "link-old",
      shortUrl: "https://dingyue.xzys.me/s/old-link",
      mailboxId: "mailbox-16",
      mailboxAddress: "netflix16@newszxcn.com",
      folderIds: ["folder-netflix"],
      windowMinutes: 60,
      expiresAt: null,
      status: "active",
      createdAt: "2026-09-25T00:00:00Z",
      updatedAt: "2026-09-25T00:00:00Z",
    }] });
    render(<Harness onPendingChange={vi.fn()} />);

    expect(await screen.findByText("netflix16@newszxcn.com")).toBeInTheDocument();
    expect(await screen.findByText("Netflix")).toBeInTheDocument();
    const resetButton = await screen.findByRole("button", { name: "重置链接" });
    expect(resetButton.closest("div")).toHaveTextContent("生成新的收件链接，旧链接会立即失效。");
    expect(screen.getByRole("button", { name: "sharing.copyLink" })).toBeInTheDocument();
    await user.click(resetButton);
    await user.click(screen.getByRole("button", { name: "subscription.familySharing.confirmAction" }));

    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith("link-old"));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({
      mailboxId: "mailbox-16",
      folderIds: ["folder-netflix"],
      windowMinutes: 60,
    }));
    expect(screen.getByDisplayValue("https://dingyue.xzys.me/s/new-link")).toBeInTheDocument();
  });

  it("keeps a manually supplied external 2FA link editable for a managed mailbox", async () => {
    const user = userEvent.setup();
    const externalLink = "https://cloudotp.szxcn.qzz.io/s/Vzh0pMa3cxMH";
    mocks.links.mockResolvedValueOnce({ links: [] });
    render(<Harness onPendingChange={vi.fn()} verificationLink={externalLink} />);

    const linkInput = await screen.findByDisplayValue(externalLink);
    expect(linkInput).not.toHaveAttribute("readonly");
    await user.clear(linkInput);
    await user.type(linkInput, "https://cloudotp.szxcn.qzz.io/admin");
    expect(linkInput).toHaveValue("https://cloudotp.szxcn.qzz.io/admin");
  });
});
