import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharingAccount } from "@renewlet/shared/schemas/sharing";
import { SharingInboxLinksDialog } from "./sharing-inbox-links-dialog";

const mocks = vi.hoisted(() => ({ session: { user: { role: "admin" } }, mailboxes: vi.fn(), links: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: mocks.session }) } }));
vi.mock("@/services/newszxcn-service", () => ({ newszxcnService: mocks }));
vi.mock("@/components/seat-inbox-links-dialog", () => ({ SeatInboxLinksDialog: ({ boundAccount, mailbox }: { boundAccount: SharingAccount; mailbox: { address: string } }) => <div>{boundAccount.id} · {mailbox.address}</div> }));
const account = { id: "target-account", loginAccount: "TARGET@example.test", accountNumber: 17, subscription: { platformName: "Netflix" } } as SharingAccount;
describe("SharingInboxLinksDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.user.role = "admin";
    mocks.mailboxes.mockResolvedValue({ items: [{ id: "other", address: "other@example.test" }, { id: "target", address: "target@example.test" }] });
    mocks.links.mockResolvedValue({ links: [] });
  });
  it("matches the selected account mailbox case insensitively", async () => {
    render(<SharingInboxLinksDialog account={account} onClose={vi.fn()} />);
    expect(await screen.findByText("target-account · target@example.test")).toBeInTheDocument();
  });
  it("does not request admin APIs for non-admin users", () => {
    mocks.session.user.role = "user";
    render(<SharingInboxLinksDialog account={account} onClose={vi.fn()} />);
    expect(screen.getByText(/仅限管理员/)).toBeInTheDocument();
    expect(mocks.links).not.toHaveBeenCalled();
    expect(mocks.mailboxes).not.toHaveBeenCalled();
  });
  it("reports an unmatched mailbox without falling back to another one", async () => {
    mocks.mailboxes.mockResolvedValue({ items: [{ id: "other", address: "other@example.test" }] });
    render(<SharingInboxLinksDialog account={account} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("尚未匹配到邮箱"));
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});
