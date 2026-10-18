import { mkdir, writeFile } from "node:fs/promises";
import { expect, test } from "./support/test";
import { createProductSubscriptionSeed, deleteProductSubscriptionsByName, productApiFetch } from "./support/product-api";
import { expectNoHorizontalOverflow } from "./support/layout";
import { subscriptionCard, SUBSCRIPTION_SEARCH_PLACEHOLDER } from "./support/subscriptions";

test("mobile subscription and sharing everyday operation audit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-10-16T04:00:00Z"));
  const output = "artifacts/mobile-list-audit";
  await mkdir(output, { recursive: true });
  const names = ["Mobile Audit Netflix", "Mobile Audit YouTube"];
  const observations: Record<string, unknown> = {};
  const shot = async (name: string) => {
    await page.screenshot({ path: `${output}/${name}.png`, animations: "disabled" });
  };
  await page.goto("/subscriptions");
  try {
    for (const [index, name] of names.entries()) {
      const id = await createProductSubscriptionSeed(page, {
        name, price: "45", currency: "CNY", startDate: "2026-09-16", nextBillingDate: "2026-10-16", autoRenew: false,
        familySharing: { enabled: true, loginAccount: `audit${index}@example.test`, capacity: 5 },
        familyVerification: { mode: "none" },
      });
      const patched = await productApiFetch(page, `/api/app/subscriptions/${id}`, {
        method: "PATCH", body: { platformName: index === 0 ? "服务器" : name, accountNumber: 10 + index, paymentMethod: "credit_card", cardLast4: "6109" },
      });
      expect(patched.ok, patched.body).toBe(true);
    }
    const accounts = await productApiFetch(page, "/api/app/sharing/accounts");
    const account = (accounts.json as { data: { accounts: { id: string; loginAccount: string }[] } }).data.accounts.find((item) => item.loginAccount === "audit0@example.test")!;
    const detail = await productApiFetch(page, `/api/app/sharing/accounts/${account.id}`);
    const seat = (detail.json as { data: { seats: { id: string }[] } }).data.seats[0]!;
    const assigned = await productApiFetch(page, `/api/app/sharing/seats/${seat.id}`, {
      method: "PUT", body: { memberName: "Audit Member", contact: "", contactType: "", monthlyPrice: "15", currency: "CNY", billingMonths: 3, startDate: "2026-07-16", expiresAt: "2026-10-16", status: "active", notes: "", paymentStatus: "paid" },
    });
    expect(assigned.ok, assigned.body).toBe(true);

    // An old, longer period must not override a corrected current period.
    const laterPeriod = await productApiFetch(page, `/api/app/sharing/seats/${seat.id}`, {
      method: "PUT", body: { memberName: "Audit Member", contact: "", contactType: "", billingAmount: "45", monthlyPrice: "15", currency: "CNY", billingMonths: 3, startDate: "2026-10-16", expiresAt: "2027-01-16", status: "active", notes: "", paymentStatus: "pending" },
    });
    expect(laterPeriod.ok, laterPeriod.body).toBe(true);
    const corrected = await productApiFetch(page, `/api/app/sharing/seats/${seat.id}`, {
      method: "PUT", body: { memberName: "Audit Member", contact: "", contactType: "", billingAmount: "15", monthlyPrice: "15", currency: "CNY", billingMonths: 1, startDate: "2026-09-16", expiresAt: "2026-10-16", status: "active", notes: "", paymentStatus: "paid" },
    });
    expect(corrected.ok, corrected.body).toBe(true);
    const correctedSeat = (corrected.json as { data: { seats: { id: string; currentReceivable: { amount: string; status: string } }[] } }).data.seats.find((row) => row.id === seat.id)!;
    expect(correctedSeat.currentReceivable.amount).toBe("15");
    expect(correctedSeat.currentReceivable.status).toBe("paid");

    await page.reload();
    const search = page.getByPlaceholder(SUBSCRIPTION_SEARCH_PLACEHOLDER);
    await expect(search).toBeVisible();
    await expect(subscriptionCard(page, names[0]!)).toBeVisible();
    await expectNoHorizontalOverflow(page, "subscription first screen");
    await shot("01-subscriptions-first-screen");
    observations.subscriptionQuickDueFiltersVisible = await page.getByRole("button", { name: /今日续费|逾期订阅/ }).count();
    expect(observations.subscriptionQuickDueFiltersVisible).toBe(2);
    await page.getByRole("button", { name: "今日续费", exact: true }).click();
    await expect(subscriptionCard(page, names[0]!)).toBeVisible();
    await page.getByRole("button", { name: "逾期订阅", exact: true }).click();
    await expect(subscriptionCard(page, names[0]!)).toBeHidden();
    await page.getByRole("button", { name: "全部状态", exact: true }).click();
    await search.fill("10");
    const card = subscriptionCard(page, names[0]!);
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { name: names[0]!, exact: true })).toBeVisible();
    await expect(card.getByText("服务器", { exact: true })).toBeVisible();
    await expect(card.getByTestId("subscription-card-mobile-payment")).toContainText("信用卡");
    await expect(card.getByTestId("subscription-card-mobile-payment")).toContainText("6109");
    await expect(subscriptionCard(page, names[1]!)).toBeHidden();
    await card.getByRole("button", { name: "续费", exact: true }).click();
    const renewal = page.getByRole("dialog", { name: /续订/ });
    await expect(renewal).toBeVisible();
    await expectNoHorizontalOverflow(page, "subscription renewal");
    await shot("02-subscription-renewal");
    await renewal.getByRole("button", { name: "取消", exact: true }).click();

    await page.goto("/sharing");
    const mobileAccount = page.getByTestId("sharing-mobile-account").filter({ hasText: "audit0@example.test" });
    await expect(mobileAccount).toBeVisible();
    observations.sharingFirstAccountTop = (await mobileAccount.boundingBox())?.y;
    observations.sharingManageInitiallyVisible = await mobileAccount.getByRole("button", { name: "管理账号", exact: true }).isVisible();
    expect(observations.sharingManageInitiallyVisible).toBe(true);
    await expectNoHorizontalOverflow(page, "sharing first screen");
    await shot("03-sharing-first-screen");
    const sharingSearch = page.getByRole("searchbox");
    await sharingSearch.fill("10");
    await expect(page.getByTestId("sharing-mobile-account")).toHaveCount(1);
    await page.getByRole("combobox", { name: /平台筛选/ }).click();
    await page.getByRole("option", { name: "服务器", exact: true }).click();
    await page.getByRole("button", { name: "有空位", exact: true }).click();
    await expect(mobileAccount).toBeVisible();
    await shot("04-sharing-filters");
    await shot("05-sharing-filter-collapsed");
    await mobileAccount.getByRole("button", { name: "展开全部信息", exact: true }).click();
    await shot("06-sharing-account-expanded");
    await mobileAccount.getByRole("button", { name: "管理账号", exact: true }).click();
    const seats = page.getByTestId("sharing-seat-mobile-list");
    await expect(seats).toBeVisible();
    const finances = page.getByTestId("sharing-financial-details");
    const credentials = page.getByTestId("sharing-credentials-details");
    await expect(finances).not.toHaveAttribute("open");
    await expect(credentials).not.toHaveAttribute("open");
    expect((await seats.boundingBox())!.y).toBeLessThan((await finances.boundingBox())!.y);
    await finances.locator("summary").click();
    await expect(finances).toHaveAttribute("open");
    await expect(finances.getByRole("region", { name: "账号经营概览" })).toBeVisible();
    await finances.locator("summary").click();
    await credentials.locator("summary").click();
    await expect(credentials.getByRole("button", { name: "复制账号", exact: true })).toBeVisible();
    await credentials.locator("summary").click();
    await shot("07-sharing-members");
    await seats.getByRole("button", { name: /续费/ }).first().click();
    const seatRenewal = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /续费.*#1/ }) });
    await expect(seatRenewal).toBeVisible();
    observations.memberRenewalInputCount = await seatRenewal.locator("input, textarea, [role=combobox]").count();
    observations.memberRenewalDefaultPayment = await seatRenewal.locator("#sharing-seat-payment").innerText();
    await expectNoHorizontalOverflow(page, "member renewal form");
    await shot("08-sharing-member-renewal");
    // Diagnose the reported 15 CNY / paid round-trip against the real local backend.
    await seatRenewal.getByRole("button", { name: "月付", exact: true }).click();
    await seatRenewal.locator("#sharing-seat-price").fill("15");
    await seatRenewal.getByRole("button", { name: "季付", exact: true }).click();
    await expect(seatRenewal.locator("#sharing-seat-price")).toHaveValue("15");
    await seatRenewal.getByRole("button", { name: "月付", exact: true }).click();
    await expect(seatRenewal.locator("#sharing-seat-price")).toHaveValue("15");
    await seatRenewal.locator("#sharing-seat-payment").click();
    await page.getByRole("option", { name: "已收", exact: true }).click();
    const savedResponse = page.waitForResponse((response) => response.url().includes(`/sharing/seats/${seat.id}`) && response.request().method() === "PUT");
    await seatRenewal.getByRole("button", { name: "确认续费", exact: true }).click();
    const saved = await savedResponse;
    expect(saved.ok()).toBe(true);
    const submitted = saved.request().postDataJSON();
    expect(submitted.billingAmount).toBe("15");
    expect(submitted.paymentStatus).toBe("paid");
    const persisted = await productApiFetch(page, `/api/app/sharing/accounts/${account.id}`);
    const persistedSeat = (persisted.json as { data: { seats: { id: string; currentReceivable: { amount: string; status: string } }[] } }).data.seats.find((row) => row.id === seat.id)!;
    expect(persistedSeat.currentReceivable.amount).toBe("15");
    expect(persistedSeat.currentReceivable.status).toBe("paid");
    await seats.getByRole("button", { name: /管理车位/ }).first().click();
    const editSeat = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /管理车位.*#1/ }) });
    await expect(editSeat.locator("#sharing-seat-price")).toHaveValue("15");
    await expect(editSeat.locator("#sharing-seat-payment")).toHaveText("已收");
    await editSeat.locator("form").getByRole("button", { name: "取消", exact: true }).click();
    await seats.getByRole("button", { name: /续费/ }).first().click();
    // A new renewal intentionally starts a new pending period; capture it separately.
    await expect(seatRenewal.locator("#sharing-seat-payment")).toHaveText("待收");
    await seatRenewal.locator("form").getByRole("button", { name: "取消", exact: true }).click();
    await page.goto("/sharing");
    await page.setViewportSize({ width: 320, height: 740 });
    await expect(page.getByRole("searchbox")).toBeVisible();
    await expectNoHorizontalOverflow(page, "small phone sharing");
    await shot("09-sharing-small-phone");
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.evaluate(() => { document.documentElement.classList.add("dark"); });
    await expectNoHorizontalOverflow(page, "small phone sharing dark");
    await shot("10-sharing-small-phone-dark");
    await page.getByTestId("app-header-actions").getByTestId("account-menu-trigger").click();
    await page.getByRole("menuitem", { name: "切换主题", exact: true }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    for (const path of ["/subscriptions", "/sharing"]) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(path);
      await expect(page.getByRole("searchbox")).toBeVisible();
      await expect(page.getByRole("combobox", { name: /平台筛选/ })).toBeVisible();
      await expectNoHorizontalOverflow(page, `375px light ${path}`);
      await shot(`11-${path.slice(1)}-light`);
      await page.setViewportSize({ width: 740, height: 375 });
      await expect(page.getByRole("searchbox")).toBeVisible();
      await expectNoHorizontalOverflow(page, `landscape ${path}`);
      await shot(`12-${path.slice(1)}-landscape`);
    }
    await page.goto("/sharing");
    for (const width of [1280, 1536, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      const summary = page.locator(".workspace-summary");
      await expect(summary).toBeVisible();
      await expect(summary).toHaveCSS("gap", "16px");
      const toolbar = page.getByTestId("desktop-sharing-toolbar");
      await expect(toolbar).toBeVisible();
      const summaryBox = (await summary.boundingBox())!;
      const toolbarBox = (await toolbar.boundingBox())!;
      const headerBox = (await page.locator("header").boundingBox())!;
      expect(Math.round(summaryBox.y - headerBox.y - headerBox.height)).toBe(16);
      expect(Math.round(toolbarBox.y - summaryBox.y - summaryBox.height)).toBe(16);
      await expectNoHorizontalOverflow(page, `desktop sharing ${width}`);
      await shot(`13-sharing-desktop-${width}`);
    }
    await writeFile(`${output}/observations.json`, JSON.stringify(observations, null, 2));
  } finally {
    await page.goto("/subscriptions");
    await deleteProductSubscriptionsByName(page, names);
  }
});
