import { cn } from "@/lib/utils";

export const headerLayout = {
  shell: "relative sticky top-0 z-50 border-b border-border bg-card lg:bg-card/80 lg:backdrop-blur-xl",
  inner: "mx-auto flex max-w-[120rem] items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-2.5",
  primaryCluster: "flex min-w-0 items-center gap-3 lg:gap-5 xl:gap-8",
  brandCluster: "flex min-w-0 items-start gap-3",
  brandTextGroup: "relative h-10 min-w-0",
  brandTitleLink:
    "flex h-9 min-w-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  brandTitle: "truncate text-xl font-extrabold leading-none tracking-tight text-foreground",
  desktopNav: "hidden min-w-0 items-center gap-1 lg:flex",
  desktopNavIcon: "h-4 w-4 shrink-0",
  desktopNavLabel: "whitespace-nowrap",
  desktopNavSkeletonLabel: "h-4 w-16",
  actions: "flex min-w-0 shrink-0 items-center justify-end gap-2",
  mobileNav: "fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl lg:hidden",
  mobileNavIcon: "h-5 w-5",
} as const;

const headerDesktopNavLinkBase =
  "flex h-10 w-auto items-center justify-start gap-2 rounded-lg px-3 text-sm font-medium transition-colors xl:px-4";

const headerDesktopNavSkeletonItem =
  "flex h-10 w-auto items-center justify-start gap-2 rounded-lg px-3 xl:px-4";

const headerMobileNavLinkBase = "flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium leading-tight transition-colors";

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
