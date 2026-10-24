import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformSearchToolbar } from "@/components/platform-search-toolbar";

const platforms = [
  "PrimeVideo",
  "Netflix",
  "ChatGPT",
  "YouTube",
  "HBO MAX",
  "Spotify",
  "iQIYI",
  "Disney+",
].map((name) => ({ name }));

function setViewportWidth(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width: 1600px")
      ? width >= 1600
      : query.includes("min-width: 1280px")
        ? width >= 1280
        : query.includes("max-width: 767px")
          ? width <= 767
          : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("PlatformSearchToolbar", () => {
  beforeEach(() => {
    setViewportWidth(1378);
  });

  it("keeps platforms beyond the available desktop slots in the more menu", async () => {
    const user = userEvent.setup();
    render(
      <PlatformSearchToolbar
        platforms={platforms}
        selectedPlatform={null}
        onPlatformChange={vi.fn()}
        allLabel="全部平台"
        moreLabel="更多"
        platformAriaLabel="平台筛选"
        searchValue=""
        onSearchChange={vi.fn()}
        searchPlaceholder="搜索"
      />,
    );

    expect(screen.queryByRole("button", { name: "Spotify" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "更多" }));

    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Spotify/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /iQIYI/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Disney\+/ })).toBeInTheDocument();
  });

  it("keeps an active overflow platform available in the menu", async () => {
    const user = userEvent.setup();
    render(
      <PlatformSearchToolbar
        platforms={platforms}
        selectedPlatform="Spotify"
        onPlatformChange={vi.fn()}
        allLabel="全部平台"
        moreLabel="更多"
        platformAriaLabel="平台筛选"
        searchValue="spo"
        onSearchChange={vi.fn()}
        searchPlaceholder="搜索"
      />,
    );

    expect(screen.queryByRole("button", { name: "Spotify" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "更多" }));
    expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: /Spotify/ })).toBeInTheDocument();
  });

  it("moves platforms into overflow when space shrinks and restores them when space returns", async () => {
    let width = 900;
    let resize = () => {};
    const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ width: 100, height: 36, x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 36, toJSON: () => ({}) }));
    vi.stubGlobal("ResizeObserver", class {
      constructor(private callback: () => void) {}
      observe(target: Element) {
        if (target.tagName === "NAV") resize = this.callback;
      }
      disconnect() {}
    });
    try {
      render(<PlatformSearchToolbar platforms={platforms} selectedPlatform={null} onPlatformChange={vi.fn()} allLabel="全部平台" moreLabel="更多" platformAriaLabel="平台筛选" searchValue="" onSearchChange={vi.fn()} searchPlaceholder="搜索" />);
      expect(screen.getByRole("button", { name: "Spotify" })).toBeInTheDocument();
      act(() => { width = 600; resize(); });
      expect(screen.queryByRole("button", { name: "Spotify" })).not.toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole("button", { name: "更多" }));
      expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: /Spotify/ })).toBeInTheDocument();
      await userEvent.setup().keyboard("{Escape}");
      act(() => { width = 900; resize(); });
      expect(screen.getByRole("button", { name: "Spotify" })).toBeInTheDocument();
    } finally {
      clientWidth.mockRestore();
      bounds.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("keeps search immediately available and preserves its value after blur", async () => {
    const user = userEvent.setup();
    const handleSearchChange = vi.fn();
    const { rerender } = render(
      <PlatformSearchToolbar
        platforms={platforms}
        selectedPlatform={null}
        onPlatformChange={vi.fn()}
        allLabel="全部平台"
        moreLabel="更多"
        platformAriaLabel="平台筛选"
        searchValue=""
        onSearchChange={handleSearchChange}
        searchPlaceholder="搜索平台"
      />,
    );

    const input = screen.getByRole("searchbox", { name: "搜索平台" });
    await user.click(input);
    expect(input).toHaveFocus();
    await user.type(input, "s");
    expect(handleSearchChange).toHaveBeenCalledOnce();

    rerender(
      <PlatformSearchToolbar
        platforms={platforms}
        selectedPlatform={null}
        onPlatformChange={vi.fn()}
        allLabel="全部平台"
        moreLabel="更多"
        platformAriaLabel="平台筛选"
        searchValue="spo"
        onSearchChange={handleSearchChange}
        searchPlaceholder="搜索平台"
      />,
    );
    input.blur();
    expect(input).toHaveValue("spo");
    expect(input).toBeVisible();
  });
});
