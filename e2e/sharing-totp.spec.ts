import { expect, test } from "./support/test";
import { createProductSubscriptionSeed, deleteProductSubscriptionsByName, productApiFetch } from "./support/product-api";
import { uniqueE2EName } from "./support/subscriptions";

test("family 2FA matches accounts, wraps long emails and isolates seat links", async ({ page }, testInfo) => {
  const name = uniqueE2EName(testInfo, "family-totp");
  const account = "primevideo02.long-family-account-name@verification.example.test";
  let otpId = "";
  await page.addInitScript(() => localStorage.setItem("renewlet_theme_mode", "light"));
  await page.goto("/subscriptions");
  try {
    const otpResult = await productApiFetch(page, "/api/app/online-totp/accounts", { method: "POST", body: { platformName: "PrimeVideo", serviceName: name, accountNumber: 3, account, logo: "", secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", enabled: true, sharingEnabled: false } });
    expect(otpResult.ok, otpResult.body).toBe(true);
    otpId = (otpResult.json as { data: { account: { id: string } } }).data.account.id;
    const pastDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const subscriptionId = await createProductSubscriptionSeed(page, { name, price: "49.9", currency: "SGD", billingCycle: "monthly", startDate: "2026-09-03", nextBillingDate: pastDate, autoCalculateNextBillingDate: false });
    const patched = await productApiFetch(page, `/api/app/subscriptions/${subscriptionId}`, { method: "PATCH", body: { platformName: "PrimeVideo", accountNumber: 3, billingCycle: "annual", familySharing: { enabled: true, loginAccount: account, password: "e2e-only-password", verificationLink: "", capacity: 2 }, extra: { familyVerification: { mode: "totp", totpAccountId: otpId } } } });
    expect(patched.ok, patched.body).toBe(true);
    await page.reload();
    const card = page.getByTestId("subscription-card").filter({ hasText: account });
    const email = card.getByTestId("subscription-card-family-account");
    await expect(email).toHaveText(account);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(email).toBeVisible();
      expect(await email.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await card.screenshot({ path: testInfo.outputPath(`family-account-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sharing");
    await expect(page.getByRole("table").getByText(/订阅已过期/)).toBeVisible();
    const accountsResult = await productApiFetch(page, "/api/app/sharing/accounts");
    const family = (accountsResult.json as { data: { accounts: { id: string; subscription: { id: string } }[] } }).data.accounts.find((item) => item.subscription.id === subscriptionId)!;
    const detailResult = await productApiFetch(page, `/api/app/sharing/accounts/${family.id}`);
    const seats = (detailResult.json as { data: { seats: { id: string }[] } }).data.seats;
    for (const [index, seat] of seats.entries()) {
      const assigned = await productApiFetch(page, `/api/app/sharing/seats/${seat.id}`, { method: "PUT", body: { memberName: `Member ${index + 1}`, contact: "", contactType: "", monthlyPrice: "5", currency: "CNY", billingMonths: 1, startDate: "2026-01-01", expiresAt: "2099-01-01", status: "active", notes: "", paymentStatus: "paid" } });
      expect(assigned.ok, assigned.body).toBe(true);
    }
    const generated = await productApiFetch(page, `/api/app/sharing/accounts/${family.id}/totp-links`);
    expect(generated.ok, generated.body).toBe(true);
    expect((generated.json as { data: { links: unknown[] } }).data.links).toHaveLength(3);
    await page.reload();
    await page.getByRole("button", { name: "查看链接", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /在线 2FA 链接/ });
    await expect(dialog.getByText("默认链接", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "重置链接", exact: true })).toHaveCount(3);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await dialog.screenshot({ path: testInfo.outputPath("totp-links-desktop.png") });
    await dialog.getByRole("button", { name: "重置链接", exact: true }).nth(1).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "确认", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "重置链接", exact: true }).nth(1)).toBeEnabled();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.screenshot({ path: testInfo.outputPath("totp-links-mobile.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await dialog.screenshot({ path: testInfo.outputPath("totp-links-dark.png") });
  } finally {
    await deleteProductSubscriptionsByName(page, [name]);
    if (otpId) await productApiFetch(page, `/api/app/online-totp/accounts/${otpId}`, { method: "DELETE" });
  }
});
