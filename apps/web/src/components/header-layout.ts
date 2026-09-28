import { cn } from "@/lib/utils";

export const headerLayout = {
  shell:
    "sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-xl relative lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-r lg:border-b-0 lg:bg-card lg:backdrop-blur-none",
  inner:
    "mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:h-full lg:flex-col lg:items-stretch lg:justify-start lg:gap-0 lg:px-4 lg:py-5",
  primaryCluster: "flex min-w-0 items-center gap-3 lg:flex-1 lg:flex-col lg:items-stretch lg:gap-6",
  brandCluster: "flex min-w-0 items-center gap-3",
  brandTextGroup: "grid min-w-0 gap-1",
  brandTitleLink:
    "block min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  brandTitle: "truncate text-xl font-extrabold tracking-tight text-foreground",
  desktopNav: "hidden min-w-0 lg:flex lg:flex-1 lg:flex-col lg:gap-1",
  desktopNavIcon: "h-4.5 w-4.5 shrink-0",
  desktopNavLabel: "whitespace-nowrap",
  desktopNavSkeletonLabel: "h-4 w-16",
  actions:
    "flex min-w-0 shrink-0 items-center justify-end gap-2 lg:flex-wrap lg:justify-start lg:border-t lg:border-border lg:pt-4",
  mobileNav: "flex overflow-x-auto overscroll-x-contain border-t border-border lg:hidden",
  mobileNavIcon: "h-5 w-5",
} as const;

const headerDesktopNavLinkBase =
  "flex h-11 w-full items-center justify-start gap-3 rounded-lg px-3 text-sm font-medium transition-colors";

const headerDesktopNavSkeletonItem =
  "flex h-11 w-full items-center justify-start gap-3 rounded-lg px-3";

const headerMobileNavLinkBase = "flex min-w-20 flex-none flex-col items-center gap-1 whitespace-nowrap py-3 text-xs font-medium transition-colors";

export function getHeaderDesktopNavLinkClass(isActive: boolean) {
  return cn(
    headerDesktopNavLinkBase,
    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
  );
}

export function getHeaderDesktopNavSkeletonItemClass() {
  return headerDesktopNavSkeletonItem;
}

export function getHeaderMobileNavLinkClass(isActive: boolean) {
  return cn(headerMobileNavLinkBase, isActive ? "text-primary" : "text-muted-foreground");
}
