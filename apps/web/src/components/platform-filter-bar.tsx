import { useMemo } from "react";
import { Check, ChevronDown } from "lucide-react";
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
}

export function PlatformFilterBar({
  platforms,
  value,
  onValueChange,
  allLabel,
  moreLabel,
  ariaLabel,
  className,
}: PlatformFilterBarProps) {
  const compact = useMediaQuery("(max-width: 767px)");
  const wide = useMediaQuery("(min-width: 1280px)");
  const visibleLimit = compact ? 2 : wide ? 6 : 4;
  const ordered = useMemo(() => {
    const unique = new Map<string, PlatformFilterOption>();
    for (const platform of platforms) {
      const name = platform.name.trim();
      if (!name || unique.has(name)) continue;
      unique.set(name, { ...platform, name });
    }
    return Array.from(unique.values());
  }, [platforms]);
  const visible = ordered.slice(0, visibleLimit);
  const selectedIndex = value ? ordered.findIndex((platform) => platform.name === value) : -1;
  if (selectedIndex >= visibleLimit && visible.length > 0) {
    visible[visible.length - 1] = ordered[selectedIndex]!;
  }
  const visibleNames = new Set(visible.map((platform) => platform.name));
  const overflow = ordered.filter((platform) => !visibleNames.has(platform.name));

  const platformButton = (platform: PlatformFilterOption) => (
    <Button
      key={platform.name}
      type="button"
      variant="ghost"
      aria-pressed={value === platform.name}
      onClick={() => onValueChange(platform.name)}
      className={cn(
        "h-10 shrink-0 gap-2 rounded-md px-3 text-muted-foreground",
        value === platform.name && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
      )}
    >
      <SubscriptionLogo name={platform.name} logo={platform.logo} size="xs" />
      <span>{platform.label ?? platform.name}</span>
    </Button>
  );

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("flex min-w-0 items-center gap-1 border-b border-border", className)}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden py-1">
        <Button
          type="button"
          variant="ghost"
          aria-pressed={value === null}
          onClick={() => onValueChange(null)}
          className={cn(
            "h-10 shrink-0 rounded-md px-3 text-muted-foreground",
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
            <Button type="button" variant="ghost" className="h-10 shrink-0 gap-1 px-3">
              {moreLabel}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {overflow.map((platform) => (
              <DropdownMenuItem
                key={platform.name}
                onSelect={() => onValueChange(platform.name)}
                className="gap-2"
              >
                <SubscriptionLogo name={platform.name} logo={platform.logo} size="xs" />
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
