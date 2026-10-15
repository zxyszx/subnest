import { expect, test } from "./support/test";
import {
  createProductSubscriptionSeed,
  deleteProductSubscriptionsByName,
} from "./support/product-api";
import { mkdir } from "node:fs/promises";

test("dashboard supports persistent desktop sidebar, manual renewal and mobile navigation", async ({
  page,
}, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-10-15T04:00:00Z"));
  const names = ["Netflix", "YouTube", "ChatGPT", "PrimeVideo", "Spotify"];
  const accounts = names.map((name, index) => ({
    id: `dashboard-account-${index}`,
    subscription: {
      id: `dashboard-sub-${index}`,
      name,
      platformName: name,
      logo: null,
      status: "active",
    },
    name,
    accountNumber: index + 1,
    loginAccount: `member${index}@example.test`,
    hasPassword: false,
    additionalCredential: null,
    verificationLink: null,
    familySharingEnabled: false,
    monthlyCost: String(25 + index * 10),
    currency: "CNY",
    nextBillingDate: "2026-10-20",
    paymentMethod: null,
    cardLast4: null,
    capacity: 5,
    occupiedSeats: 4,
    monthlyRevenue: String(60 + index * 20),
    monthlyRevenueByCurrency: { CNY: String(60 + index * 20) },
    outstandingAmount: "0",
    monthlyProfit: 35 + index * 10,
    status: "active",
    notes: null,
    createdAt: "2026-10-12T08:00:00Z",
  }));
  await page.route("**/api/app/sharing/accounts**", async (route) => {
    const account = accounts.find((item) =>
      new URL(route.request().url()).pathname.endsWith("/" + item.id),
    );
    await route.fulfill({
      json: {
        ok: true,
        data: account
          ? {
              account,
              seats: [1, 2, 3, 4, 5].map((seatNumber) => ({
                id: `${account.id}-${seatNumber}`,
                seatNumber,
                memberName: seatNumber < 5 ? `Member ${seatNumber}` : null,
                contact: null,
                contactType: null,
                monthlyPrice: "15",
                currency: "CNY",
                billingMonths: 3,
                startDate: "2026-09-01",
                expiresAt: "2026-12-01",
                status: seatNumber < 5 ? "active" : "vacant",
                notes: null,
                currentReceivable: null,
              })),
              totals: {
                monthlyRevenue: account.monthlyRevenue,
                contractedRevenue: "180",
                collectedRevenue: "180",
                outstandingAmount: "0",
                monthlyProfit: account.monthlyProfit,
              },
            }
          : { accounts, total: accounts.length },
      },
    });
  });
  await page.goto("/");
  await deleteProductSubscriptionsByName(page, [
    ...names,
    "Renew Today",
    "Renew Overdue",
  ]);
  for (const name of names)
    await createProductSubscriptionSeed(page, {
      name,
      price: "40",
      startDate: "2026-10-01",
      nextBillingDate: "2026-10-16",
      autoRenew: false,
    });
  await createProductSubscriptionSeed(page, {
    name: "Renew Today",
    price: "40",
    startDate: "2026-10-01",
    nextBillingDate: "2026-10-15",
    autoRenew: false,
  });
  await createProductSubscriptionSeed(page, {
    name: "Renew Overdue",
    price: "40",
    startDate: "2026-10-01",
    nextBillingDate: "2026-10-14",
    autoRenew: false,
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "经营总览" })).toBeVisible();
  await expect(page.getByTestId("dashboard-revenue-chart")).toHaveCount(0);
  await expect(page.getByText("扣款失败", { exact: true })).toHaveCount(0);
  const output = "artifacts/dashboard";
  await mkdir(output, { recursive: true });
  const sidebar = page.getByTestId("workspace-sidebar");
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(sidebar).toHaveCSS("width", "240px");
    const sidebarHeader = page.getByTestId("workspace-sidebar-header");
    const collapseToggle = sidebarHeader.getByRole("button", { name: "收起导航", exact: true });
    await expect(collapseToggle).toBeVisible();
    expect((await collapseToggle.boundingBox())!.y).toBeLessThan(72);
    expect((await sidebar.getByRole("link", { name: "仪表盘", exact: true }).boundingBox())!.y).toBeLessThan(90);
    const updateEntry = page.getByRole("button", { name: "打开系统更新", exact: true });
    await expect(updateEntry).toBeVisible();
    await updateEntry.click();
    await expect(page.getByText("当前版本", { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sidebar.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(sidebar.locator('a[aria-current="page"]')).toHaveClass(
      /bg-primary/,
    );
    await page
      .getByTestId("app-header")
      .getByRole("button", { name: /切换主题|主题/ })
      .click();
    await expect(page.getByTestId("dashboard-stat-monthly-spend")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await page.screenshot({
      path: `${output}/screenshot-expanded.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(await page.evaluate(() => document.getElementById("root")!.scrollHeight <= innerHeight + 1)).toBe(true);
    await expect(page.locator('#dashboard-subscription-renewals nav[aria-label="分页"]')).toBeVisible();
    const expandedWidth = (await page
      .getByTestId("workspace-content")
      .boundingBox())!.width;
    await page.getByRole("button", { name: "收起导航", exact: true }).click();
    await expect(sidebar).toHaveCSS("width", "72px");
    await expect(updateEntry).toBeVisible();
    expect(
      (await page.getByTestId("workspace-content").boundingBox())!.width,
    ).toBeGreaterThan(expandedWidth);
    await sidebar.getByRole("link", { name: "统计", exact: true }).hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.mouse.move(800, 30);
    await expect(page.getByRole("tooltip")).not.toBeVisible();
    await page.getByRole("button", { name: "展开导航", exact: true }).blur();
    await expect(page.getByTestId("workspace-sidebar-toggle-logo")).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("workspace-sidebar-toggle-icon")).toHaveCSS("opacity", "0");
    await page.screenshot({
      path: `${output}/screenshot-collapsed.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "展开导航", exact: true }).hover();
    await expect(page.getByTestId("workspace-sidebar-toggle-icon")).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("workspace-sidebar-toggle-logo")).toHaveCSS("opacity", "0");
    await expect(page.getByRole("tooltip")).toContainText("展开导航");
    await page.screenshot({ path: `${output}/screenshot-sidebar-hover.png`, animations: "disabled" });
    await page.reload();
    await expect(sidebar).toHaveCSS("width", "72px");
    await page.getByRole("button", { name: "展开导航", exact: true }).click();
    await expect(sidebar).toHaveCSS("width", "240px");
    await page.keyboard.press("Control+Shift+S");
    await expect(sidebar).toHaveCSS("width", "72px");
    const expandToggle = page.getByRole("button", { name: "展开导航", exact: true });
    await expandToggle.focus();
    await expect(page.getByTestId("workspace-sidebar-toggle-icon")).toHaveCSS("opacity", "1");
    await page.keyboard.press("Enter");
    await expect(sidebar).toHaveCSS("width", "240px");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await sidebar.evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.001);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page
      .getByTestId("app-header")
      .getByRole("button", { name: /切换主题|主题/ })
      .click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.screenshot({
      path: `${output}/screenshot-dark.png`,
      fullPage: true,
      animations: "disabled",
    });
  } else {
    await expect(sidebar).not.toBeVisible();
    await page.screenshot({
      path: `${output}/screenshot-mobile.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 740 });
    await expect(sidebar).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${output}/screenshot-small-mobile.png`,
      fullPage: true,
    });
  }
  const renewButtons = page
    .locator("#dashboard-subscription-renewals")
    .getByRole("button", { name: "续费", exact: true });
  for (const button of await renewButtons.all()) {
    const box = await button.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  for (const [label, name, excluded] of [
    ["今日续费", "Renew Today", "Renew Overdue"],
    ["逾期订阅", "Renew Overdue", "Renew Today"],
  ]) {
    await page
      .getByRole("button", { name: new RegExp(`${label}\\s*1`) })
      .click();
    const dialog = page.getByRole("dialog", { name: label });
    await expect(dialog.getByText(name, { exact: true })).toBeVisible();
    await expect(dialog.getByText(excluded, { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Netflix", { exact: true })).toHaveCount(0);
    await expect(dialog.locator(".subscription-logo-contrast")).toHaveCount(0);
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  }
  await page.getByRole("button", { name: /订阅续费\s*7/ }).click();
  const worklist = page.getByRole("dialog", { name: "订阅续费" });
  await expect(worklist).toBeVisible();
  await expect(
    worklist.getByRole("button", { name: "续费", exact: true }),
  ).toHaveCount(7);
  await page.screenshot({
    path: `${output}/screenshot-renewals-${testInfo.project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  for (const button of await worklist
    .getByRole("button", { name: "续费", exact: true })
    .all()) {
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    const panel = (await worklist.boundingBox())!;
    expect(box.x + box.width).toBeLessThan(panel.x + panel.width - 12);
  }
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("link", { name: /可招募车位/ }).click();
  await expect(page).toHaveURL(/\/sharing\?status=available/);
  if (testInfo.project.name === "desktop")
    await expect(
      page.getByRole("combobox").filter({ hasText: "有空位" }),
    ).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await expect(page.getByRole("navigation", { name: "分页" })).toBeVisible();
    expect(await page.evaluate(() => document.getElementById("root")!.scrollHeight <= innerHeight + 1)).toBe(true);
    const next = page.getByRole("button", { name: "下一页", exact: true });
    await expect(next).toBeEnabled();
    await next.click();
    await page.keyboard.press("/");
    await page.getByRole("searchbox").fill("1");
    await page.keyboard.press("Control+Shift+S");
    await expect(sidebar).toHaveCSS("width", "240px");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("member0@example.test");
    await page.getByRole("searchbox").fill("");
    await page.screenshot({ path: `${output}/screenshot-sharing-workspace.png`, animations: "disabled" });
    await page.goto("/subscriptions");
    await expect(page.getByTestId("subscription-workspace-list")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "分页" })).toBeVisible();
    expect(await page.evaluate(() => document.getElementById("root")!.scrollHeight <= innerHeight + 1)).toBe(true);
    await page.getByRole("button", { name: "逾期订阅", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Renew Overdue");
    await page.getByRole("button", { name: "今日续费", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Renew Today");
    await page.getByRole("button", { name: "全部状态", exact: true }).click();
    await page.screenshot({ path: `${output}/screenshot-subscriptions-workspace.png`, animations: "disabled" });
  }
});
