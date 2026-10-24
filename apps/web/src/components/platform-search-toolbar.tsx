import { useEffect, useRef, type ChangeEventHandler, type ReactNode } from "react";
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
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (document.querySelector('[role="dialog"]') || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);


  return (
    <div className={cn("grid min-w-0 gap-3 rounded-2xl border border-border bg-card p-3", className)} data-testid={testId}>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input ref={searchInputRef} name={searchName} type="search" enterKeyHint="search" value={searchValue}
            onChange={onSearchChange} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
            className="h-11 border-border bg-background pl-10" />
        </div>
        {controls ? <div className="flex min-w-0 flex-wrap items-center gap-2 **:[[role=combobox]]:h-11">{controls}</div> : null}
      </div>
      <PlatformFilterBar platforms={platforms} value={selectedPlatform} onValueChange={onPlatformChange}
        allLabel={allLabel} moreLabel={moreLabel} ariaLabel={platformAriaLabel}
        visibleLimits={{ compact: 3, regular: 5, wide: 5, spacious: 8 }} moreIconOnly dense fitContainer
        className="min-w-0 border-0 p-0" />
    </div>
  );
}
