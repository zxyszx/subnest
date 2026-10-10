// 移动端订阅 E2E 同时保护标签抽屉、tag 输入和底部操作区；这些交互依赖真实触控布局与浮层栈。
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/test";
import {
  createSubscription,
  expectTagInputPopoverLayout,
  expectTagSuggestionListScrollable,
  openSubscriptionDetailDialog,
  openSubscriptionEditDialog,
  SUBSCRIPTION_SEARCH_PLACEHOLDER,
  subscriptionCard,
  uniqueE2EName,
} from "./support/subscriptions";
import {
  expectDetailFooterStableWhileScrolling,
  expectNoHorizontalOverflow,
  expectScrollableRegionReachesTarget,
  getRequiredLocatorBoundingBox,
} from "./support/layout";
import {
  createProductSubscriptionSeed,
  deleteProductSubscriptionsByName,
  productApiFetch,
} from "./support/product-api";

type SubscriptionCardLayoutSeed = {
  name: string;
  category: string;
  paymentMethod: string;
  startDate: string;
  nextBillingDate: string;
};

async function createSubscriptionLayoutRecord(
  page: Page,
  seed: SubscriptionCardLayoutSeed,
) {
  // 直接走产品 API 种记录，让用例只覆盖真实卡片排版；认证态仍来自 setup project。
  await createProductSubscriptionSeed(page, {
    ...seed,
    price: "20",
    currency: "USD",
    reminderDays: 7,
  });
}

async function captureSubscriptionCardLayout(card: Locator) {
  return card.evaluate((element) => {
    const query = (testId: string) => {
      const target = element.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      if (!target) {
        throw new Error(`Missing ${testId}`);
      }
      const rect = target.getBoundingClientRect();
      return {
        left: Math.round(rect.left * 100) / 100,
        right: Math.round(rect.right * 100) / 100,
        top: Math.round(rect.top * 100) / 100,
      };
    };

    const cardRect = element.getBoundingClientRect();
    return {
      cardRight: Math.round(cardRect.right * 100) / 100,
      billingDate: query("subscription-card-meta-billing-date"),
      paymentMethod: query("subscription-card-meta-payment-method"),
      relativeBilling: query("subscription-card-meta-relative-billing"),
      startDate: query("subscription-card-meta-start-date"),
    };
  });
}

async function dateOnlyFromLocalToday(page: Page, days: number) {
  return page.evaluate((offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, days);
}

async function captureAmountLineMetrics(amount: Locator) {
  return amount.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const lineRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    const amountRect = element.getBoundingClientRect();
    return {
      amountRight: amountRect.right,
      lineCount: lineRects.length,
      textRight: lineRects.at(-1)?.right ?? Number.NaN,
    };
  });
}

test("mobile compact filters, tag search, and tag input layout", async ({ page }, testInfo) => {
  const plainName = uniqueE2EName(testInfo, "Mobile Plain");
  const taggedName = uniqueE2EName(testInfo, "Mobile Tagged");
  const tagName = uniqueE2EName(testInfo, "mobile-tag");
  const manyTags = [
    tagName,
    "云服务",
    "Issues",
    "Planning",
    "Testing",
    "QA",
    "E2E",
    "Browsers",
    "Automation",
    "Performance",
    "Billing",
    "Design",
    "Docs",
  ].join("、");

  await page.goto("/subscriptions");
  await expect(page.getByRole("heading", { name: "订阅列表" })).toBeVisible();

  await createSubscription(page, {
    name: plainName,
    price: "8",
    currencyLabel: "USD",
  });
  await createSubscription(page, {
    name: taggedName,
    price: "12",
    currencyLabel: "USD",
    tags: manyTags,
  });

  const compactToolbar = page.getByTestId("mobile-compact-filter-toolbar");
  const search = compactToolbar.getByPlaceholder(SUBSCRIPTION_SEARCH_PLACEHOLDER);
  const filterToggle = compactToolbar.getByRole("button", { name: "筛选" });
  const [searchBox, filterBox] = await Promise.all([
    getRequiredLocatorBoundingBox(search, "mobile subscription search"),
    getRequiredLocatorBoundingBox(filterToggle, "mobile filter toggle"),
  ]);
  expect(Math.abs(searchBox.y - filterBox.y), "mobile search and filter toggle should share a row").toBeLessThan(8);
  expect(filterBox.x, "mobile filter toggle should sit to the right of search").toBeGreaterThan(
    searchBox.x + searchBox.width - 1,
  );

  await filterToggle.click();
  const expandedFilters = page.getByTestId("mobile-expanded-filters");
  await expect(expandedFilters).toBeVisible();
  const sort = expandedFilters.getByRole("combobox", { name: "排序" });
  await expect(sort).toHaveText("最近到期");
  await sort.click();
  await page.getByRole("option", { name: "序号倒序" }).click();
  await expect(sort).toHaveText("序号倒序");

  await search.fill(tagName);
  await expect(subscriptionCard(page, taggedName)).toBeVisible();
  await expect(subscriptionCard(page, plainName)).toBeHidden();
  await expect(subscriptionCard(page, taggedName)).toBeInViewport();
  await search.clear();
  await expect(subscriptionCard(page, plainName)).toBeVisible();

  const plainEditDialog = await openSubscriptionEditDialog(page, plainName);
  await plainEditDialog.getByLabel("标签", { exact: true }).click();
  await expectTagSuggestionListScrollable(page);
  await page.keyboard.press("Escape");
  await plainEditDialog.getByRole("button", { name: "取消" }).click();
  await expect(plainEditDialog).toBeHidden();

  const editDialog = await openSubscriptionEditDialog(page, taggedName);
  const editTagInput = editDialog.getByLabel("标签", { exact: true });
  await editTagInput.fill("测试、研发、财务、运营、设计、增长");
  await editTagInput.click();
  await page.keyboard.type("layout");
  await expectTagInputPopoverLayout(page, editDialog);
  await page.keyboard.press("Escape");
  await editDialog.getByRole("button", { name: "取消" }).click();
  await expect(editDialog).toBeHidden();
});

test("mobile subscription card keeps date metadata naturally on the first available row", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/subscriptions");
  await expect(page.getByRole("heading", { name: "订阅列表" })).toBeVisible();

  const subscriptionName = uniqueE2EName(testInfo, "Netflix Pro");
  const now = Date.now();
  const dateOnlyFromNow = (days: number) => new Date(now + days * 86_400_000).toISOString().slice(0, 10);
  await createSubscriptionLayoutRecord(page, {
    name: subscriptionName,
    category: "hosting_domains",
    paymentMethod: "google_pay",
    startDate: dateOnlyFromNow(-30),
    nextBillingDate: dateOnlyFromNow(30),
  });
  await page.reload();
  await page.getByPlaceholder(SUBSCRIPTION_SEARCH_PLACEHOLDER).fill(subscriptionName);

  const card = subscriptionCard(page, subscriptionName);
  await expect(card).toBeVisible();
  await expect(card).toBeInViewport();
  await expect(card).toHaveAttribute("data-mobile-expanded", "false");
  await expect(card.getByTestId("subscription-card-mobile-expiry")).toBeVisible();
  await expect(card.getByTestId("subscription-card-meta-flow")).toBeHidden();
  await card.screenshot({ path: testInfo.outputPath("mobile-subscription-compact.png") });
  await card.getByRole("button", { name: "展开全部信息" }).click();
  await expect(card).toHaveAttribute("data-mobile-expanded", "true");
  await expect(card.getByTestId("subscription-card-meta-flow")).toBeVisible();
  await expectNoHorizontalOverflow(page, "mobile subscription card metadata");

  const layout = await captureSubscriptionCardLayout(card);

  expect(Math.abs(layout.relativeBilling.top - layout.billingDate.top), "relative and absolute renewal dates should share the reminder row").toBeLessThanOrEqual(4);
  expect(Math.abs(layout.startDate.top - layout.paymentMethod.top), "start date and payment method should share the detail row").toBeLessThanOrEqual(4);
  expect(layout.startDate.top, "detail row should follow the renewal reminder").toBeGreaterThan(layout.billingDate.top);
  expect(layout.billingDate.right, "renewal date should stay inside card").toBeLessThanOrEqual(layout.cardRight + 1);
  expect(layout.paymentMethod.right, "payment method should stay inside card").toBeLessThanOrEqual(layout.cardRight + 1);
});

test("mobile sharing accounts stay compact until details are expanded", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/subscriptions");
  const subscriptionName = uniqueE2EName(testInfo, "Mobile Sharing");
  const loginAccount = `mobile-sharing-${testInfo.workerIndex}-${testInfo.repeatEachIndex}@example.test`;

  try {
    const subscriptionId = await createProductSubscriptionSeed(page, {
      name: subscriptionName,
      price: "49.9",
      currency: "USD",
      startDate: "2098-12-01",
      nextBillingDate: "2099-01-01",
    });
    const patched = await productApiFetch(page, `/api/app/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      body: {
        platformName: "ChatGPT",
        accountNumber: 9,
        familySharing: {
          enabled: true,
          loginAccount,
          password: "",
          verificationLink: "",
          capacity: 2,
        },
      },
    });
    expect(patched.ok, patched.body).toBe(true);

    const accountsResult = await productApiFetch(page, "/api/app/sharing/accounts");
    expect(accountsResult.ok, accountsResult.body).toBe(true);
    const family = (accountsResult.json as {
      data: { accounts: { id: string; subscription: { id: string } }[] };
    }).data.accounts.find((item) => item.subscription.id === subscriptionId);
    expect(family).toBeTruthy();

    const detailResult = await productApiFetch(page, `/api/app/sharing/accounts/${family!.id}`);
    expect(detailResult.ok, detailResult.body).toBe(true);
    const firstSeat = (detailResult.json as { data: { seats: { id: string }[] } }).data.seats[0];
    expect(firstSeat).toBeTruthy();
    const assigned = await productApiFetch(page, `/api/app/sharing/seats/${firstSeat!.id}`, {
      method: "PUT",
      body: {
        memberName: "Mobile Member",
        contact: "",
        contactType: "",
        monthlyPrice: "8",
        currency: "USD",
        billingMonths: 1,
        startDate: "2098-12-01",
        expiresAt: "2099-01-01",
        status: "active",
        notes: "",
        paymentStatus: "paid",
      },
    });
    expect(assigned.ok, assigned.body).toBe(true);

    await page.goto("/sharing");
    const account = page.getByTestId("sharing-mobile-account").filter({ hasText: loginAccount });
    await expect(account).toBeVisible();
    await expect(account).toHaveAttribute("data-expanded", "false");
    await expect(account.getByText("ChatGPT", { exact: true })).toBeVisible();
    await expect(account.getByText(loginAccount, { exact: true })).toBeVisible();
    await expect(account.getByText(/最近到期/)).toBeVisible();
    await expect(account.getByTestId("sharing-mobile-account-details")).toBeHidden();
    await account.screenshot({ path: testInfo.outputPath("mobile-sharing-compact.png") });

    await account.getByRole("button", { name: "展开全部信息" }).click();
    await expect(account).toHaveAttribute("data-expanded", "true");
    await expect(account.getByTestId("sharing-mobile-account-details")).toBeVisible();
    await expect(account.getByText("每月成本", { exact: true })).toBeVisible();
    await expect(account.getByRole("button", { name: "未设置密码" })).toBeDisabled();
    await expect(account.getByRole("button", { name: "管理账号" })).toBeVisible();
    await expectNoHorizontalOverflow(page, "mobile sharing account details");
    await account.screenshot({ path: testInfo.outputPath("mobile-sharing-expanded.png") });
  } finally {
    await deleteProductSubscriptionsByName(page, [subscriptionName]);
  }
});

test("mobile online 2FA keeps codes compact and secondary actions collapsed", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/online-2fa");
  const serviceName = uniqueE2EName(testInfo, "Mobile 2FA");
  const accountName = `mobile-2fa-${testInfo.workerIndex}-${testInfo.repeatEachIndex}@example.test`;
  let accountId = "";

  try {
    const created = await productApiFetch(page, "/api/app/online-totp/accounts", {
      method: "POST",
      body: {
        platformName: "PrimeVideo",
        serviceName,
        accountNumber: 7,
        account: accountName,
        logo: "",
        secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
        enabled: true,
        sharingEnabled: true,
      },
    });
    expect(created.ok, created.body).toBe(true);
    accountId = (created.json as { data: { account: { id: string } } }).data.account.id;
    await page.reload();

    const addButton = page.getByRole("button", { name: "添加 2FA 账号" });
    const row = page.getByTestId("online-totp-account").filter({ hasText: accountName });
    await expect(addButton).toBeVisible();
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-mobile-expanded", "false");
    await expect(row.getByText("PrimeVideo", { exact: true }).first()).toBeVisible();
    await expect(row.getByText(accountName, { exact: true }).first()).toBeVisible();
    await expect(row.getByRole("button", { name: "展开全部信息" })).toBeVisible();
    const [addBox, rowBox] = await Promise.all([
      getRequiredLocatorBoundingBox(addButton, "mobile 2FA add action"),
      getRequiredLocatorBoundingBox(row, "mobile 2FA account row"),
    ]);
    expect(addBox.y, "add action should stay in the top header").toBeLessThan(rowBox.y);
    await row.screenshot({ path: testInfo.outputPath("mobile-online-2fa-compact.png") });

    await row.getByRole("button", { name: "展开全部信息" }).click();
    await expect(row).toHaveAttribute("data-mobile-expanded", "true");
    await expect(row.getByRole("button", { name: "分享链接", exact: true }).first()).toBeVisible();
    await expect(row.getByRole("button", { name: "编辑", exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, "mobile online 2FA account");
    await row.screenshot({ path: testInfo.outputPath("mobile-online-2fa-expanded.png") });
  } finally {
    if (accountId) await productApiFetch(page, `/api/app/online-totp/accounts/${accountId}`, { method: "DELETE" });
  }
});

test("mobile upcoming renewal amounts stay single-line and right-aligned without page overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/");
  const scenarioIdentity = `${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.repeatEachIndex}`;
  const upcomingRecords = [
    {
      amount: "$6 USD",
      currency: "USD",
      name: `000-UpcomingRenewalWithAnUnbrokenResponsiveName-${scenarioIdentity}`,
      price: "6",
    },
    {
      amount: "$149 USD",
      currency: "USD",
      name: `001-Upcoming Medium-${scenarioIdentity}`,
      price: "149",
    },
    {
      amount: "€199 EUR",
      currency: "EUR",
      name: `002-Upcoming Short-${scenarioIdentity}`,
      price: "199",
    },
  ] as const;
  const [startDate, nextBillingDate] = await Promise.all([
    dateOnlyFromLocalToday(page, -30),
    // 首页只展示真实排序后的前五条；放在 today 桶后由数字前缀稳定选中本测试的三条样本。
    dateOnlyFromLocalToday(page, 0),
  ]);

  try {
    await deleteProductSubscriptionsByName(page, upcomingRecords.map((record) => record.name));
    for (const record of upcomingRecords) {
      await createProductSubscriptionSeed(page, {
        name: record.name,
        price: record.price,
        currency: record.currency,
        startDate,
        nextBillingDate,
        reminderDays: 30,
      });
    }
    await page.reload();
    await page.getByRole("button", { name: /查看全部/ }).first().click();
    const upcomingSection = page.getByRole("dialog", { name: /订阅续费/ });
    await expect(upcomingSection).toBeVisible();
    const amounts: Locator[] = [];
    for (const record of upcomingRecords) {
      const name = upcomingSection.getByText(record.name, { exact: true });
      await expect(name).toBeVisible();
      const amount = upcomingSection.getByText(record.amount, { exact: true });
      await expect(amount).toBeVisible();
      amounts.push(amount);
    }

    const metrics = await Promise.all(amounts.map((amount) => captureAmountLineMetrics(amount)));
    for (const [index, amount] of metrics.entries()) {
      expect(amount.lineCount, `upcoming amount ${index}: rendered text lines`).toBe(1);
      expect(Number.isFinite(amount.textRight), `upcoming amount ${index}: text range right edge`).toBe(true);
      expect(
        Math.abs(amount.textRight - amount.amountRight),
        `upcoming amount ${index}: text and amount cell right edge`,
      ).toBeLessThanOrEqual(1);
    }
    for (const amount of metrics.slice(1)) {
      expect(
        Math.abs(metrics[0]!.amountRight - amount.amountRight),
        "upcoming amount cells share one right edge",
      ).toBeLessThanOrEqual(1);
    }
    await expectNoHorizontalOverflow(page, "mobile upcoming renewal rows");
  } finally {
    await deleteProductSubscriptionsByName(page, upcomingRecords.map((record) => record.name));
  }
});

test("mobile calendar and long detail preserve scroll, title, breakpoint, and focus contracts", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("/");
  const subscriptionName = uniqueE2EName(testInfo, "Responsive Mobile Detail");
  const notesEnd = `${subscriptionName} notes end`;
  const notesValue = [
    ...Array.from({ length: 24 }, (_, index) => `Mobile responsive detail note line ${index + 1}.`),
    notesEnd,
  ].join("\n");
  await createProductSubscriptionSeed(page, {
    name: subscriptionName,
    price: "123456.78",
    currency: "USD",
    category: "hosting_domains",
    paymentMethod: "google_pay",
    startDate: "2099-01-01",
    nextBillingDate: "2099-06-15",
    reminderDays: 30,
    tags: Array.from({ length: 30 }, (_, index) => `responsive-mobile-detail-tag-${index + 1}`),
    notes: notesValue,
  });

  try {
    await page.goto("/subscriptions");
    await expect(page.getByRole("heading", { name: "订阅列表" })).toBeVisible();
    await page.getByPlaceholder(SUBSCRIPTION_SEARCH_PLACEHOLDER).fill(subscriptionName);

    const mobileDetail = await openSubscriptionDetailDialog(page, subscriptionName);
    await expect(mobileDetail.dialog.getByRole("heading", { name: subscriptionName, exact: true })).toHaveCount(1);
    const mobileFooter = mobileDetail.dialog.locator("[data-subscription-dialog-footer]");
    for (const action of ["关闭", "添加到日历", "续费", "编辑"]) {
      await expect(mobileFooter.getByRole("button", { name: action, exact: true })).toBeVisible();
    }
    const notes = mobileDetail.dialog.getByText(notesEnd, { exact: false });
    await expectDetailFooterStableWhileScrolling(
      mobileDetail.dialog.locator('[data-dialog-scroll-region="subscription-detail"]'),
      notes,
      "mobile subscription detail",
    );

    await mobileFooter.getByRole("button", { name: "添加到日历", exact: true }).click();
    await expect(mobileDetail.dialog).toBeHidden();
    const calendarDialog = page.getByRole("dialog", { name: "添加到日历" });
    await expect(calendarDialog).toBeVisible();
    await expect.poll(
      () => calendarDialog.evaluate((element) => element.contains(document.activeElement)),
      { message: "mobile calendar dialog owns focus after detail transition" },
    ).toBe(true);
    await expectScrollableRegionReachesTarget(
      calendarDialog.locator('[data-dialog-scroll-region="subscription-calendar"]'),
      calendarDialog.getByRole("link", { name: "用 Yahoo Calendar 打开" }),
      "mobile subscription calendar",
    );
    await calendarDialog.getByRole("button", { name: "关闭" }).click();
    await expect(calendarDialog).toBeHidden();

    const reopenedMobileDetail = await openSubscriptionDetailDialog(page, subscriptionName);
    await reopenedMobileDetail.dialog.locator("[data-subscription-dialog-footer]")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await expect(reopenedMobileDetail.dialog).toBeHidden();
    await expect(reopenedMobileDetail.trigger).toBeFocused();

    for (const boundary of [
      { width: 639, panelClass: /h5-drawer-panel/ },
      { width: 640, panelClass: /h5-dialog-auto-frame/ },
    ]) {
      await page.setViewportSize({ width: boundary.width, height: 720 });
      const detail = await openSubscriptionDetailDialog(page, subscriptionName);
      await expect(detail.dialog).toHaveClass(boundary.panelClass);
      await expect(detail.dialog.getByRole("heading", { name: subscriptionName, exact: true })).toHaveCount(1);
      await detail.dialog.locator("[data-subscription-dialog-footer]")
        .getByRole("button", { name: "关闭", exact: true })
        .click();
      await expect(detail.dialog).toBeHidden();
      await expect(detail.trigger).toBeFocused();
    }
  } finally {
    await deleteProductSubscriptionsByName(page, [subscriptionName]);
  }
});
