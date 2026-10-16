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
        method: "PATCH", body: { platformName: name, accountNumber: 10 + index },
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

    await page.reload();
    const search = page.getByPlaceholder(SUBSCRIPTION_SEARCH_PLACEHOLDER);
    await expect(search).toBeVisible();
    await expect(subscriptionCard(page, names[0]!)).toBeVisible();
    await expectNoHorizontalOverflow(page, "subscription first screen");
    await shot("01-subscriptions-first-screen");
    observations.subscriptionQuickDueFiltersVisible = await page.getByRole("button", { name: /今日续费|逾期订阅/ }).count();
    await search.fill("10");
    const card = subscriptionCard(page, names[0]!);
    await expect(card).toBeVisible();
    await expect(subscriptionCard(page, names[1]!)).toBeHidden();
    await card.getByTestId("subscription-card-primary-action").click();
    const subscriptionDetail = page.getByRole("dialog", { name: names[0]!, exact: true });
    await expect(subscriptionDetail).toBeVisible();
    await subscriptionDetail.getByRole("button", { name: "续费", exact: true }).click();
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
    await expectNoHorizontalOverflow(page, "sharing first screen");
    await shot("03-sharing-first-screen");
    const sharingSearch = page.getByRole("searchbox");
    await sharingSearch.fill("10");
    await expect(page.getByTestId("sharing-mobile-account")).toHaveCount(1);
    await page.getByRole("button", { name: "筛选", exact: true }).click();
    const platformNav = page.getByRole("navigation", { name: /平台筛选/ });
    const netflix = platformNav.getByRole("button", { name: names[0]!, exact: true });
    if (await netflix.isVisible()) await netflix.click();
    else {
      await platformNav.getByRole("button", { name: /更多/ }).click();
      await page.getByRole("menuitem", { name: new RegExp(names[0]!) }).click();
    }
    await page.getByRole("combobox", { name: /账号状态/ }).click();
    await page.getByRole("option", { name: "有空位", exact: true }).click();
    await expect(mobileAccount).toBeVisible();
    await shot("04-sharing-filters");
    await page.getByRole("button", { name: "收起", exact: true }).click();
    await shot("05-sharing-filter-collapsed");
    await mobileAccount.getByRole("button", { name: "展开全部信息", exact: true }).click();
    await shot("06-sharing-account-expanded");
    await mobileAccount.getByRole("button", { name: "管理账号", exact: true }).click();
    const seats = page.getByTestId("sharing-seat-mobile-list");
    await expect(seats).toBeVisible();
    await shot("07-sharing-members");
    await seats.getByRole("button", { name: /续费/ }).first().click();
    const seatRenewal = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /续费.*#1/ }) });
    await expect(seatRenewal).toBeVisible();
    observations.memberRenewalInputCount = await seatRenewal.locator("input, textarea, [role=combobox]").count();
    observations.memberRenewalDefaultPayment = await seatRenewal.locator("#sharing-seat-payment").innerText();
    await expectNoHorizontalOverflow(page, "member renewal form");
    await shot("08-sharing-member-renewal");
    await seatRenewal.locator("form").getByRole("button", { name: "取消", exact: true }).click();
    await page.goto("/sharing");
    await page.setViewportSize({ width: 320, height: 740 });
    await expect(page.getByRole("searchbox")).toBeVisible();
    await expectNoHorizontalOverflow(page, "small phone sharing");
    await shot("09-sharing-small-phone");
    await writeFile(`${output}/observations.json`, JSON.stringify(observations, null, 2));
  } finally {
    await page.goto("/subscriptions");
    await deleteProductSubscriptionsByName(page, names);
  }
});
