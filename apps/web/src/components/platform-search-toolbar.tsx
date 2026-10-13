import { useRef, useState, type ChangeEventHandler, type ReactNode } from "react";
import { Search } from "lucide-react";

import { PlatformFilterBar, type PlatformFilterOption } from "@/components/platform-filter-bar";
import { Button } from "@/components/ui/button";
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
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchExpanded = searchFocused || searchValue.length > 0;

  const expandSearch = () => {
    searchInputRef.current?.focus();
  };

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
        visibleLimits={{ compact: 3, regular: 5, wide: 5, spacious: 8 }}
        moreIconOnly
        dense
        fitContainer
        className="min-w-0 flex-1 border-0 px-2"
      />
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 p-1.5 md:pl-0">
        <div
          className={cn(
            "relative h-9 w-56 min-w-0 flex-none overflow-hidden transition-[max-width] duration-200 ease-out motion-reduce:transition-none xl:w-64",
            searchExpanded ? "max-w-56 xl:max-w-64" : "max-w-9",
          )}
          data-search-expanded={searchExpanded}
        >
          <Search
            className={cn(
              "pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground transition-opacity duration-150 motion-reduce:transition-none",
              searchExpanded ? "opacity-100" : "opacity-0",
            )}
            aria-hidden="true"
          />
          <Input
            ref={searchInputRef}
            name={searchName}
            type="search"
            enterKeyHint="search"
            value={searchValue}
            onChange={onSearchChange}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            tabIndex={searchExpanded ? 0 : -1}
            className={cn(
              "h-9 border-border bg-secondary pl-8 focus-visible:border-primary focus-visible:ring-0 focus-visible:ring-offset-0 transition-opacity duration-150 motion-reduce:transition-none",
              searchExpanded ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          />
          {!searchExpanded ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute inset-0 h-9 w-9 border-border bg-secondary p-0"
              aria-label={searchPlaceholder}
              title={searchPlaceholder}
              onClick={expandSearch}
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
        <div className="contents **:[[role=combobox]]:h-9 **:[[role=combobox]]:px-2.5">{controls}</div>
      </div>
    </div>
  );
}
