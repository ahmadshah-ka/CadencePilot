import { test, expect } from "@playwright/test";
import {
  ALICE,
  BOB,
  resetWorld,
  signInAs,
  expectAccessible,
  expectNoHorizontalOverflow,
} from "./helpers";
test.beforeEach(async () => {
  await resetWorld([ALICE, BOB]);
});
test("creator saves availability, resumes it and keeps a one-week exception separate", async ({
  page,
  context,
}) => {
  await signInAs(context, ALICE);
  await page.goto("/app/settings");
  await page.getByLabel("Your timezone (IANA name)").fill("Europe/London");
  await page.getByRole("button", { name: "Add availability window" }).first().click();
  await page.getByLabel("Window 1 day").selectOption("1");
  await page.getByLabel("Window 1 start").fill("18:00");
  await page.getByLabel("Window 1 end").fill("20:00");
  await page.getByLabel("Week starting Monday").fill("2026-10-19");
  await page
    .getByRole("button", { name: "Set this week unavailable, then add any free windows" })
    .click();
  await page.getByRole("button", { name: "Save availability", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Availability saved");
  await page.reload();
  await expect(page.getByLabel("Your timezone (IANA name)")).toHaveValue("Europe/London");
  await expect(page.getByLabel("Window 1 start")).toHaveValue("18:00");
  await page.getByRole("button", { name: "2026-10-19", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Use usual availability for this week" }),
  ).toBeVisible();
  await expectAccessible(page);
  await expectNoHorizontalOverflow(page);
});
test("brand questionnaire resumes permanent goals and does not confuse a weekly override with them", async ({
  page,
  context,
}) => {
  await signInAs(context, ALICE);
  await page.goto("/app");
  await page.getByLabel("Workspace name").fill("My studio");
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.getByText("Your workspace is ready.", { exact: true })).toBeVisible();
  await page.goto("/app/brands");
  await page.getByLabel("New brand name").fill("Research brand");
  await page.getByRole("button", { name: "Add brand", exact: true }).click();
  await page.getByRole("link", { name: "Research brand", exact: true }).click();
  await page.getByLabel("Topics and purpose").fill("Technology explained");
  await page.getByLabel("Who is this for?").fill("Developers");
  await page.getByLabel("Usual videos per week").fill("2");
  await page.getByLabel("youtube", { exact: true }).check();
  await page.getByLabel("Week starting Monday").fill("2026-10-19");
  await page.getByRole("button", { name: "Add week-only goals" }).click();
  await page.getByLabel("This week videos per week").fill("5");
  await page.getByRole("button", { name: "Save brand preferences", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Brand preferences saved");
  await page.reload();
  await expect(page.getByLabel("Usual videos per week")).toHaveValue("2");
  await page.getByRole("button", { name: "2026-10-19", exact: true }).click();
  await expect(page.getByLabel("This week videos per week")).toHaveValue("5");
  await expectAccessible(page);
  await expectNoHorizontalOverflow(page);
});
