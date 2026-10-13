import { expect, test } from "./support/test";
import { createProductSubscriptionSeed, deleteProductSubscriptionsByName } from "./support/product-api";
import { mkdir } from "node:fs/promises";

test("dashboard supports persistent desktop sidebar, manual renewal and mobile navigation", async ({ page }, testInfo) => {
  const names = ["Netflix", "YouTube", "ChatGPT", "PrimeVideo", "Spotify"];
  const accounts = names.map((name, index) => ({
    id: `dashboard-account-${index}`,
    subscription: { id: `dashboard-sub-${index}`, name, platformName: name, logo: null, status: "active" },
    name, accountNumber: index + 1, loginAccount: `member${index}@example.test`, hasPassword: false,
    additionalCredential: null, verificationLink: null, familySharingEnabled: false,
    monthlyCost: String(25 + index * 10), currency: "CNY", nextBillingDate: "2026-10-20",
    paymentMethod: null, cardLast4: null, capacity: 5, occupiedSeats: 4,
    monthlyRevenue: String(60 + index * 20), monthlyRevenueByCurrency: { CNY: String(60 + index * 20) },
    outstandingAmount: "0", monthlyProfit: 35 + index * 10, status: "active", notes: null, createdAt: "2026-10-12T08:00:00Z",
  }));
  await page.route("**/api/app/sharing/accounts**", async (route) => {
    const account = accounts.find((item) => new URL(route.request().url()).pathname.endsWith("/" + item.id));
    await route.fulfill({ json: { ok: true, data: account ? {
      account,
      seats: [1, 2, 3, 4, 5].map((seatNumber) => ({
        id: `${account.id}-${seatNumber}`, seatNumber,
        memberName: seatNumber < 5 ? `Member ${seatNumber}` : null,
        contact: null, contactType: null, monthlyPrice: "15", currency: "CNY", billingMonths: 3,
        startDate: "2026-09-01", expiresAt: "2026-12-01", status: seatNumber < 5 ? "active" : "vacant",
        notes: null, currentReceivable: null,
      })),
      totals: { monthlyRevenue: account.monthlyRevenue, contractedRevenue: "180", collectedRevenue: "180", outstandingAmount: "0", monthlyProfit: account.monthlyProfit },
    } : { accounts, total: accounts.length } } });
  });
  await page.goto("/");
  await deleteProductSubscriptionsByName(page, names);
  for (const name of names) await createProductSubscriptionSeed(page, { name, price: "40", startDate: "2026-10-01", nextBillingDate: "2026-10-16", autoRenew: false });
  await page.reload();
  await expect(page.getByRole("heading", { name: "经营总览" })).toBeVisible();
  await expect(page.getByTestId("dashboard-revenue-chart").locator("svg").first()).toBeVisible();
  await expect(page.getByText("扣款失败", { exact: true })).toHaveCount(0);
  const output = "artifacts/dashboard";
  await mkdir(output, { recursive: true });
  const sidebar = page.getByTestId("workspace-sidebar");
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1600, height: 1500 });
    await expect(sidebar).toHaveCSS("width", "240px");
    await expect(sidebar.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(sidebar.locator('a[aria-current="page"]')).toHaveClass(/bg-primary/);
    await page.getByTestId("app-header").getByRole("button", { name: /切换主题|主题/ }).click();
    await expect(page.getByTestId("dashboard-stat-monthly-spend")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.screenshot({ path: `${output}/screenshot-expanded.png`, fullPage: true, animations: "disabled" });
    const expandedWidth = (await page.getByTestId("workspace-content").boundingBox())!.width;
    await page.getByRole("button", { name: "收起导航", exact: true }).click();
    await expect(sidebar).toHaveCSS("width", "72px");
    expect((await page.getByTestId("workspace-content").boundingBox())!.width).toBeGreaterThan(expandedWidth);
    await sidebar.getByRole("link", { name: "统计", exact: true }).hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.mouse.move(800, 30);
    await expect(page.getByRole("tooltip")).not.toBeVisible();
    await page.screenshot({ path: `${output}/screenshot-collapsed.png`, fullPage: true, animations: "disabled" });
    await page.reload();
    await expect(sidebar).toHaveCSS("width", "72px");
    await page.getByRole("button", { name: "展开导航", exact: true }).click();
    await expect(sidebar).toHaveCSS("width", "240px");
    await page.getByTestId("app-header").getByRole("button", { name: /切换主题|主题/ }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.screenshot({ path: `${output}/screenshot-dark.png`, fullPage: true, animations: "disabled" });
  } else {
    await expect(sidebar).not.toBeVisible();
    await page.screenshot({ path: `${output}/screenshot-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    await expect(sidebar).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `${output}/screenshot-small-mobile.png`, fullPage: true });
  }
  const renewButtons = page.locator("#dashboard-subscription-renewals").getByRole("button", { name: "续费", exact: true });
  for (const button of await renewButtons.all()) {
    const box = await button.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await page.getByRole("button", { name: /订阅续费\s*5/ }).click();
  await expect(page.getByRole("dialog", { name: "7 天内订阅续费" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("link", { name: /可招募车位/ }).click();
  await expect(page).toHaveURL(/\/sharing\?status=available/);
  if (testInfo.project.name === "desktop") await expect(page.getByRole("combobox").filter({ hasText: "有空位" })).toBeVisible();
});
