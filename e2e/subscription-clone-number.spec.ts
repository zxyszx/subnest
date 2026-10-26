import { mkdir } from "node:fs/promises";
import { expect, test } from "./support/test";
import { createProductSubscriptionSeed, deleteProductSubscriptionsByName, productApiFetch } from "./support/product-api";
import { subscriptionCard, SUBSCRIPTION_SEARCH_PLACEHOLDER } from "./support/subscriptions";

test("copying an earlier subscription recommends the next platform number and keeps card actions aligned", async ({ page }) => {
  const names = ["Clone Audit Source", "Clone Audit Other", "Clone Audit Latest", "Clone Audit Copy"];
  const output = "artifacts/clone-number-audit";
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.goto("/subscriptions");
  try {
    for (const [index, number] of [1, 4, 8].entries()) {
      const id = await createProductSubscriptionSeed(page, {
        name: names[index]!, price: "15", startDate: "2026-10-01", nextBillingDate: "2026-11-01",
        paymentMethod: index === 1 ? "alipay" : "credit_card",
      });
      const patched = await productApiFetch(page, `/api/app/subscriptions/${id}`, {
        method: "PATCH", body: { platformName: "Clone Audit Platform", accountNumber: number, cardLast4: index === 1 ? null : "6109" },
      });
      expect(patched.ok, patched.body).toBe(true);
    }
    await page.reload();
    await page.getByPlaceholder(SUBSCRIPTION_SEARCH_PLACEHOLDER).fill("Clone Audit");
    const source = subscriptionCard(page, names[0]!);
    await source.getByRole("button", { name: "更多操作" }).click();
    await page.getByRole("menuitem", { name: "复制", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "复制订阅" });
    await expect(dialog.getByText("编号 1 已被此平台的其他订阅使用")).toBeVisible();
    await expect(dialog.getByText("此平台已用编号：1、4、8")).toBeVisible();
    await page.screenshot({ path: `${output}/occupied-number.png` });
    await dialog.getByLabel("账号编号", { exact: true }).fill("4");
    await expect(dialog.getByText("编号 4 已被此平台的其他订阅使用")).toBeVisible();
    await dialog.getByRole("button", { name: "使用可用编号 9" }).click();
    await expect(dialog.getByText("编号 9 可用，可创建订阅")).toBeVisible();
    await expect(dialog.getByLabel("账号编号", { exact: true })).toHaveValue("9");
    await dialog.getByLabel("服务名称", { exact: true }).fill(names[3]!);
    await page.screenshot({ path: `${output}/available-number.png` });
    await dialog.getByRole("button", { name: "创建副本", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(subscriptionCard(page, names[3]!)).toBeVisible();
    await page.reload();
    await page.getByPlaceholder(SUBSCRIPTION_SEARCH_PLACEHOLDER).fill("Clone Audit");
    await expect(subscriptionCard(page, names[3]!).getByLabel("账号编号 9")).toBeVisible();
    for (const width of [1280, 1536]) {
      await page.setViewportSize({ width, height: 1000 });
      const boxes = await Promise.all(names.slice(0, 3).map((name) => subscriptionCard(page, name).getByTestId("subscription-card-meta-date-group").boundingBox()));
      expect(boxes.every(Boolean)).toBe(true);
      expect(Math.max(...boxes.map((box) => box!.height)) - Math.min(...boxes.map((box) => box!.height))).toBeLessThan(2);
      const buttons = await Promise.all(names.slice(0, 3).map((name) => subscriptionCard(page, name).getByRole("button", { name: "续费", exact: true }).filter({ visible: true }).boundingBox()));
      const cards = await Promise.all(names.slice(0, 3).map((name) => subscriptionCard(page, name).boundingBox()));
      const offsets = buttons.map((box, index) => box!.y - cards[index]!.y);
      expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThan(2);
      await page.screenshot({ path: `${output}/cards-${width}.png` });
    }
    await source.getByRole("button", { name: "更多操作" }).click();
    await page.getByRole("menuitem", { name: "复制", exact: true }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(dialog.getByRole("button", { name: "使用可用编号 10" })).toBeVisible();
    await expect(dialog.getByText("此平台已用编号：1、4、8、9")).toBeVisible();
    await page.screenshot({ path: `${output}/mobile-number.png` });
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
  } finally {
    await deleteProductSubscriptionsByName(page, names);
  }
});
