/**
 * 顶部导航栏（桌面）+ 底部导航栏（移动端）。
 *
 * 作用：
 * - 提供全局导航（仪表盘/订阅/日历/统计/设置）
 * - 移动端账户菜单（设置、主题与退出）
 * - 可选：在支持的页面提供“新增订阅”入口
 *
 * 桌面账户操作统一放在侧栏底部；版本更新入口保留在顶部。
 */

import Link, { NavLink } from '@/components/router-link';
import { usePathname, useRouter } from '@/lib/router';
import { LayoutDashboard, List, CalendarDays, BarChart3, Settings, UsersRound, ShieldCheck, Inbox, MoreHorizontal } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import type { ReactNode } from 'react';
import type { SubscriptionFormSubmission } from '@/types/subscription';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AccountMenu } from '@/components/account-menu';
import { RenewletBrandMark } from '@/components/brand/renewlet-brand-mark';
import { getHeaderDesktopNavLinkClass, getHeaderMobileNavLinkClass, headerLayout } from '@/components/header-layout';
import { authClient } from '@/lib/auth-client';
import { SystemUpdateDialog } from '@/components/system-update-dialog';
import { useI18n } from '@/i18n/I18nProvider';
import type { MessageKey } from '@/i18n/messages';
import { RouteProgress } from '@/components/route-progress';
import { PRODUCT_NAME } from '@/lib/product-brand';

const AddSubscriptionDialog = lazy(async () => {
  const module = await import('@/components/add-subscription-dialog');
  return { default: module.AddSubscriptionDialog };
});

interface HeaderProps {
  /** 新增订阅回调（传入订阅主体数据，不包含 id）。不传则隐藏“新增订阅”按钮。 */
  onAddSubscription?: (submission: SubscriptionFormSubmission) => void;
  /** 当前用户已有标签建议，用于新增订阅弹窗复用。 */
  availableTags?: readonly string[] | undefined;
  platformSuggestions?: readonly { name: string; logo?: string | null | undefined }[] | undefined;
  /** 订阅页专属快捷动作，渲染在“新增订阅”旁边。 */
  subscriptionActions?: ReactNode;
  /** 当前页面的主操作，渲染在主题与退出等全局工具之前。 */
  pageActions?: ReactNode;
}

type NavIconKey = "dashboard" | "subscriptions" | "sharing" | "sharedInbox" | "online2fa" | "calendar" | "statistics" | "settings";
type NavItem = { path: string; labelKey: MessageKey; icon: NavIconKey; adminOnly?: boolean };

/** 导航项配置：路径 / 文案 / 图标 key。 */
const navItems: NavItem[] = [
  { path: '/', labelKey: 'nav.dashboard', icon: "dashboard" },
  { path: '/subscriptions', labelKey: 'nav.subscriptions', icon: "subscriptions" },
  { path: '/sharing', labelKey: 'nav.sharing', icon: "sharing" },
  { path: '/online-2fa', labelKey: 'nav.online2fa', icon: "online2fa" },
  { path: '/shared-inboxes', labelKey: 'nav.sharedInbox', icon: "sharedInbox", adminOnly: true },
  { path: '/calendar', labelKey: 'nav.calendar', icon: "calendar" },
  { path: '/statistics', labelKey: 'nav.statistics', icon: "statistics" },
  { path: '/settings', labelKey: 'nav.settings', icon: "settings" },
];
const mobilePrimaryPaths = new Set(["/", "/subscriptions", "/sharing", "/online-2fa"]);
const desktopPrimaryPaths = mobilePrimaryPaths;

function renderNavIcon(icon: NavIconKey, className: string) {
  switch (icon) {
    case "dashboard":
      return <LayoutDashboard className={className} />;
    case "subscriptions":
      return <List className={className} />;
    case "sharing":
      return <UsersRound className={className} />;
    case "sharedInbox":
      return <Inbox className={className} />;
    case "online2fa":
      return <ShieldCheck className={className} />;
    case "calendar":
      return <CalendarDays className={className} />;
    case "statistics":
      return <BarChart3 className={className} />;
    case "settings":
      return <Settings className={className} />;
  }
}

/** Header 组件：全局导航 + 主题切换 + 新增订阅入口。 */
export function Header({ onAddSubscription, availableTags, platformSuggestions, subscriptionActions, pageActions }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const { data: sessionData } = authClient.useSession();
  const [systemDialogOpen, setSystemDialogOpen] = useState(false);
  const isAuthenticated = Boolean(sessionData?.user);
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || sessionData?.user.role === "admin");
  const desktopPrimaryItems = visibleNavItems.filter((item) => desktopPrimaryPaths.has(item.path));
  const desktopMoreItems = visibleNavItems.filter((item) => !desktopPrimaryPaths.has(item.path) && item.path !== "/settings");
  const desktopMoreActive = desktopMoreItems.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  const mobilePrimaryItems = visibleNavItems.filter((item) => mobilePrimaryPaths.has(item.path));
  const mobileMoreItems = visibleNavItems.filter((item) => !mobilePrimaryPaths.has(item.path) && item.path !== "/settings");
  const mobileMoreActive = mobileMoreItems.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));

  return (
    <header className={headerLayout.shell} data-testid="app-header">
      <RouteProgress />
      <div className={headerLayout.inner} data-testid="app-header-inner">
        <div className={headerLayout.primaryCluster}>
          <div className={headerLayout.brandCluster} data-header-brand>
            <RenewletBrandMark size="sm" href="/" data-testid="app-header-brand-mark" />
            <div className={headerLayout.brandTextGroup}>
              <Link
                href="/"
                className={headerLayout.brandTitleLink}
              >
                <h1 className={headerLayout.brandTitle}>{PRODUCT_NAME}</h1>
              </Link>
            </div>
          </div>

          <span data-header-page-title className="hidden text-sm font-medium text-muted-foreground">{t(visibleNavItems.find((item) => item.path === pathname)?.labelKey ?? "nav.dashboard")}</span>
          <nav className={headerLayout.desktopNav} data-testid="app-header-desktop-nav">
            {desktopPrimaryItems.map((item) => (
              <NavLink
                key={item.path}
                href={item.path}
                end={item.path === "/"}
                title={t(item.labelKey)}
                className={({ isActive }) => getHeaderDesktopNavLinkClass(isActive)}
              >
                {renderNavIcon(item.icon, headerLayout.desktopNavIcon)}
                <span className={headerLayout.desktopNavLabel}>{t(item.labelKey)}</span>
              </NavLink>
            ))}
            {desktopMoreItems.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={getHeaderDesktopNavLinkClass(desktopMoreActive)}
                    aria-label={t("nav.more")}
                    aria-current={desktopMoreActive ? "page" : undefined}
                  >
                    <MoreHorizontal className={headerLayout.desktopNavIcon} />
                    <span className={headerLayout.desktopNavLabel}>{t("nav.more")}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" aria-label={t("nav.moreDescription")}>
                  {desktopMoreItems.map((item) => (
                    <DropdownMenuItem
                      key={item.path}
                      className={pathname === item.path || pathname.startsWith(`${item.path}/`) ? "text-primary" : undefined}
                      onSelect={() => router.push(item.path)}
                    >
                      {renderNavIcon(item.icon, "mr-3 h-4 w-4 shrink-0")}
                      <span>{t(item.labelKey)}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </nav>
        </div>

        <div className={headerLayout.actions} data-testid="app-header-actions">
          {onAddSubscription ? (
            <Suspense fallback={null}>
              <AddSubscriptionDialog onAdd={onAddSubscription} availableTags={availableTags} platformSuggestions={platformSuggestions} />
            </Suspense>
          ) : null}
          {onAddSubscription ? subscriptionActions : null}

          {pageActions}

          {isAuthenticated ? (
            <SystemUpdateDialog
              open={systemDialogOpen}
              onOpenChange={setSystemDialogOpen}
              canManageUpdates={sessionData?.user.role === "admin"}
              triggerClassName="shrink-0"
              badgeClassName="h-9 max-w-24 rounded-md px-2 text-xs sm:max-w-none"
            />
          ) : null}

          {isAuthenticated ? <AccountMenu compact className="lg:hidden" /> : null}

        </div>
      </div>

      {/* 移动端导航 */}
      <nav className={headerLayout.mobileNav} data-testid="app-header-mobile-nav">
        {mobilePrimaryItems.map((item) => (
          <NavLink
            key={item.path}
            href={item.path}
            end={item.path === "/"}
            className={({ isActive }) => getHeaderMobileNavLinkClass(isActive)}
          >
            {renderNavIcon(item.icon, headerLayout.mobileNavIcon)}
            {t(item.labelKey)}
          </NavLink>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={getHeaderMobileNavLinkClass(mobileMoreActive)}
              aria-label={t("nav.more")}
              aria-current={mobileMoreActive ? "page" : undefined}
            >
              <MoreHorizontal className={headerLayout.mobileNavIcon} />
              <span>{t("nav.more")}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            mobileTitle={t("nav.more")}
            aria-label={t("nav.moreDescription")}
          >
            {mobileMoreItems.map((item) => (
              <DropdownMenuItem
                key={item.path}
                className={pathname === item.path || pathname.startsWith(`${item.path}/`) ? "text-primary" : undefined}
                onSelect={() => router.push(item.path)}
              >
                {renderNavIcon(item.icon, "mr-3 h-5 w-5 shrink-0")}
                <span>{t(item.labelKey)}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </header>
  );
}
