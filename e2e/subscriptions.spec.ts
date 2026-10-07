// 桌面订阅 E2E 覆盖创建、筛选、编辑、Logo sheet 和持久化回读，是订阅主流程的跨组件回归基线。
import type { ElementHandle, Locator } from "@playwright/test";
import subscriptionCollectionContractFixtures from "../packages/shared/src/contract-fixtures/subscription-collection-contract-fixtures.json";
import { expect, test } from "./support/test";
import {
  createSubscription,
  deferNextSubscriptionDetailRead,
  expectEmptyTagCursorStaysInline,
  openAddSubscriptionDialog,
  openSubscriptionDetailDialog,
  openSubscriptionEditDialog,
  saveSubscriptionDialog,
  SUBSCRIPTION_SEARCH_PLACEHOLDER,
  subscriptionCard,
  uniqueE2EName,
} from "./support/subscriptions";
import {
  expectActionNearContainerBottom,
  captureLogoSheetScrollMetrics,
  expectDetailFooterStableWhileScrolling,
  expectScrollContentNearFooter,
  expectScrollableRegionReachesTarget,
  expectVerticallyCenteredInViewport,
} from "./support/layout";
import { installLogoCandidateRoute } from "./support/media-candidates";
import { createProductSubscriptionSeed, deleteProductSubscriptionsByName } from "./support/product-api";

async function getRequiredElement(locator: Locator, label: string): Promise<ElementHandle<SVGElement | HTMLElement>> {
  const element = await locator.elementHandle();
  if (!element) throw new Error(`Missing element for ${label}`);
  return element;
}

async function expectSameDOMNode(
  before: ElementHandle<SVGElement | HTMLElement>,
  current: Locator,
  label: string,
) {
  const after = await getRequiredElement(current, `${label} after resolve`);
  expect(await before.evaluate((node, currentNode) => node === currentNode, after), label).toBe(true);
}

test("desktop compact toolbar keeps platform, search, and sorting in one row", async ({ page }) => {
  await page.goto("/subscriptions");
  await expect(page.getByRole("heading", { name: "订阅列表" })).toBeVisible();

  const toolbar = page.getByTestId("desktop-subscription-toolbar");
  const platformFilter = toolbar.getByRole("navigation", { name: "按平台筛选订阅" });
  const search = toolbar.getByPlaceholder(SUBSCRIPTION_SEARCH_PLACEHOLDER);
  const sort = toolbar.getByRole("combobox", { name: "排序" });
  await expect(platformFilter).toBeVisible();
  await expect(search).toBeVisible();
  await expect(sort).toHaveText("最近到期");
  const [platformBox, searchBox, sortBox] = await Promise.all([
    platformFilter.boundingBox(),
    search.boundingBox(),
    sort.boundingBox(),
  ]);
  expect(platformBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(sortBox).not.toBeNull();
  expect(Math.abs((platformBox?.y ?? 0) - (searchBox?.y ?? 0))).toBeLessThan(16);
  expect((searchBox?.x ?? 0)).toBeGreaterThan((platformBox?.x ?? 0));
  expect((sortBox?.x ?? 0)).toBeGreaterThan((searchBox?.x ?? 0));

  await sort.click();
  await page.getByRole("option", { name: "序号正序" }).click();
  await expect(sort).toHaveText("序号正序");
});

test("desktop tall subscription dialog keeps footer tight to the panel bottom", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/subscriptions");
  await expect(page.getByRole("heading", { name: "订阅列表" })).toBeVisible();

  const dialog = await openAddSubscriptionDialog(page);
  await expectVerticallyCenteredInViewport(page, dialog, "desktop tall subscription dialog");
  await expectActionNearContainerBottom(
    dialog,
    dialog.getByRole("button", { name: "添加订阅" }),
    "desktop tall subscription dialog submit",
  );
  await expectScrollContentNearFooter(
    dialog.locator("[data-subscription-dialog-scroll]"),
    "desktop tall subscription dialog scroll end",
  );
});

test("family sharing switch and verification mode changes keep the edit dialog visible", async ({ page }, testInfo) => {
  const subscriptionName = uniqueE2EName(testInfo, "Family Sharing Toggle");
  await page.route("**/api/app/admin/newszxcn/mailboxes", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { items: [] } }),
  }));
  await page.route("**/api/app/admin/shared-inbox-links", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: { links: [] } }),
  }));
  await page.goto("/subscriptions");
  await createProductSubscriptionSeed(page, {
    name: subscriptionName,
    price: "49.9",
    currency: "USD",
    startDate: "2026-09-03",
    nextBillingDate: "2026-11-03",
  });

  try {
    await page.reload();
    const dialog = await openSubscriptionEditDialog(page, subscriptionName);
    const title = dialog.getByRole("heading", { name: "编辑订阅" });
    const footer = dialog.locator("[data-subscription-dialog-footer]");
    const masterSwitch = dialog.getByRole("switch", { name: "家庭共享" });

    await masterSwitch.scrollIntoViewIfNeeded();
    await expect(masterSwitch).not.toBeChecked();
    await masterSwitch.click();
    await expect(masterSwitch).toBeChecked();
    const totpMode = dialog.getByText("在线 2FA 验证", { exact: true });
    await totpMode.click();
    await expect(totpMode).toBeInViewport();
    await expect(dialog.getByLabel("登录账号", { exact: true })).toBeInViewport();
    await expect(masterSwitch).toBeInViewport();
    await expect(title).toBeVisible();
    await expect(footer.getByRole("button", { name: "保存修改" })).toBeVisible();

    await masterSwitch.click();
    await expect(masterSwitch).not.toBeChecked();
    await expect(dialog.getByRole("radio", { name: "在线 2FA 验证" })).toBeHidden();
    await expect(title).toBeVisible();
    await expect(footer.getByRole("button", { name: "保存修改" })).toBeVisible();
    await dialog.screenshot({ path: testInfo.outputPath("family-sharing-disabled.png") });
  } finally {
    await deleteProductSubscriptionsByName(page, [subscriptionName]);
  }
});

test("short desktop calendar and long detail keep their scroll and footer geometry", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto("/");
  const subscriptionName = uniqueE2EName(testInfo, "Responsive Desktop Detail");
  const notesEnd = `${subscriptionName} notes end`;
  const notes = [
    ...Array.from({ length: 24 }, (_, index) => `Desktop responsive detail note line ${index + 1}.`),
    notesEnd,
  ].join("\n");
  const subscriptionId = await createProductSubscriptionSeed(page, {
    name: subscriptionName,
    price: "123456.78",
    currency: "USD",
    category: "hosting_domains",
    paymentMethod: "google_pay",
    startDate: "2099-01-01",
    nextBillingDate: "2099-06-15",
    reminderDays: 30,
    tags: Array.from({ length: 30 }, (_, index) => `responsive-detail-tag-${index + 1}`),
    notes,
  });

  try {
    await page.goto("/subscriptions");
    await expect(page.getByRole("heading", { name: "订阅列表" })).toBeVisible();

    const detailGate = await deferNextSubscriptionDetailRead(page, subscriptionId);
    try {
      const detailPromise = openSubscriptionDetailDialog(page, subscriptionName);
      const detailRequestUrl = await detailGate.waitForRequest();
      const detail = await detailPromise;
      const header = detail.dialog.getByRole("heading", { name: subscriptionName, exact: true });
      const loadingFrame = detail.dialog.getByTestId("subscription-detail-data-loading");
      const scrollRegion = detail.dialog.locator('[data-dialog-scroll-region="subscription-detail"]');
      const footer = detail.dialog.locator("[data-subscription-dialog-footer]");
      await expect(header).toBeVisible();
      await expect(loadingFrame).toBeVisible();
      await expect(scrollRegion).toBeVisible();
      await expect(footer).toBeVisible();
      const loadingNodes = {
        dialog: await getRequiredElement(detail.dialog, "loading detail dialog"),
        footer: await getRequiredElement(footer, "loading detail footer"),
        frame: await getRequiredElement(loadingFrame, "loading detail frame"),
        header: await getRequiredElement(header, "loading detail header"),
        scroll: await getRequiredElement(scrollRegion, "loading detail scroll region"),
      };

      const detailResponsePromise = page.waitForResponse((response) => response.url() === detailRequestUrl);
      detailGate.release();
      const detailResponse = await detailResponsePromise;
      expect(detailResponse.ok(), await detailResponse.text()).toBe(true);
      const notes = detail.dialog.getByText(notesEnd, { exact: false });
      await expect(notes).toBeVisible();
      await expect(loadingFrame).toBeHidden();
      await expectSameDOMNode(loadingNodes.dialog, detail.dialog, "detail dialog shell remains stable");
      await expectSameDOMNode(loadingNodes.header, header, "detail header remains stable");
      await expectSameDOMNode(loadingNodes.frame, scrollRegion.locator(".."), "detail frame remains stable");
      await expectSameDOMNode(loadingNodes.scroll, scrollRegion, "detail scroll region remains stable");
      await expectSameDOMNode(loadingNodes.footer, footer, "detail footer remains stable");

      for (const action of ["关闭", "添加到日历", "续费", "编辑"]) {
        await expect(footer.getByRole("button", { name: action, exact: true })).toBeVisible();
      }
      await expectDetailFooterStableWhileScrolling(
        scrollRegion,
        notes,
        "short desktop subscription detail",
      );

      await footer.getByRole("button", { name: "添加到日历", exact: true }).click();
      await expect(detail.dialog).toBeHidden();
      const calendarDialog = page.getByRole("dialog", { name: "添加到日历" });
      await expect(calendarDialog).toBeVisible();
      await expect(calendarDialog.getByRole("heading", { name: "添加到日历" })).toBeFocused();
      await expectScrollableRegionReachesTarget(
        calendarDialog.locator('[data-dialog-scroll-region="subscription-calendar"]'),
        calendarDialog.getByRole("link", { name: "用 Yahoo Calendar 打开" }),
        "short desktop subscription calendar",
      );
      await calendarDialog.getByRole("button", { name: "关闭" }).click();
      await expect(calendarDialog).toBeHidden();

      const reopenedDetail = await openSubscriptionDetailDialog(page, subscriptionName);
      await reopenedDetail.dialog.locator("[data-subscription-dialog-footer]")
        .getByRole("button", { name: "关闭", exact: true })
        .click();
      await expect(reopenedDetail.dialog).toBeHidden();
      await expect(reopenedDetail.trigger).toBeFocused();
    } finally {
      await detailGate.dispose();
    }
  } finally {
    await deleteProductSubscriptionsByName(page, [subscriptionName]);
  }
});

test("desktop subscription create, tag search, edit, and reload persistence", async ({ page }, testInfo) => {
  const plainName = uniqueE2EName(testInfo, "Plain Cloud");
  const taggedName = uniqueE2EName(testInfo, "Tagged Cloud");
  const editedName = `${taggedName} Pro`;
  const tagName = uniqueE2EName(testInfo, "work");

  await page.goto("/subscriptions");
  await expect(page.getByRole("heading", { name: "订阅列表" })).toBeVisible();

  await createSubscription(page, {
    name: plainName,
    price: "15",
    currencyLabel: "USD",
  });
  await createSubscription(page, {
    name: taggedName,
    price: "20",
    currencyLabel: "USD",
    tags: `${tagName}、云服务`,
  });

  const search = page.getByPlaceholder(SUBSCRIPTION_SEARCH_PLACEHOLDER);
  await search.fill(tagName);
  await expect(subscriptionCard(page, taggedName)).toBeVisible();
  await expect(subscriptionCard(page, plainName)).toBeHidden();
  await search.clear();
  await expect(subscriptionCard(page, plainName)).toBeVisible();

  const editDialog = await openSubscriptionEditDialog(page, taggedName);
  await expectVerticallyCenteredInViewport(page, editDialog, "desktop edit subscription dialog");
  await editDialog.getByLabel("服务名称", { exact: true }).fill(editedName);
  const desktopTagInput = editDialog.getByLabel("标签", { exact: true });
  await desktopTagInput.fill("Writing、test、Docs、Research");
  await desktopTagInput.click();
  await expectEmptyTagCursorStaysInline(page, editDialog);
  await page.keyboard.press("Escape");
  await saveSubscriptionDialog(page, editDialog, "保存修改");
  await expect(subscriptionCard(page, editedName)).toBeVisible();
  await expect(subscriptionCard(page, taggedName)).toBeHidden();

  const emptyTagDialog = await openAddSubscriptionDialog(page);
  await expectActionNearContainerBottom(
    emptyTagDialog,
    emptyTagDialog.getByRole("button", { name: "添加订阅" }),
    "desktop subscription dialog submit",
  );
  await emptyTagDialog.getByLabel("标签", { exact: true }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await emptyTagDialog.getByRole("button", { name: "取消" }).click();
  await expect(emptyTagDialog).toBeHidden();

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "续费/到期日历", level: 1 })).toBeVisible();
  for (let attempts = 0; attempts < 3; attempts += 1) {
    const calendarEntry = page.getByRole("button", { name: editedName, exact: true }).first();
    if (await calendarEntry.isVisible().catch(() => false)) {
      await calendarEntry.click();
      break;
    }
    await page.getByRole("button", { name: "下个月" }).click();
  }
  const detailDialog = page.getByRole("dialog", { name: editedName });
  await expect(detailDialog).toBeVisible();
  await expectActionNearContainerBottom(
    detailDialog,
    detailDialog.getByRole("button", { name: "编辑" }),
    "desktop calendar detail edit",
  );
  await detailDialog.locator("[data-subscription-dialog-footer]")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await expect(detailDialog).toBeHidden();

  await page.goto("/subscriptions");
  await expect(subscriptionCard(page, plainName)).toBeVisible();
  await expect(subscriptionCard(page, editedName)).toBeVisible();
});

test("desktop 1000-row search uses one index request and keeps the virtual list scrollable", async ({ page }) => {
  const indexRequests: string[] = [];
  const collectionTemplate = subscriptionCollectionContractFixtures.collectionItems[0];
  if (!collectionTemplate) throw new Error("Missing recurring subscription collection contract fixture");
  const subscriptions = Array.from({ length: 1000 }, (_, index) => ({
    ...collectionTemplate,
    id: `scale-${index}`,
    name: `Scale Needle ${index}`,
  }));
  await page.route("**/api/app/subscriptions/index**", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.searchParams.get("q") === "Scale Needle") {
      indexRequests.push(requestUrl.toString());
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { subscriptions, total: subscriptions.length } }),
    });
  });

  await page.goto("/subscriptions");
  await expect(page.getByRole("heading", { name: "订阅列表" })).toBeVisible();
  const filteredIndexResponse = page.waitForResponse((response) => {
    if (!response.url().includes("/api/app/subscriptions/index")) return false;
    return new URL(response.url()).searchParams.get("q") === "Scale Needle";
  });
  await page.getByPlaceholder(SUBSCRIPTION_SEARCH_PLACEHOLDER).fill("Scale Needle");
  await filteredIndexResponse;

  await expect(page.getByText("Scale Needle 0", { exact: true })).toBeVisible();
  expect(indexRequests).toHaveLength(1);
  expect(new URL(indexRequests[0] ?? "http://invalid").searchParams.get("q")).toBe("Scale Needle");

  const virtualList = page.getByTestId("virtualized-subscription-list");
  await expect(virtualList).toBeVisible();
  await page.locator("#root").evaluate((root) => root.scrollTo({ top: root.scrollHeight }));
  await expect(page.getByText("Scale Needle 999", { exact: true })).toBeVisible();
  expect(indexRequests).toHaveLength(1);
});

test("desktop import Logo editor gives search candidates a real scroll viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installLogoCandidateRoute(page);

  await page.goto("/subscriptions");
  await expect(page.getByRole("heading", { name: "订阅列表" })).toBeVisible();

  await page.getByRole("button", { name: "导入数据" }).click();
  const importDialog = page.getByRole("dialog", { name: "导入数据" });
  await expect(importDialog).toBeVisible();

  await importDialog.getByRole("tab", { name: "粘贴 JSON" }).click();
  await importDialog.getByPlaceholder("粘贴 Renewlet 或 Wallos JSON...").fill(JSON.stringify([{
    Name: "Linear",
    "Payment Cycle": "Monthly",
    "Next Payment": "2026-06-01",
    Price: "$10",
    Category: "Software",
    "Payment Method": "Visa",
  }]));
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/api/app/import/preview") && response.request().method() === "POST",
    ),
    importDialog.getByRole("button", { name: "生成预览" }).click(),
  ]);

  await importDialog.getByRole("button", { name: "修改 Logo" }).first().click();
  const importLogoSheet = page.locator(".h5-import-logo-sheet");
  await expect(importLogoSheet).toBeVisible();
  await expect(importLogoSheet.getByRole("button", { name: /Linear 1/ }).first()).toBeVisible({ timeout: 10_000 });

  const scroll = await captureLogoSheetScrollMetrics(importLogoSheet, "import-logo-search-results");
  expect(scroll.scrollHeight, JSON.stringify(scroll, null, 2)).toBeGreaterThan(scroll.clientHeight);
  expect(scroll.clientHeight, JSON.stringify(scroll, null, 2)).toBeGreaterThanOrEqual(220);
  expect(scroll.scrollTop, JSON.stringify(scroll, null, 2)).toBeGreaterThanOrEqual(
    scroll.scrollHeight - scroll.clientHeight - 1,
  );
  expect(scroll.lastBottomGap, JSON.stringify(scroll, null, 2)).toBeGreaterThanOrEqual(8);
});
