import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { SubscriptionFamilySharingFields } from "@/components/subscription-family-sharing-fields";
import type { FamilySharingFormState } from "@/types/subscription-form";

const mocks = vi.hoisted(() => ({ mailboxes: vi.fn(), links: vi.fn(), create: vi.fn(), revoke: vi.fn(), totpList: vi.fn() }));
vi.mock("@/services/online-totp-service", () => ({ onlineTotpService: { list: mocks.totpList } }));
vi.mock("@/services/newszxcn-service", () => ({ newszxcnService: mocks }));
vi.mock("@/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

function Harness({ onPendingChange = vi.fn(), showEnabledControl = true, verificationLink = "", occupiedSeats = 0 }: {
  onPendingChange?: (pending: boolean) => void;
  showEnabledControl?: boolean;
  verificationLink?: string;
  occupiedSeats?: number;
}) {
  const [value, setValue] = useState<FamilySharingFormState>({ enabled: true, occupiedSeats, loginAccount: "netflix16@example.com", password: "saved-password", hasPassword: true, passwordMask: "s***d", verificationLink, capacity: "5" });
  return <MemoryRouter><SubscriptionFamilySharingFields id={(name) => `test-${name}`} value={value} onChange={setValue} onShareSetupPendingChange={onPendingChange} showEnabledControl={showEnabledControl} /></MemoryRouter>;
}

describe("SubscriptionFamilySharingFields isolated seat sharing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mailboxes.mockResolvedValue({ items: [{ id: "mailbox-16", address: "netflix16@example.com" }] });
    mocks.links.mockResolvedValue({ links: [{ id: "generic", mailboxId: "mailbox-16", status: "active", folderIds: ["inbox"], windowMinutes: 30 }] });
    mocks.totpList.mockResolvedValue({ accounts: [{ id: "otp16", account: "NETFLIX16@example.com", platformName: "Netflix", accountNumber: 16, enabled: true }] });
  });
  it("keeps the master switch out of the focused editor", () => {
    render(<Harness showEnabledControl={false} />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByLabelText("subscription.familySharing.loginAccount")).toHaveValue("netflix16@example.com");
    expect(screen.getByLabelText("subscription.familySharing.capacity")).toHaveValue(5);
  });
  it("uses a master switch and only shows verification methods while sharing is enabled", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const masterSwitch = screen.getByRole("switch", { name: "subscription.familySharing.title" });
    expect(masterSwitch).toBeChecked();
    expect(screen.getByRole("radio", { name: "sharing.emailMethod" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "sharing.totpMethod" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "sharing.disabledMethod" })).not.toBeInTheDocument();

    await user.click(masterSwitch);
    expect(masterSwitch).not.toBeChecked();
    expect(screen.queryByRole("radio", { name: "sharing.emailMethod" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "sharing.totpMethod" })).not.toBeInTheDocument();
  });
  it("prevents disabling family sharing until every seat is vacant", () => {
    render(<Harness occupiedSeats={2} />);
    expect(screen.getByRole("switch", { name: "subscription.familySharing.title" })).toBeDisabled();
    expect(screen.getByText("subscription.familySharing.disableBlocked")).toBeInTheDocument();
  });
  it("selects a mailbox in place and reuses its configured general link", async () => {
    const pending = vi.fn();
    render(<Harness onPendingChange={pending} />);
    await waitFor(() => expect(mocks.mailboxes).toHaveBeenCalled());
    expect(mocks.links).toHaveBeenCalled();
    expect(screen.getByText("sharing.mailboxLinkReady")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "sharing.mailboxSelection" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "sharing.manageGenericMailbox" })).not.toBeInTheDocument();
    await waitFor(() => expect(pending).toHaveBeenLastCalledWith(false));
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(pending).toHaveBeenLastCalledWith(false);
  });
  it("allows saving a selected mailbox when a general link must be created", async () => {
    const pending = vi.fn();
    mocks.links.mockResolvedValue({ links: [] });
    render(<Harness onPendingChange={pending} />);
    expect(await screen.findByText("sharing.mailboxLinkWillCreate")).toBeInTheDocument();
    await waitFor(() => expect(pending).toHaveBeenLastCalledWith(false));
  });
  it("preserves an external verification link and allows clearing it", async () => {
    const user = userEvent.setup();
    render(<Harness showEnabledControl={false} verificationLink="https://example.com/otp" />);
    const input = screen.getByDisplayValue("https://example.com/otp");
    await waitFor(() => expect(mocks.mailboxes).toHaveBeenCalled());
    expect(input).toHaveValue("https://example.com/otp");
    await user.click(screen.getByRole("button", { name: "sharing.clearInboxLink" }));
    expect(input).toHaveValue("");
  });
  it("keeps link controls out of the subscription family settings", async () => {
    render(<Harness verificationLink="https://example.com/otp" />);
    await waitFor(() => expect(mocks.mailboxes).toHaveBeenCalled());
    expect(screen.queryByDisplayValue("https://example.com/otp")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "sharing.mailboxSelection" })).toBeInTheDocument();
  });
  it("retains password generation and visibility controls", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("subscription.familySharing.password");
    expect(input).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "subscription.familySharing.generatePassword" }));
    expect(input).toHaveAttribute("type", "text");
    expect(input).not.toHaveValue("saved-password");
  });
  it("selects exactly one verification method and matches the existing 2FA account", async () => {
    const user = userEvent.setup(); render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "sharing.totpMethod" }));
    expect(screen.getByRole("radio", { name: "sharing.emailMethod" })).not.toBeChecked();
    expect(await screen.findByText("sharing.totpMatchedNetflix #16")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("subscription.familySharing.loginAccount"));
    await user.type(screen.getByLabelText("subscription.familySharing.loginAccount"), "unmatched@example.com");
    expect(screen.getByText("sharing.totpMissing")).toBeInTheDocument();
  });
  it("does not choose an arbitrary key when multiple records match", async () => {
    mocks.totpList.mockResolvedValue({ accounts: [1,2].map((number) => ({ id: `otp${number}`, account: "netflix16@example.com", platformName: "Netflix", accountNumber: number, enabled: true })) });
    const user = userEvent.setup(); render(<Harness />);
    await user.click(screen.getByRole("radio", { name: "sharing.totpMethod" }));
    expect(await screen.findByRole("combobox", { name: "sharing.totpRecord" })).toHaveValue("");
  });
});
