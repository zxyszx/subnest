import type { ChangeEventHandler, ReactNode } from "react";
import { Search } from "lucide-react";

import { PlatformFilterBar, type PlatformFilterOption } from "@/components/platform-filter-bar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PlatformSearchToolbarProps {
  platforms: readonly PlatformFilterOption[];
  selectedPlatform: string | null;
  onPlatformChange: (value: string | null) => void;
  allLabel: string;
  moreLabel: string;
  platformAriaLabel: string;
  searchValue: string;
  onSearchChange: ChangeEventHandler<HTMLInputElement>;
  searchPlaceholder: string;
  searchName?: string;
  controls?: ReactNode;
  className?: string;
  testId?: string;
}

export function PlatformSearchToolbar({
  platforms,
  selectedPlatform,
  onPlatformChange,
  allLabel,
  moreLabel,
  platformAriaLabel,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchName,
  controls,
  className,
  testId,
}: PlatformSearchToolbarProps) {
  return (
    <div
      className={cn("flex min-w-0 flex-col rounded-lg border border-border bg-card md:flex-row md:items-center", className)}
      data-testid={testId}
    >
      <PlatformFilterBar
        platforms={platforms}
        value={selectedPlatform}
        onValueChange={onPlatformChange}
        allLabel={allLabel}
        moreLabel={moreLabel}
        ariaLabel={platformAriaLabel}
        visibleLimits={{ compact: 3, regular: 5, wide: 7, spacious: 8 }}
        moreIconOnly
        className="min-w-0 flex-1 border-0 px-2"
      />
      <div className="flex min-w-0 shrink-0 items-center gap-2 p-2 md:pl-0">
        <div className="relative min-w-0 flex-1 md:w-64 md:flex-none xl:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            name={searchName}
            type="search"
            enterKeyHint="search"
            value={searchValue}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-10 border-border bg-secondary pl-9"
          />
        </div>
        {controls}
      </div>
    </div>
  );
}
