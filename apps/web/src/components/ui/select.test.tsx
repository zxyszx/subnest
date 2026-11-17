import userEvent from "@testing-library/user-event";
// Select primitive 测试保护桌面/移动端分流和滚动按钮隐藏策略，避免 Radix 默认行为破坏 H5 布局。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { mockMobileOverlayMatch, resetMobileOverlayTestEnvironment } from "@/components/ui/mobile-overlay.test-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

async function finishMobileSheetExit() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
}

function SelectWithOptions({ count }: { count: number }) {
  return (
    <Select open value="item-0">
      <SelectTrigger aria-label="测试选择">
        <SelectValue />
      </SelectTrigger>
      <SelectContent data-testid="select-sheet">
        {Array.from({ length: count }, (_, index) => (
          <SelectItem key={index} value={`item-${index}`} disabled={index === count - 1}>
            选项 {index}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

describe("Select mobile sheet", () => {
  beforeEach(() => {
    mockMobileOverlayMatch();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetMobileOverlayTestEnvironment();
  });

  it("keeps the selected value visible while the mobile sheet is closed", () => {
    render(
      <Select value="item-0">
        <SelectTrigger aria-label="测试选择">
          <SelectValue />
        </SelectTrigger>
        <SelectContent data-testid="select-sheet">
          <SelectItem value="item-0">选项 0</SelectItem>
          <SelectItem value="item-1">选项 1</SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByRole("combobox", { name: "测试选择" })).toHaveTextContent("选项 0");
    expect(screen.queryByTestId("select-sheet")).not.toBeInTheDocument();
  });

  it("uses textValue for the closed trigger label when option children are not plain text", () => {
    render(
      <Select value="complex">
        <SelectTrigger aria-label="复杂选择">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="complex" textValue="自定义文本">
            <span aria-hidden="true">#</span>
            <span>节点文本</span>
          </SelectItem>
        </SelectContent>
      </Select>,
    );

    expect(screen.getByRole("combobox", { name: "复杂选择" })).toHaveTextContent("自定义文本");
  });

  it("uses compact detent for short option lists", async () => {
    render(<SelectWithOptions count={2} />);

    const sheet = await screen.findByTestId("select-sheet");
    expect(sheet).toHaveAttribute("data-vaul-drawer");
    expect(sheet).toHaveAttribute("data-mobile-detent", "compact");
    expect(sheet).toHaveClass("h5-mobile-sheet-compact");
    expect(sheet.querySelector("[data-vaul-handle]")).not.toBeNull();
    expect(screen.getByRole("option", { name: "选项 1" })).toHaveClass("h5-mobile-option-item");
    expect(screen.getByRole("option", { name: "选项 1" })).toHaveClass("h5-mobile-option-item-leading");
    expect(screen.getByRole("option", { name: "选项 1" })).toHaveAttribute("data-disabled");
  });

  it("uses large detent for long option lists", async () => {
    render(<SelectWithOptions count={20} />);

    const sheet = await screen.findByTestId("select-sheet");
    expect(sheet).toHaveAttribute("data-vaul-drawer");
    expect(sheet).toHaveAttribute("data-mobile-detent", "large");
    expect(sheet).toHaveClass("h5-mobile-sheet-large");
  });

  it("keeps a form select anchored and returns to the form after choosing", async () => {
    const underlayClick = vi.fn();

    function Harness() {
      const [selectOpen, setSelectOpen] = React.useState(true);

      return (
        <Dialog open>
          <DialogContent>
            <DialogTitle>添加新订阅</DialogTitle>
            <DialogDescription className="sr-only">测试选择器背景点击。</DialogDescription>
            <button type="button" onClick={underlayClick}>
              支付方式
            </button>
            <Select open={selectOpen} onOpenChange={setSelectOpen} defaultValue="alipay">
              <SelectTrigger aria-label="支付方式">
                <SelectValue />
              </SelectTrigger>
              <SelectContent data-testid="payment-select-sheet">
                <SelectItem value="alipay">支付宝</SelectItem>
                <SelectItem value="wechat">微信支付</SelectItem>
              </SelectContent>
            </Select>
          </DialogContent>
        </Dialog>
      );
    }

    render(<Harness />);

    const sheet = await screen.findByTestId("payment-select-sheet");
    expect(sheet.closest("[data-mobile-overlay-portal]")).toBeNull();
    expect(sheet).not.toHaveAttribute("data-vaul-drawer");
    const user = userEvent.setup();
    await user.click(screen.getByRole("option", { name: "微信支付" }));
    await waitFor(() => expect(screen.queryByTestId("payment-select-sheet")).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "添加新订阅" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "支付方式" })).toHaveTextContent("微信支付");
    expect(underlayClick).not.toHaveBeenCalled();
  });

  it("keeps the select sheet mounted for the exit animation after selecting an item", async () => {
    const onValueChange = vi.fn();

    render(
      <Select defaultOpen value="alipay" onValueChange={onValueChange}>
        <SelectTrigger aria-label="支付方式">
          <SelectValue />
        </SelectTrigger>
        <SelectContent data-testid="payment-select-sheet">
          <SelectItem value="alipay">支付宝</SelectItem>
          <SelectItem value="wechat">微信支付</SelectItem>
        </SelectContent>
      </Select>,
    );

    await screen.findByTestId("payment-select-sheet");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("option", { name: "微信支付" }));

    expect(onValueChange).toHaveBeenCalledWith("wechat");
    expect(screen.getByTestId("payment-select-sheet")).toHaveAttribute("data-state", "closed");
    await finishMobileSheetExit();
    expect(screen.queryByTestId("payment-select-sheet")).not.toBeInTheDocument();
  });

  it("does not keep the legacy CSS-only mobile sheet implementation", () => {
    const overlaySource = readFileSync(join(process.cwd(), "src/components/ui/mobile-overlay.tsx"), "utf8");
    const utilitiesSource = readFileSync(join(process.cwd(), "src/styles/utilities.css"), "utf8");
    const legacyOverlaySymbols = [
      ["MobileOverlay", "Backdrop"].join(""),
      ["handleMobileOverlay", "OutsideEvent"].join(""),
      ["isMobileOverlay", "BackdropTarget"].join(""),
      ["stopMobileOverlay", "BackdropEvent"].join(""),
      ["useHasActiveMobileOverlay", "Backdrop"].join(""),
    ];
    const legacySheetPseudo = [".h5-mobile-sheet-content", "::before"].join("");
    const legacySheetIn = ["h5-mobile-sheet", "in"].join("-");
    const legacySheetOut = ["h5-mobile-sheet", "out"].join("-");

    for (const symbol of legacyOverlaySymbols) {
      expect(overlaySource).not.toContain(symbol);
    }
    expect(utilitiesSource).not.toContain(legacySheetPseudo);
    expect(utilitiesSource).not.toContain(legacySheetIn);
    expect(utilitiesSource).not.toContain(legacySheetOut);
  });
});
