// 设置目录测试聚焦滚动状态机、移动 sticky 和桌面锚点契约，避免页面主体测试文件再次超过 CI 行数门禁。
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createControllerState,
  mocks,
  renderSettingsScreen,
  SETTINGS_SECTION_IDS,
} from "./settings-screen.test-utils";

describe("SettingsScreen section navigation", () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((handle) => {
      window.clearTimeout(handle);
    });
    vi.stubGlobal("IntersectionObserver", vi.fn());
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    window.history.replaceState(null, "", "/settings");
    mocks.useSettingsFormController.mockReturnValue(createControllerState());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("renders section navigation links that target every settings section", () => {
    const { container } = renderSettingsScreen();
    const sections = [
      ["settings-account", "账户设置"],
      ["settings-access-security", "访问安全"],
      ["settings-appearance", "主题外观"],
      ["settings-display", "显示设置"],
      ["settings-icon-sources", "图标来源"],
      ["settings-uploaded-icons", "自定义图标"],
      ["settings-data-config", "数据配置"],
      ["settings-budget", "预算设置"],
      ["settings-exchange", "汇率设置"],
      ["settings-ai-recognition", "AI 识别"],
      ["settings-cloud-backup", "云端备份"],
      ["settings-calendar-feed", "日历订阅"],
      ["settings-public-status", "公开展示"],
      ["settings-public-api", "开放接口"],
      ["settings-newszxcn", "共享收件箱"],
      ["settings-timezone", "时区设置"],
      ["settings-notifications", "通知设置"],
    ] as const;

    const desktopNav = screen.getByTestId("settings-section-nav-desktop");
    expect(desktopNav).toHaveClass(
      "sticky",
      "top-(--settings-desktop-sticky-top)",
      "max-h-[calc(var(--app-viewport-height)-var(--settings-desktop-sticky-top)-1rem)]",
      "bg-card/70",
      "backdrop-blur",
      "overflow-y-auto",
    );
    expect(desktopNav).not.toHaveClass("top-28", "max-h-[calc(100vh-8rem)]");
    expect(within(desktopNav).getByRole("link", { name: "账户设置" })).toHaveAttribute("aria-current", "location");
    expect(IntersectionObserver).not.toHaveBeenCalled();
    expect(screen.queryByTestId("settings-section-content-scroll")).not.toBeInTheDocument();
    const content = screen.getByTestId("settings-section-content");
    expect(content).not.toHaveClass("lg:overflow-y-auto");
    const headings = within(content).getAllByRole("heading", { name: "账户设置" });
    expect(headings).toHaveLength(2);
    const [mobileHeading, desktopHeading] = headings;
    expect(mobileHeading).toBeDefined();
    expect(desktopHeading).toBeDefined();
    expect(mobileHeading?.closest("[data-testid='settings-mobile-page-header']")).not.toBeNull();
    expect(desktopHeading?.closest(".hidden.lg\\:block")).not.toBeNull();
    const mobileSubtitle = within(screen.getByTestId("settings-mobile-page-header"))
      .getByTestId("settings-mobile-page-subtitle");
    expect(mobileSubtitle).toHaveTextContent("账号与安全");
    expect(screen.getByTestId("settings-current-section-header")).toHaveTextContent("账号与安全");
    expect(within(content).getByRole("heading", { name: "管理员账户" })).toBeInTheDocument();
    expect(screen.queryByTestId("settings-section-nav-floating-trigger")).not.toBeInTheDocument();
    expect(screen.queryByTestId("settings-section-nav-toolbar")).not.toBeInTheDocument();
    const mobileHeader = within(content).getByTestId("settings-mobile-page-header");
    expect(mobileHeader).toHaveClass(
      "sticky",
      "top-[calc(var(--settings-mobile-header-offset)+var(--settings-mobile-sticky-gap))]",
      "rounded-lg",
      "border",
      "bg-background/95",
      "p-3",
      "lg:hidden",
    );
    expect(mobileHeader).not.toHaveClass("-mx-4", "border-b", "top-[calc(8.25rem+env(safe-area-inset-top))]");
    const accountSection = container.querySelector("#settings-account");
    expect(accountSection).not.toBeNull();
    expect(mobileHeader.compareDocumentPosition(accountSection as Element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const mobileTrigger = within(mobileHeader).getByRole("button", { name: /打开设置目录/ });
    expect(mobileTrigger).toHaveClass("h-10", "w-10", "shrink-0", "rounded-lg", "border", "border-border", "bg-card/80");
    expect(mobileTrigger).not.toHaveTextContent("目录");
    expect(mobileTrigger).not.toHaveTextContent("时区设置");
    expect(within(mobileHeader).getByTestId("settings-mobile-page-subtitle")).toHaveTextContent("账号与安全");
    const sectionNav = within(desktopNav);

    ["账号与安全", "外观与图标", "数据与智能", "分享与集成", "区域与通知"].forEach((label) => {
      expect(sectionNav.getByText(label)).toBeInTheDocument();
    });

    sections.forEach(([id, label]) => {
      expect(container.querySelector(`section#${id}`)).toHaveClass(
        "min-w-0",
        "w-full",
        "rounded-lg",
        "border",
        "bg-card",
        "p-4",
        "sm:p-5",
        "scroll-mt-(--settings-section-scroll-offset)",
      );
      expect(container.querySelector(`section#${id}`)).not.toHaveClass("lg:scroll-mt-24");
      if (id === "settings-account") {
        expect(container.querySelector(`section#${id}`)).not.toHaveClass("hidden");
      } else {
        expect(container.querySelector(`section#${id}`)).toHaveClass("hidden");
      }
      const links = sectionNav.getAllByRole("link", { name: label });
      expect(links).toHaveLength(1);
      links.forEach((link) => expect(link).toHaveAttribute("href", `#${id}`));
    });
    expect(SETTINGS_SECTION_IDS.map((id) => container.querySelector(`section#${id}`)?.id)).toEqual([...SETTINGS_SECTION_IDS]);
  });

  it("opens mobile section navigation as a left drawer", async () => {
    const user = userEvent.setup();
    renderSettingsScreen();

    await user.click(within(screen.getByTestId("settings-mobile-page-header")).getByRole("button", { name: /打开设置目录/ }));

    const drawer = await screen.findByTestId("settings-section-nav-drawer");
    expect(drawer).toHaveClass(
      "fixed",
      "left-0",
      "top-(--app-visual-viewport-offset-top)",
      "h-(--app-viewport-height)",
      "max-h-(--app-viewport-height)",
      "z-80",
      "rounded-r-xl",
      "bg-card",
    );
    const notificationLink = within(drawer).getByRole("link", { name: "通知设置" });
    expect(notificationLink).toHaveClass("rounded-md", "px-3", "py-2", "text-sm");
    expect(notificationLink).not.toHaveClass("h5-mobile-option-item");
    expect(notificationLink).not.toHaveClass("border", "bg-secondary/30");
    expect(drawer.querySelector(".overflow-x-auto")).toBeNull();
  });

  it("marks the active section navigation item with aria-current", async () => {
    const user = userEvent.setup();
    renderSettingsScreen();

    const nav = screen.getByTestId("settings-section-nav-desktop");
    const notificationLink = within(nav).getByRole("link", { name: "通知设置" });
    await user.click(notificationLink);

    expect(notificationLink).toHaveAttribute("aria-current", "location");
  });

  it("scrolls to the access security section from the settings directory", async () => {
    const user = userEvent.setup();
    renderSettingsScreen();

    const nav = screen.getByTestId("settings-section-nav-desktop");
    const accessSecurityLink = within(nav).getByRole("link", { name: "访问安全" });
    await user.click(accessSecurityLink);

    expect(window.location.hash).toBe("#settings-access-security");
    expect(accessSecurityLink).toHaveAttribute("aria-current", "location");
  });

  it("hides the access security directory item when the controller cannot manage it", () => {
    mocks.useSettingsFormController.mockReturnValue(createControllerState({
      canManageUsers: false,
      authSecurity: { canManage: false },
    }));
    const { container } = renderSettingsScreen();

    expect(container.querySelector("#settings-access-security")).toBeNull();
    expect(within(screen.getByTestId("settings-section-nav-desktop")).queryByRole("link", { name: "访问安全" })).not.toBeInTheDocument();
  });

  it("shows only the selected settings module and ignores page scrolling", async () => {
    const user = userEvent.setup();
    const { container } = renderSettingsScreen();
    const desktopNav = screen.getByTestId("settings-section-nav-desktop");
    await user.click(within(desktopNav).getByRole("link", { name: "通知设置" }));

    expect(container.querySelector("#settings-account")).toHaveClass("hidden");
    expect(container.querySelector("#settings-notifications")).not.toHaveClass("hidden");
    expect(screen.getByTestId("settings-current-section-header")).toHaveTextContent("区域与通知通知设置");
    expect(screen.getByTestId("settings-mobile-page-header")).toHaveTextContent("通知设置区域与通知");
    document.getElementById("root")?.dispatchEvent(new Event("scroll"));
    expect(within(desktopNav).getByRole("link", { name: "通知设置" })).toHaveAttribute("aria-current", "location");
  });

  it("opens the section from the URL hash without flashing the default module", () => {
    window.history.replaceState(null, "", "/settings#settings-budget");
    const { container } = renderSettingsScreen();

    expect(within(screen.getByTestId("settings-section-nav-desktop")).getByRole("link", { name: "预算设置" }))
      .toHaveAttribute("aria-current", "location");
    expect(container.querySelector("#settings-budget")).not.toHaveClass("hidden");
    expect(container.querySelector("#settings-account")).toHaveClass("hidden");
  });

  it("closes the mobile drawer after selecting a settings section", async () => {
    const user = userEvent.setup();
    renderSettingsScreen();

    const trigger = within(screen.getByTestId("settings-mobile-page-header"))
      .getByRole("button", { name: /打开设置目录/ });
    await user.click(trigger);
    const drawer = await screen.findByTestId("settings-section-nav-drawer");
    await user.click(within(drawer).getByRole("link", { name: "通知设置" }));

    await waitFor(() => expect(screen.queryByTestId("settings-section-nav-drawer")).not.toBeInTheDocument());
    expect(window.location.hash).toBe("#settings-notifications");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    const reopenedDrawer = await screen.findByTestId("settings-section-nav-drawer");
    const activeNotificationLink = within(reopenedDrawer).getByRole("link", { name: "通知设置" });
    expect(activeNotificationLink).toHaveAttribute("aria-current", "location");
    expect(activeNotificationLink).toHaveClass("bg-primary/10", "text-primary");
    expect(activeNotificationLink.querySelector(".absolute.left-0")).not.toBeNull();
    expect(activeNotificationLink.querySelector("svg")).toBeNull();
  });

  it("does not ask for leave confirmation when unsaved changes navigate within settings hash", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mocks.useSettingsFormController.mockReturnValue(createControllerState({
      hasUnsavedChanges: true,
    }));

    renderSettingsScreen();

    const nav = screen.getByTestId("settings-section-nav-desktop");
    await user.click(within(nav).getByRole("link", { name: "通知设置" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#settings-notifications");
    confirmSpy.mockRestore();
  });

  it("uses the Renewlet confirmation dialog for unsaved in-app navigation", async () => {
    const user = userEvent.setup();
    const controller = createControllerState({
      hasUnsavedChanges: true,
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mocks.useSettingsFormController.mockReturnValue(controller);

    window.history.replaceState(null, "", "/settings");
    renderSettingsScreen();
    const linkContainer = document.createElement("div");
    linkContainer.innerHTML = `<a href="${window.location.origin}/" data-testid="test-logo-link">Renewlet</a>`;
    document.body.appendChild(linkContainer);
    const link = screen.getByTestId("test-logo-link");

    await user.click(link);

    const dialog = await screen.findByRole("alertdialog", { name: "离开设置页？" });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("route-path")).toHaveTextContent("/settings");

    await user.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog", { name: "离开设置页？" })).not.toBeInTheDocument();
    expect(screen.getByTestId("route-path")).toHaveTextContent("/settings");

    await user.click(link);
    await user.click(await screen.findByRole("button", { name: "放弃并离开" }));

    expect(controller.handleDiscardChanges).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("route-path")).toHaveTextContent("/");
    expect(confirmSpy).not.toHaveBeenCalled();
    linkContainer.remove();
    confirmSpy.mockRestore();
  });
});
