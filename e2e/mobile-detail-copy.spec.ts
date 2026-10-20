import { mkdir } from "node:fs/promises";
import { expect, test } from "./support/test";
import { createProductSubscriptionSeed, deleteProductSubscriptionsByName, productApiFetch } from "./support/product-api";
import { expectNoHorizontalOverflow } from "./support/layout";

test("subscription detail copies full website and notes on desktop and phone", async ({ page, context }) => {
  const name = "Detail copy audit";
  const website = `https://example.test/account/${"long-path-".repeat(16)}?plan=monthly`;
  const notes = "网站备注：264 Tafawa Balewa Rd\n付款前核对账号与账单。";
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/subscriptions");
  const id = await createProductSubscriptionSeed(page, { name, notes, price: "15", startDate: "2099-01-01", nextBillingDate: "2099-02-01" });
  const patched = await productApiFetch(page, `/api/app/subscriptions/${id}`, { method: "PATCH", body: { website } });
  expect(patched.ok, patched.body).toBe(true);
  await mkdir("artifacts/detail-copy-audit", { recursive: true });
  try {
    for (const width of [1280, 375, 740]) {
      await page.setViewportSize({ width, height: width === 740 ? 375 : 900 });
      await page.goto("/subscriptions");
      await expect(page.getByRole("heading", { name: "订阅列表", exact: true })).toBeVisible();
      await page.evaluate(() => document.documentElement.classList.remove("dark"));
      const openDetail = page.getByRole("button", { name: `查看 ${name} 的详情`, exact: true });
      await openDetail.click({ timeout: 10000, ...(width < 768 ? { position: { x: 8, y: 8 } } : {}) });
      const dialog = page.getByRole("dialog", { name, exact: true });
      await expect(dialog).toBeVisible();
      await page.bringToFront();
      const link = dialog.getByRole("link", { name: website, exact: true });
      await expect(link).toHaveAttribute("href", website);
      await expect(link).toHaveAttribute("target", "_blank");
      await dialog.getByRole("button", { name: "复制 · 网站" }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(website);
      await dialog.getByText(notes, { exact: true }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(notes);
      await expectNoHorizontalOverflow(page, `detail copy ${width}px`);
      const bounds = await dialog.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
      expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
      await page.screenshot({ path: `artifacts/detail-copy-audit/${width}.png`, animations: "disabled" });
      if (width === 375) {
        await page.evaluate(() => document.documentElement.classList.add("dark"));
        await page.screenshot({ path: "artifacts/detail-copy-audit/375-dark.png", animations: "disabled" });
        await page.evaluate(() => document.documentElement.classList.remove("dark"));
      }
    }
  } finally {
    await page.goto("/subscriptions");
    await deleteProductSubscriptionsByName(page, [name]);
  }
});
