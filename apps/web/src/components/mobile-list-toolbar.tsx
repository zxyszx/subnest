import { useId, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PlatformFilterOption } from "@/components/platform-filter-bar";
import { useI18n } from "@/i18n/I18nProvider";

export function MobileListToolbar({
  platforms, platform, onPlatformChange, allLabel, platformLabel,
  search, onSearchChange, searchPlaceholder, searchName, children,
}: {
  platforms: readonly PlatformFilterOption[];
  platform: string | null;
  onPlatformChange: (platform: string | null) => void;
  allLabel: string;
  platformLabel: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchName?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  // Index values keep both an unbound (empty-name) platform and "all" selectable.
  const selectedIndex = platforms.findIndex((option) => option.name === platform);
  return (
    <div className="mb-2 grid min-w-0 gap-2" data-testid="mobile-compact-filter-toolbar">
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" name={searchName} enterKeyHint="search" value={search}
          onChange={(event) => { onSearchChange(event.target.value); setExpanded(false); }} placeholder={searchPlaceholder}
          aria-label={searchPlaceholder} className="h-11 bg-card pl-9 text-base" />
      </div>
      <div className="flex min-w-0 gap-2">
        <Select value={platform === null || selectedIndex < 0 ? "all" : String(selectedIndex)}
          onValueChange={(value) => onPlatformChange(value === "all" ? null : platforms[Number(value)]!.name)}>
          <SelectTrigger aria-label={platformLabel} className="h-11 min-w-0 flex-1 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent mobileTitle={platformLabel}>
            <SelectItem value="all">{allLabel}</SelectItem>
            {platforms.map((option, index) => <SelectItem key={option.name} value={String(index)}>{option.label ?? (option.name || t("subscription.platformUnbound"))}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" variant={expanded ? "secondary" : "outline"} className="h-11 shrink-0 gap-2 px-3"
          aria-expanded={expanded} aria-controls={id}
          aria-label={t(expanded ? "subscriptions.mobileFilters.collapse" : "subscriptions.mobileFilters.open")}
          onClick={() => setExpanded((value) => !value)}>
          <SlidersHorizontal className="h-4 w-4" />
          {t(expanded ? "subscriptions.mobileFilters.collapse" : "subscriptions.mobileFilters.open")}
        </Button>
      </div>
      {expanded ? <div id={id} className="grid gap-2 rounded-lg border border-border bg-card p-3" data-testid="mobile-expanded-filters">{children}</div> : null}
    </div>
  );
}
