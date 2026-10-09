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
const link: SharedInboxLink = { id: "link1", seatId: "seat1", shortUrl: "https://example.test/s/seat1", mailboxId: "mailbox", mailboxAddress: "shared@example.test", folderIds: ["private-folder"], windowMinutes: 60, expiresAt: null, status: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
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
  it("requires a folder, then creates only the chosen permanent seat link", async () => {
    const user = userEvent.setup();
    renderDialog();
    const buttons = await screen.findAllByRole("button", { name: "生成链接" });
    expect(buttons[0]).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "收件箱" }));
    await user.click(buttons[0]!);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ seatId: "seat1", mailboxId: "mailbox", folderIds: ["inbox"], windowMinutes: 30 })));
    expect(mocks.create.mock.calls[0]?.[0]).not.toHaveProperty("expiresAt");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it("inherits the generic link folder scope and rolling window for new seat links", async () => {
    const user = userEvent.setup();
    const generic = { ...link, id: "generic", seatId: null, folderIds: ["inbox"], windowMinutes: 360 };
    renderDialog([generic]);
    await user.click((await screen.findAllByRole("button", { name: "生成链接" }))[0]!);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ seatId: "seat1", folderIds: ["inbox"], windowMinutes: 360 })));
  });
  it("shows the existing seat scope after refresh instead of the generic inbox scope", async () => {
    const generic = { ...link, id: "generic", seatId: null, folderIds: ["inbox"], windowMinutes: 30 };
    const netflixSeatLink = { ...link, folderIds: ["netflix"], windowMinutes: 360 };
    mocks.folders.mockResolvedValue({ items: [{ id: "inbox", role: "inbox", name: "Inbox" }, { id: "netflix", name: "Netflix" }] });
    renderDialog([generic, netflixSeatLink]);
    expect(await screen.findByRole("checkbox", { name: "Netflix" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "收件箱" })).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: "最近可查看邮件范围" })).toHaveTextContent("6 小时");
  });
  it("confirms a single-seat reset and preserves its scope", async () => {
    const user = userEvent.setup();
    renderDialog([link, { ...link, id: "link2", seatId: "seat2" }]);
    await user.click((await screen.findAllByRole("button", { name: "重置" }))[0]!);
    expect(mocks.revoke).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "确认" }));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith("link1"));
    expect(mocks.revoke).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({ seatId: "seat1", mailboxId: "mailbox", folderIds: ["private-folder"], windowMinutes: 60 });
  });
  it("does not offer an expired link for copying", async () => {
    renderDialog([{ ...link, expiresAt: "2020-01-01T00:00:00Z" }]);
    expect(await screen.findByText("链接不可用")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制链接" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重置" })).toBeEnabled();
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
  it("binds the membership entry to its account without loading other accounts", async () => {
    render(<SeatInboxLinksDialog boundAccount={account} mailbox={{ id: "mailbox", address: "shared@example.test" }} links={[]} onClose={vi.fn()} onChanged={mocks.changed} />);
    await screen.findAllByRole("button", { name: "生成链接" });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.detail).toHaveBeenCalledWith("account", expect.any(AbortSignal));
    expect(screen.queryByRole("combobox", { name: "合租账号" })).not.toBeInTheDocument();
  });
  it("enables independent links for occupied seats only", async () => {
    const user = userEvent.setup();
    mocks.detail.mockResolvedValue({ account, seats: [seat, { ...seat, id: "vacant", seatNumber: 2, memberName: null, status: "vacant" }] });
    renderDialog();
    const toggle = await screen.findByRole("switch", { name: "车位邮箱链接共享" });
    expect(toggle).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "收件箱" }));
    await user.click(toggle);
    await waitFor(() => expect(mocks.changed).toHaveBeenCalled());
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ seatId: "seat1" }));
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it("confirms disabling and leaves generic and other account links intact", async () => {
    const user = userEvent.setup();
    renderDialog([link, { ...link, id: "link2", seatId: "seat2" }, { ...link, id: "generic", seatId: null }, { ...link, id: "other", seatId: "other-seat" }]);
    const toggle = await screen.findByRole("switch", { name: "车位邮箱链接共享" });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(mocks.revoke).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "确认" }));
    await waitFor(() => expect(mocks.changed).toHaveBeenCalled());
    expect(mocks.revoke).toHaveBeenCalledTimes(2);
    expect(mocks.revoke).toHaveBeenNthCalledWith(1, "link1");
    expect(mocks.revoke).toHaveBeenNthCalledWith(2, "link2");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
