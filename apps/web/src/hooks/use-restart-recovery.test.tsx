import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { systemService } from "@/services/system-service";
import { useRestartRecovery } from "./use-restart-recovery";

vi.mock("@/services/system-service", () => ({ systemService: { version: vi.fn() } }));

describe("restart recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, "fetch").mockResolvedValue({ ok: true } as Response);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("starts counting immediately even when the restart request disconnects, and waits for the target version", async () => {
    vi.mocked(systemService.version).mockResolvedValue({ currentVersion: "1.0.0" } as Awaited<ReturnType<typeof systemService.version>>);
    const reload = vi.fn();
    const restart = vi.fn().mockRejectedValue(new Error("connection closed"));
    const { result } = renderHook(() => useRestartRecovery(reload));
    act(() => result.current.start("1.1.0", restart));
    expect(result.current.seconds).toBe(8);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(result.current.seconds).toBe(5);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(result.current.phase).toBe("waiting");
    expect(reload).not.toHaveBeenCalled();
    vi.mocked(systemService.version).mockResolvedValue({ currentVersion: "1.1.0" } as Awaited<ReturnType<typeof systemService.version>>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reports a timeout instead of claiming success when only the old service is available", async () => {
    vi.mocked(systemService.version).mockResolvedValue({ currentVersion: "1.0.0" } as Awaited<ReturnType<typeof systemService.version>>);
    const reload = vi.fn();
    const { result } = renderHook(() => useRestartRecovery(reload));
    act(() => result.current.start("1.1.0", () => Promise.resolve()));
    await act(async () => { await vi.advanceTimersByTimeAsync(98_000); });
    expect(result.current.phase).toBe("timeout");
    expect(result.current.busy).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("cancels recovery checks when the page unmounts", async () => {
    const reload = vi.fn();
    const { result, unmount } = renderHook(() => useRestartRecovery(reload));
    act(() => result.current.start("1.1.0", () => Promise.resolve()));
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(100_000); });
    expect(window.fetch).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
