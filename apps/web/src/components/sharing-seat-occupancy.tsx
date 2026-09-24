import { cn } from "@/lib/utils";

interface SharingSeatOccupancyProps {
  occupied: number;
  capacity: number;
  seatTones?: readonly SharingSeatTone[];
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

export function SharingSeatOccupancy({ occupied, capacity, seatTones }: SharingSeatOccupancyProps) {
  const safeCapacity = Math.max(0, capacity);
  const safeOccupied = Math.min(Math.max(0, occupied), safeCapacity);
  const segmented = safeCapacity > 0 && safeCapacity <= 8;
  const percentage = safeCapacity > 0 ? (safeOccupied / safeCapacity) * 100 : 0;
  const normalizedTones = Array.from({ length: safeCapacity }, (_, index): SharingSeatTone => (
    seatTones?.[index] ?? (index < safeOccupied ? "normal" : "vacant")
  ));
  const progressTone = normalizedTones.includes("danger")
    ? "danger"
    : normalizedTones.includes("warning")
      ? "warning"
      : "normal";

  return (
    <div className="grid w-20 gap-1.5" aria-label={`${safeOccupied} / ${safeCapacity}`}>
      <span className="text-xs font-semibold tabular-nums text-foreground">{safeOccupied} / {safeCapacity}</span>
      {segmented ? (
        <span className="flex gap-1" data-testid="sharing-seat-segments" aria-hidden="true">
          {normalizedTones.map((tone, index) => (
            <span
              key={index}
              data-occupied={tone !== "vacant"}
              data-tone={tone}
              className={cn(
                "h-1.5 min-w-0 flex-1 rounded-full transition-colors duration-200",
                toneClasses[tone],
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
    </div>
  );
}
