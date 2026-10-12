import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nProvider";
import type { SharingSeatDisplayState } from "@/lib/sharing-seat-state";

interface SharingSeatOccupancyProps {
  occupied: number;
  capacity: number;
  seatTones?: readonly SharingSeatTone[];
  seatStates?: readonly SharingSeatDisplayState[];
  showStateSummary?: boolean;
}

export type SharingSeatTone = "vacant" | "normal" | "warning" | "danger";

export function sharingSeatExpiryTone(daysUntilExpiry: number): Exclude<SharingSeatTone, "vacant"> {
  if (daysUntilExpiry <= 3) return "danger";
  if (daysUntilExpiry <= 7) return "warning";
  return "normal";
}

const toneClasses: Record<SharingSeatTone, string> = {
  vacant: "bg-muted-foreground/20",
  normal: "bg-primary",
  warning: "bg-warning",
  danger: "bg-destructive",
};

const stateClasses: Record<SharingSeatDisplayState, string> = {
  active: "bg-primary",
  expired: "bg-destructive",
  paused: "bg-warning",
  vacant: "bg-muted-foreground/20",
};

export function SharingSeatOccupancy({ occupied, capacity, seatTones, seatStates, showStateSummary = true }: SharingSeatOccupancyProps) {
  const { t } = useI18n();
  const safeCapacity = Math.max(0, capacity);
  const safeOccupied = Math.min(Math.max(0, occupied), safeCapacity);
  const segmented = safeCapacity > 0 && safeCapacity <= 8;
  const percentage = safeCapacity > 0 ? (safeOccupied / safeCapacity) * 100 : 0;
  const normalizedTones = Array.from({ length: safeCapacity }, (_, index): SharingSeatTone => (
    seatTones?.[index] ?? (index < safeOccupied ? "normal" : "vacant")
  ));
  const normalizedStates = Array.from({ length: safeCapacity }, (_, index): SharingSeatDisplayState => (
    seatStates?.[index] ?? (index < safeOccupied ? "active" : "vacant")
  ));
  const stateCounts = normalizedStates.reduce<Partial<Record<SharingSeatDisplayState, number>>>((counts, state) => {
    counts[state] = (counts[state] ?? 0) + 1;
    return counts;
  }, {});
  const labels: Record<SharingSeatDisplayState, string> = {
    active: t("sharing.active"),
    expired: t("sharing.expired"),
    paused: t("sharing.stopped"),
    vacant: t("sharing.vacant"),
  };
  const progressTone = normalizedTones.includes("danger")
    ? "danger"
    : normalizedTones.includes("warning")
      ? "warning"
      : "normal";

  return (
    <div className="grid min-w-32 gap-1.5" aria-label={`${safeOccupied} / ${safeCapacity}`}>
      <span className="text-xs font-semibold tabular-nums text-foreground">{safeOccupied} / {safeCapacity}</span>
      {segmented ? (
        <span className="flex gap-1" data-testid="sharing-seat-segments" aria-hidden="true">
          {normalizedStates.map((state, index) => (
            <span
              key={index}
              data-occupied={state === "active"}
              data-tone={seatStates ? state : normalizedTones[index]}
              data-state={state}
              title={`${t("sharing.seatNumber")} ${index + 1} · ${labels[state]}`}
              className={cn(
                "h-1.5 min-w-0 flex-1 rounded-full transition-colors duration-200",
                seatStates ? stateClasses[state] : toneClasses[normalizedTones[index]!],
              )}
            />
          ))}
        </span>
      ) : (
        <span className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/20" data-testid="sharing-seat-progress" aria-hidden="true">
          <span
            className={cn(
              "block h-full rounded-full transition-transform duration-200 motion-reduce:transition-none",
              toneClasses[progressTone],
            )}
            style={{ transform: `scaleX(${percentage / 100})`, transformOrigin: "left" }}
          />
        </span>
      )}
      {seatStates && showStateSummary ? <span className="flex max-w-44 flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-4 text-muted-foreground">
        {(["active", "expired", "paused", "vacant"] as const).map((state) => stateCounts[state] ? <span key={state} className="whitespace-nowrap"><i className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", stateClasses[state])} />{labels[state]} {stateCounts[state]}</span> : null)}
      </span> : null}
    </div>
  );
}
