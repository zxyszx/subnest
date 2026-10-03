import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharingAccount, SharingSeat } from "@renewlet/shared/schemas/sharing";
import { SeatInboxLinksDialog } from "./seat-inbox-links-dialog";
import type { SharedInboxLink } from "@/services/newszxcn-service";

const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), folders: vi.fn(), create: vi.fn(), revoke: vi.fn(), changed: vi.fn(), clipboard: vi.fn() }));
vi.mock("@/services/sharing-service", () => ({ sharingService: mocks }));
vi.mock("@/services/newszxcn-service", () => ({ newszxcnService: mocks }));
vi.mock("@/shared/browser/clipboard", () => ({ copyTextToClipboard: mocks.clipboard }));

const account: SharingAccount = {
  id: "account", subscription: { id: "subscription", name: "Netflix", platformName: "Netflix", logo: null, status: "active" }, name: "Netflix", accountNumber: 17, loginAccount: "shared@example.test", hasPassword: true, verificationLink: null,
  monthlyCost: "10", currency: "CNY", nextBillingDate: "2099-01-01", paymentMethod: null, cardLast4: null, capacity: 2, occupiedSeats: 2, monthlyRevenue: "10", monthlyRevenueByCurrency: { CNY: "10" }, outstandingAmount: "0", monthlyProfit: 0, status: "active", notes: null, createdAt: "2026-01-01",
};
const seat: SharingSeat = { id: "seat1", seatNumber: 1, memberName: "Alice", contact: null, contactType: null, monthlyPrice: "5", currency: "CNY", billingMonths: 1, startDate: "2026-01-01", expiresAt: "2099-01-01", status: "active", notes: null, currentReceivable: null };
const link: SharedInboxLink = { id: "link1", seatId: "seat1", shortUrl: "https://example.test/s/seat1", mailboxId: "mailbox", mailboxAddress: "shared@example.test", folderIds: ["private-folder"], windowMinutes: 60, expiresAt: "2099-01-01T12:00:00Z", status: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
function renderDialog(links: SharedInboxLink[] = []) {
  return render(<SeatInboxLinksDialog mailbox={{ id: "mailbox", address: "shared@example.test" }} links={links} onClose={vi.fn()} onChanged={mocks.changed} />);
}
describe("SeatInboxLinksDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ accounts: [account] });
    mocks.detail.mockResolvedValue({ account, seats: [seat, { ...seat, id: "seat2", seatNumber: 2, memberName: "Bob" }] });
    mocks.folders.mockResolvedValue({ items: [{ id: "inbox", role: "inbox", name: "Inbox" }] });
    mocks.create.mockResolvedValue({ link: { ...link, id: "replacement", shortUrl: "https://example.test/s/replacement" } });
    mocks.revoke.mockResolvedValue({});
    mocks.changed.mockResolvedValue(undefined);
    mocks.clipboard.mockResolvedValue({ ok: true });
  });
  it("requires a folder and future expiry, then creates only the chosen seat", async () => {
    const user = userEvent.setup();
    renderDialog();
    const buttons = await screen.findAllByRole("button", { name: "生成链接" });
    expect(buttons[0]).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "收件箱" }));
    await user.click(buttons[0]!);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ seatId: "seat1", mailboxId: "mailbox", folderIds: ["inbox"], windowMinutes: 30 })));
    const payload = mocks.create.mock.calls[0]?.[0] as { expiresAt: string };
    expect(Date.parse(payload.expiresAt)).toBeGreaterThan(Date.now());
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it("confirms a single-seat reset and preserves its scope and expiry", async () => {
    const user = userEvent.setup();
    renderDialog([link, { ...link, id: "link2", seatId: "seat2" }]);
    await user.click((await screen.findAllByRole("button", { name: "重置" }))[0]!);
    expect(mocks.revoke).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "确认" }));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith("link1"));
    expect(mocks.revoke).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({ seatId: "seat1", mailboxId: "mailbox", folderIds: ["private-folder"], windowMinutes: 60, expiresAt: "2099-01-01T12:00:00.000Z" });
  });
  it("does not offer an expired link for copying", async () => {
    renderDialog([{ ...link, expiresAt: "2020-01-01T00:00:00Z" }]);
    expect(await screen.findByText("链接不可用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制链接" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重置" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled();
  });
  it("refreshes and removes the revoked link if replacement creation fails", async () => {
    const user = userEvent.setup();
    mocks.create.mockRejectedValue(new Error("creation failed"));
    renderDialog([link]);
    await user.click(await screen.findByRole("button", { name: "重置" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "确认" }));
    await waitFor(() => expect(mocks.changed).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "复制链接" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "生成链接" })).toHaveLength(2);
  });
});
