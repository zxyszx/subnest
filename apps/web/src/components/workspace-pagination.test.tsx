import { renderHook, act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  WorkspacePagination,
  useWorkspacePagination,
} from "./workspace-pagination";
import { WorkspaceQuickFilters } from "./workspace-quick-filters";

describe("workspace pagination", () => {
  it("pages the filtered collection, resets on filter changes and clamps deleted pages", () => {
    const { result, rerender } = renderHook(
      ({ items, key }) => useWorkspacePagination(items, key, 2),
      { initialProps: { items: [1, 2, 3, 4, 5], key: "all" } },
    );
    act(() => result.current.onPageChange(3));
    expect(result.current.items).toEqual([5]);
    rerender({ items: [1, 2, 3], key: "all" });
    expect(result.current.page).toBe(2);
    rerender({ items: [5], key: "search:5" });
    expect(result.current.page).toBe(1);
    expect(result.current.items).toEqual([5]);
    rerender({ items: [1, 2, 3, 4, 5], key: "all" });
    expect(result.current.page).toBe(1);
  });
  it("disables navigation for an empty collection", () => {
    render(
      <WorkspacePagination
        page={1}
        pages={1}
        total={0}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
  });
  it("does not hijack shortcuts while typing or editing a dialog", () => {
    const onChange = vi.fn();
    render(
      <>
        <input aria-label="search" />
        <WorkspaceQuickFilters
          value="all"
          options={[
            { value: "all", label: "All" },
            { value: "available", label: "Available" },
          ]}
          onChange={onChange}
        />
      </>,
    );
    screen
      .getByRole("textbox")
      .dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Digit2",
          altKey: true,
          bubbles: true,
        }),
      );
    expect(onChange).not.toHaveBeenCalled();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "Digit2", altKey: true }),
    );
    expect(onChange).toHaveBeenCalledWith("available");
  });
});
