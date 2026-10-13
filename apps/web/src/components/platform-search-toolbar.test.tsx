import { render, screen, within } from "@testing-library/react";
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

  it("promotes an active overflow platform into the visible bar", async () => {
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

    expect(screen.getByRole("button", { name: "Spotify" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "更多" }));
    expect(within(screen.getByRole("menu")).queryByRole("menuitem", { name: /Spotify/ })).not.toBeInTheDocument();
  });

  it("expands the compact search control and keeps it open while it has a value", async () => {
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

    const searchButton = screen.getByRole("button", { name: "搜索平台" });
    expect(searchButton.closest("[data-search-expanded]")).toHaveAttribute("data-search-expanded", "false");
    await user.click(searchButton);

    const input = screen.getByRole("searchbox", { name: "搜索平台" });
    expect(input).toHaveFocus();
    expect(input.closest("[data-search-expanded]")).toHaveAttribute("data-search-expanded", "true");

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
    expect(input.closest("[data-search-expanded]")).toHaveAttribute("data-search-expanded", "true");
  });
});
