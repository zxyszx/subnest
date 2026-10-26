import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CopyButton } from "./copy-button";

const mocks = vi.hoisted(() => ({ copy: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/shared/browser/clipboard", () => ({ copyTextToClipboard: mocks.copy }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));

describe("CopyButton", () => {
  it("reads a credential only on request and prevents overlapping copies", async () => {
    let resolve!: (value: string) => void;
    const getValue = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    mocks.copy.mockResolvedValue({ ok: true });
    render(<CopyButton label="复制密码" getValue={getValue} />);
    expect(getValue).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "复制密码" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(getValue).toHaveBeenCalledTimes(1);
    await act(async () => resolve("test-only-value"));
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(mocks.copy).toHaveBeenCalledWith("test-only-value");
    expect(mocks.success).toHaveBeenCalledWith("已复制");
  });

  it("reports clipboard failure without a success confirmation and permits retry", async () => {
    mocks.copy.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    render(<CopyButton label="复制网站" value="https://example.test" showLabel />);
    const button = screen.getByRole("button", { name: "复制网站" });
    fireEvent.click(button);
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("复制失败"));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveTextContent("已复制"));
    expect(mocks.copy).toHaveBeenCalledTimes(2);
  });
});
