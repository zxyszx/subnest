import { cn } from "@/lib/utils";

interface SharingSeatOccupancyProps {
  occupied: number;
  capacity: number;
}

export function SharingSeatOccupancy({ occupied, capacity }: SharingSeatOccupancyProps) {
  const safeCapacity = Math.max(0, capacity);
  const safeOccupied = Math.min(Math.max(0, occupied), safeCapacity);
  const segmented = safeCapacity > 0 && safeCapacity <= 8;
  const percentage = safeCapacity > 0 ? (safeOccupied / safeCapacity) * 100 : 0;

  return (
    <div className="grid w-20 gap-1.5" aria-label={`${safeOccupied} / ${safeCapacity}`}>
      <span className="text-xs font-semibold tabular-nums text-foreground">{safeOccupied} / {safeCapacity}</span>
      {segmented ? (
        <span className="flex gap-1" data-testid="sharing-seat-segments" aria-hidden="true">
          {Array.from({ length: safeCapacity }, (_, index) => (
            <span
              key={index}
              data-occupied={index < safeOccupied}
              className={cn(
                "h-1.5 min-w-0 flex-1 rounded-full transition-colors duration-200",
                index < safeOccupied ? "bg-primary" : "bg-muted-foreground/20",
              )}
            />
          ))}
        </span>
      ) : (
        <span className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/20" data-testid="sharing-seat-progress" aria-hidden="true">
          <span
            className="block h-full rounded-full bg-primary transition-transform duration-200 motion-reduce:transition-none"
            style={{ transform: `scaleX(${percentage / 100})`, transformOrigin: "left" }}
          />
        </span>
      )}
    </div>
  );
}
