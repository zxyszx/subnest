import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  BarChart3,
  CalendarDays,
  Inbox,
  LayoutDashboard,
  List,
  PanelLeft,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { NavLink } from "@/components/router-link";
import { RenewletBrandMark } from "@/components/brand/renewlet-brand-mark";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/components/account-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";
import { PRODUCT_NAME } from "@/lib/product-brand";
import { usePathname } from "@/lib/router";
import { Portal as TooltipPortal } from "@radix-ui/react-tooltip";
import "@/styles/workspace.css";

const navigation = [
  { path: "/", key: "nav.dashboard", icon: LayoutDashboard },
  { path: "/subscriptions", key: "nav.subscriptions", icon: List },
  { path: "/sharing", key: "nav.sharing", icon: UsersRound },
  { path: "/statistics", key: "nav.statistics", icon: BarChart3 },
  { path: "/online-2fa", key: "nav.online2fa", icon: ShieldCheck, tool: true },
  {
    path: "/shared-inboxes",
    key: "nav.sharedInbox",
    icon: Inbox,
    tool: true,
    admin: true,
  },
  { path: "/calendar", key: "nav.calendar", icon: CalendarDays, tool: true },
] satisfies Array<{
  path: string;
  key: MessageKey;
  icon: typeof List;
  tool?: boolean;
  admin?: boolean;
}>;

function readCollapsed() {
  try {
    return localStorage.getItem("sidebarCollapsed") === "true";
  } catch {
    return false;
  }
}

export function WorkspaceFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { t } = useI18n();
  const { data } = authClient.useSession();
  const user = data?.user;
  useEffect(() => {
    try {
      localStorage.setItem("sidebarCollapsed", String(collapsed));
    } catch {
      /* Storage can be disabled in private browsers. */
    }
  }, [collapsed]);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented || event.repeat || event.altKey ||
        !event.shiftKey || !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "s" ||
        !window.matchMedia("(min-width: 1024px)").matches ||
        document.querySelector('[role="dialog"], [role="alertdialog"]') ||
        (event.target instanceof HTMLElement && event.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
        ))
      ) return;
      event.preventDefault();
      setCollapsed((value) => !value);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);
  const toggleLabel = t(collapsed ? "workspace.expand" : "workspace.collapse");
  return (
    <div
      className="workspace-shell"
      style={
        {
          "--workspace-sidebar-width": collapsed ? "72px" : "240px",
        } as CSSProperties
      }
    >
      <TooltipProvider delayDuration={150} disableHoverableContent>
        <aside
          className="workspace-sidebar"
          data-testid="workspace-sidebar"
          data-collapsed={collapsed}
        >
          <div
            data-testid="workspace-sidebar-header"
            className={cn("flex h-18 shrink-0 items-center gap-2 px-3", collapsed && "justify-center")}
          >
            {!collapsed && (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <RenewletBrandMark size="sm" href="/" />
                <span className="text-lg font-bold">{PRODUCT_NAME}</span>
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="group relative h-11 w-11 shrink-0 rounded-md"
                  aria-label={toggleLabel}
                  aria-expanded={!collapsed}
                  aria-controls="workspace-navigation"
                  aria-keyshortcuts="Meta+Shift+S Control+Shift+S"
                  onClick={() => setCollapsed((value) => !value)}
                >
                  {collapsed && (
                    <RenewletBrandMark
                      size="sm"
                      className="absolute rounded-md transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0 motion-reduce:transition-none"
                      data-testid="workspace-sidebar-toggle-logo"
                    />
                  )}
                  <PanelLeft
                    data-testid="workspace-sidebar-toggle-icon"
                    className={cn("h-5 w-5 transition-opacity duration-150 motion-reduce:transition-none", collapsed && "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent side={collapsed ? "right" : "bottom"} className="flex items-center gap-3">
                  {toggleLabel}
                  <kbd className="text-xs text-muted-foreground">{t("workspace.sidebarShortcut")}</kbd>
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          </div>
          <nav
            id="workspace-navigation"
            aria-label={t("nav.dashboard")}
            className="min-h-0 flex-1 overflow-y-auto px-3"
          >
            {navigation
              .filter(
                (item) =>
                  !("admin" in item && item.admin) || user?.role === "admin",
              )
              .map((item, index) => (
                <div key={item.path}>
                  {index === 4 && (
                    <div
                      className={cn(
                        "mt-5 mb-2 border-t border-border pt-4",
                        collapsed
                          ? "h-1"
                          : "px-3 text-xs font-medium text-muted-foreground",
                      )}
                    >
                      {!collapsed && t("workspace.tools")}
                    </div>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <NavLink
                        href={item.path}
                        end={item.path === "/"}
                        aria-label={t(item.key)}
                        className={cn(
                            "relative mb-1 flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            collapsed && "justify-center px-0",
                            pathname === item.path || (item.path !== "/" && pathname.startsWith(`${item.path}/`))
                              ? "bg-primary/10 text-primary before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:bg-primary"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                          )}
                      >
                        <item.icon className="h-4.5 w-4.5 shrink-0" />
                        {!collapsed && (
                          <span className="whitespace-nowrap">
                            {t(item.key)}
                          </span>
                        )}
                      </NavLink>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipPortal><TooltipContent side="right">
                        {t(item.key)}
                      </TooltipContent></TooltipPortal>
                    )}
                  </Tooltip>
                </div>
              ))}
          </nav>
          <div className="mt-auto border-t border-border p-3">
            {!collapsed && (
              <p className="mb-3 px-2 text-xs text-muted-foreground">
                {t("workspace.private")}
              </p>
            )}
            <AccountMenu compact={collapsed} />
          </div>
        </aside>
      </TooltipProvider>
      <div className="workspace-content" data-testid="workspace-content">
        {children}
      </div>
    </div>
  );
}
