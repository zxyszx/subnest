import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";
import { expectNoHorizontalOverflow } from "./support/layout";

const mobileReleasePages: Array<{ path: string; label: string; assertReady: (page: Page) => Promise<void> }> = [
  {
    path: "/",
    label: "release mobile dashboard",
    assertReady: async (page) => {
      await expect(page.getByText("月均支出")).toBeVisible();
    },
  },
  {
    path: "/subscriptions",
    label: "release mobile subscriptions",
    assertReady: async (page) => {
      await expect(page.getByRole("heading", { name: "订阅列表" })).toBeVisible();
    },
  },
  {
    path: "/sharing",
    label: "release mobile sharing",
    assertReady: async (page) => {
      await expect(page.getByTestId("app-header-mobile-nav").getByRole("link", { name: "会员共享" })).toHaveAttribute("aria-current", "page");
    },
  },
  {
    path: "/online-2fa",
    label: "release mobile online 2FA",
    assertReady: async (page) => {
      await expect(page.getByTestId("app-header-mobile-nav").getByRole("link", { name: "在线 2FA" })).toHaveAttribute("aria-current", "page");
    },
  },
  {
    path: "/shared-inboxes",
    label: "release mobile shared inbox",
    assertReady: async (page) => {
      await expect(page.getByRole("heading", { name: "共享收件箱", level: 1 })).toBeVisible();
      await expect(page.getByTestId("app-header-mobile-nav").getByRole("button", { name: "更多" })).toHaveAttribute("aria-current", "page");
    },
  },
  {
    path: "/calendar",
    label: "release mobile calendar",
    assertReady: async (page) => {
      await expect(page.getByRole("heading", { name: "续费/到期日历", level: 1 })).toBeVisible();
    },
  },
  {
    path: "/statistics",
    label: "release mobile statistics",
    assertReady: async (page) => {
      await expect(page.getByRole("heading", { name: "统计分析", level: 1 })).toBeVisible();
    },
  },
  {
    path: "/settings",
    label: "release mobile settings",
    assertReady: async (page) => {
      await expect(page.getByRole("heading", { name: "系统配置" })).toBeVisible();
    },
  },
];

test("release smoke @release keeps primary mobile pages usable", async ({ page }) => {
  // Release smoke 只挡主导航级 H5 断裂；抽屉、日历格子和复杂表单细节留给 nightly 完整 E2E。
  for (const target of mobileReleasePages) {
    await page.goto(target.path);
    await target.assertReady(page);
    await expectNoHorizontalOverflow(page, target.label);
  }
});

test("installed mobile app exposes standalone PWA chrome and compact navigation", async ({ page, request }, testInfo) => {
  await page.goto("/subscriptions");

  const viewportContent = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewportContent).toContain("viewport-fit=cover");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json() as { display?: string; start_url?: string; icons?: Array<{ sizes?: string }> };
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons?.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));

  const mobileNav = page.getByTestId("app-header-mobile-nav");
  await expect(mobileNav).toHaveCSS("position", "fixed");
  await expect(mobileNav.getByRole("link")).toHaveCount(4);
  const navBox = await mobileNav.boundingBox();
  const viewport = page.viewportSize();
  expect(navBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs((navBox!.y + navBox!.height) - viewport!.height)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("mobile-subscriptions.png"), fullPage: false });
  await mobileNav.getByRole("button", { name: "更多" }).click();
  await expect(page.getByRole("menuitem", { name: "共享收件箱" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "退出登录" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mobile-more-menu.png"), fullPage: false });
});
