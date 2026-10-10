import { expect, test } from "./support/test";
import {
  deferAdvancedSettingsModule,
  gotoSettingsAfterHydration,
} from "./support/settings";

test("mobile settings directory keeps calendar feed active across deferred content commit", async ({ page }) => {
  const advancedModule = await deferAdvancedSettingsModule(page);
  await gotoSettingsAfterHydration(page);
  const drawerTrigger = page.getByRole("button", { name: "打开设置目录" });

  await drawerTrigger.click();
  const drawer = page.getByTestId("settings-section-nav-drawer");
  await drawer.getByRole("link", { name: "日历订阅" }).click();
  await advancedModule.waitForRequest();

  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/#settings-calendar-feed$/);
  await expect(page.locator("#settings-calendar-feed")).toBeInViewport();
  await expect(page.getByTestId("settings-mobile-page-header")).toContainText("日历订阅");

  advancedModule.release();

  const calendarSection = page.locator("#settings-calendar-feed");
  await expect(calendarSection).not.toHaveAttribute("aria-busy", "true");
  await expect(calendarSection).toBeInViewport();
  await expect(page).toHaveURL(/#settings-calendar-feed$/);

  await drawerTrigger.click();
  const reopenedDrawer = page.getByTestId("settings-section-nav-drawer");
  await expect(reopenedDrawer.getByRole("link", { name: "日历订阅" })).toHaveAttribute("aria-current", "location");
});
