import { useCallback, useEffect, useRef, useState } from "react";
import { systemService } from "@/services/system-service";

const RESTART_DELAY_MS = 8_000;
const RECOVERY_TIMEOUT_MS = 90_000;

/** Countdown measures elapsed wall time; zero means checking recovery, never completion. */
export function useRestartRecovery(reload: () => void) {
  const [phase, setPhase] = useState<"idle" | "countdown" | "waiting" | "timeout">("idle");
  const [seconds, setSeconds] = useState(0);
  const runRef = useRef<AbortController | null>(null);
  useEffect(() => () => runRef.current?.abort(), []);

  const start = useCallback((targetVersion: string | null, restart: () => Promise<unknown>) => {
    if (runRef.current && !runRef.current.signal.aborted) return;
    const controller = new AbortController();
    runRef.current = controller;
    const { signal } = controller;
    const deadline = Date.now() + RESTART_DELAY_MS;
    setPhase("countdown");
    setSeconds(8);
    // Disconnection while the old process exits is expected. Recovery is verified separately.
    void restart().catch(() => undefined);
    const wait = (ms: number) => new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
      const timer = setTimeout(done, ms);
      signal.addEventListener("abort", done, { once: true });
    });
    void (async () => {
      while (!signal.aborted && Date.now() < deadline) {
        await wait(250);
        if (!signal.aborted) setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
      }
      if (signal.aborted) return;
      setPhase("waiting");
      const recoveryDeadline = Date.now() + RECOVERY_TIMEOUT_MS;
      while (!signal.aborted && Date.now() < recoveryDeadline) {
        try {
          const response = await fetch("/api/app/health", { cache: "no-cache", signal: AbortSignal.any([signal, AbortSignal.timeout(3_000)]) });
          if (response.ok) {
            const version = await systemService.version(false, AbortSignal.any([signal, AbortSignal.timeout(3_000)]));
            if (!signal.aborted && (!targetVersion || version.currentVersion === targetVersion)) {
              controller.abort();
              reload();
              return;
            }
          }
        } catch { /* Keep waiting through process exit and proxy failures. */ }
        await wait(1_000);
      }
      if (!signal.aborted) { controller.abort(); setPhase("timeout"); }
    })();
  }, [reload]);
  return { phase, seconds, start, busy: phase === "countdown" || phase === "waiting" };
}
