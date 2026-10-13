import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ListFilter } from "lucide-react";
import { SubscriptionLogo } from "@/components/subscription-logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

export interface PlatformFilterOption {
  name: string;
  label?: string;
  logo?: string | null | undefined;
}

interface PlatformFilterBarProps {
  platforms: readonly PlatformFilterOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  allLabel: string;
  moreLabel: string;
  ariaLabel: string;
  className?: string;
  visibleLimits?: {
    compact?: number;
    regular?: number;
    wide?: number;
    spacious?: number;
  };
  moreIconOnly?: boolean;
  dense?: boolean;
  fitContainer?: boolean;
}

export function PlatformFilterBar({
  platforms,
  value,
  onValueChange,
  allLabel,
  moreLabel,
  ariaLabel,
  className,
  visibleLimits,
  moreIconOnly = false,
  dense = false,
  fitContainer = false,
}: PlatformFilterBarProps) {
  const navRef = useRef<HTMLElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const [fittedLimit, setFittedLimit] = useState<number | null>(null);
  const compact = useMediaQuery("(max-width: 767px)");
  const wide = useMediaQuery("(min-width: 1280px)");
  const spacious = useMediaQuery("(min-width: 1600px)");
  const visibleLimit = compact
    ? (visibleLimits?.compact ?? 2)
    : spacious
      ? (visibleLimits?.spacious ?? visibleLimits?.wide ?? 8)
      : wide
      ? (visibleLimits?.wide ?? 6)
      : (visibleLimits?.regular ?? 4);
  const ordered = useMemo(() => {
    const unique = new Map<string, PlatformFilterOption>();
    for (const platform of platforms) {
      const name = platform.name.trim();
      if (!name || unique.has(name)) continue;
      unique.set(name, { ...platform, name });
    }
    return Array.from(unique.values());
  }, [platforms]);
  useLayoutEffect(() => {
    if (!fitContainer) return;
    const nav = navRef.current;
    const measurement = measurementRef.current;
    if (!nav || !measurement) return;
    const measure = () => {
      const styles = getComputedStyle(nav);
      const available = nav.clientWidth - parseFloat(styles.paddingLeft || "0") - parseFloat(styles.paddingRight || "0");
      if (available <= 0) return;
      const widths = Array.from(measurement.children, (child) => child.getBoundingClientRect().width);
      const allWidth = widths[0] ?? 0;
      const moreWidth = widths[widths.length - 1] ?? 0;
      const platformWidths = widths.slice(1, -1);
      const totalWidth = allWidth + platformWidths.reduce((total, width) => total + width + 4, 0);
      let count = platformWidths.length;
      if (totalWidth > available) {
        let used = allWidth + moreWidth + 4;
        count = 0;
        for (const width of platformWidths) {
          if (used + width + 4 > available) break;
          used += width + 4;
          count += 1;
        }
      }
      setFittedLimit(count);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    observer.observe(measurement);
    return () => observer.disconnect();
  }, [fitContainer, ordered, allLabel, moreLabel, dense, moreIconOnly]);

  const limit = fitContainer ? (fittedLimit ?? visibleLimit) : visibleLimit;
  const visible = ordered.slice(0, limit);
  const selectedIndex = value ? ordered.findIndex((platform) => platform.name === value) : -1;
  if (!fitContainer && selectedIndex >= limit && visible.length > 0) {
    visible[visible.length - 1] = ordered[selectedIndex]!;
  }
  const visibleNames = new Set(visible.map((platform) => platform.name));
  const overflow = ordered.filter((platform) => !visibleNames.has(platform.name));

  const platformButton = (platform: PlatformFilterOption) => (
    <Button
      key={platform.name}
      type="button"
      variant="ghost"
      aria-label={platform.label ?? platform.name}
      aria-pressed={value === platform.name}
      onClick={() => onValueChange(platform.name)}
      className={cn(
        "shrink-0 gap-2 rounded-md text-muted-foreground",
        dense ? "h-9 px-2.5" : "h-10 px-3",
        value === platform.name && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
      )}
    >
      <SubscriptionLogo name={platform.label ?? platform.name} logo={platform.logo} size="xs" />
      <span>{platform.label ?? platform.name}</span>
    </Button>
  );

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      className={cn("relative flex min-w-0 items-center gap-1 border-b border-border", className)}
    >
      {fitContainer ? (
        <div aria-hidden="true" inert className="pointer-events-none invisible absolute inset-0 overflow-hidden">
          <div ref={measurementRef} className="flex w-max items-center gap-1">
            <Button type="button" variant="ghost" className={dense ? "h-9 px-2.5" : "h-10 px-3"}>{allLabel}</Button>
            {ordered.map(platformButton)}
            <Button type="button" variant="ghost" className={moreIconOnly ? (dense ? "h-9 w-9 p-0" : "h-10 w-10 p-0") : "h-10 gap-1 px-3"}>
              {moreIconOnly ? <ListFilter className="h-4 w-4" /> : <>{moreLabel}<ChevronDown className="h-4 w-4" /></>}
            </Button>
          </div>
        </div>
      ) : null}
      <div className={cn("flex min-w-0 items-center gap-1 py-1", !fitContainer && "flex-1 overflow-hidden")}>
        <Button
          type="button"
          variant="ghost"
          aria-pressed={value === null}
          onClick={() => onValueChange(null)}
          className={cn(
            "shrink-0 rounded-md text-muted-foreground",
            dense ? "h-9 px-2.5" : "h-10 px-3",
            value === null && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
          )}
        >
          {allLabel}
        </Button>
        {visible.map(platformButton)}
      </div>
      {overflow.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size={moreIconOnly ? "icon" : "default"}
              className={cn(
                "shrink-0",
                dense ? "h-9" : "h-10",
                moreIconOnly ? (dense ? "w-9 p-0" : "w-10 p-0") : "gap-1 px-3",
              )}
              aria-label={moreLabel}
              title={moreLabel}
            >
              {moreIconOnly ? <ListFilter className="h-4 w-4" /> : (
                <>
                  {moreLabel}
                  <ChevronDown className="h-4 w-4" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {overflow.map((platform) => (
              <DropdownMenuItem
                key={platform.name}
                onSelect={() => onValueChange(platform.name)}
                className="gap-2"
              >
                <SubscriptionLogo name={platform.label ?? platform.name} logo={platform.logo} size="xs" />
                <span className="min-w-0 flex-1 truncate">{platform.label ?? platform.name}</span>
                {value === platform.name ? <Check className="h-4 w-4 text-primary" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </nav>
  );
}

export default PlatformFilterBar;
