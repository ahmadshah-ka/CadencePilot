import { expect, test } from "@playwright/test";
import {
  ALICE,
  OWNER,
  PENDING,
  REJECTED,
  expectAccessible,
  fake,
  resetWorld,
  signInAs,
  snap,
} from "./helpers";

test.beforeEach(async () => resetWorld([OWNER, ALICE, PENDING, REJECTED]));

test("the owner lists pending applicants first, approves one, and the applicant gets in", async ({
  browser,
}, testInfo) => {
  const ownerCtx = await browser.newContext();
  await signInAs(ownerCtx, OWNER);
  const page = await ownerCtx.newPage();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Access requests");
  await expect(page.getByText("pending@example.test")).toBeVisible();
  await expectAccessible(page);
  await snap(page, testInfo, "admin-pending");

  await page
    .getByRole("listitem")
    .filter({ hasText: "pending@example.test" })
    .getByRole("button", { name: "Approve" })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "Change saved" })).toBeVisible();
  await expect(page.getByText("pending@example.test")).toHaveCount(0);

  const applicantCtx = await browser.newContext();
  await signInAs(applicantCtx, PENDING);
  const applicant = await applicantCtx.newPage();
  await applicant.goto("/app");
  await expect(applicant).toHaveURL(/\/app$/);
  await expect(applicant.getByRole("heading", { level: 1 })).toHaveText("This week");

  const state = (await fake("/__test/state")) as { audit: Array<{ decision: string }> };
  expect(state.audit).toEqual([{ actor: OWNER.id, target: PENDING.id, decision: "approve" }]);
  await ownerCtx.close();
  await applicantCtx.close();
});

test("rejecting and suspending need an explicit confirmation step", async ({
  page,
  context,
}, testInfo) => {
  await signInAs(context, OWNER);
  await page.goto("/admin");
  await page
    .getByRole("listitem")
    .filter({ hasText: "pending@example.test" })
    .getByRole("button", { name: "Reject…" })
    .click();
  await expect(page).toHaveURL(/\/admin\/review\?/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Confirm: reject");
  await expectAccessible(page);
  await snap(page, testInfo, "admin-confirm");
  expect(((await fake("/__test/state")) as { audit: unknown[] }).audit).toHaveLength(0);

  await page.getByLabel(/Note/).fill("Not a fit right now");
  await page.getByRole("button", { name: "Confirm reject" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Change saved" })).toBeVisible();

  await page.getByRole("link", { name: "approved", exact: true }).click();
  await page
    .getByRole("listitem")
    .filter({ hasText: "alice@example.test" })
    .getByRole("button", { name: "Suspend…" })
    .click();
  await page.getByRole("button", { name: "Confirm suspend" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Change saved" })).toBeVisible();

  const aliceCtx = await context.browser()!.newContext();
  await signInAs(aliceCtx, ALICE);
  const alice = await aliceCtx.newPage();
  await alice.goto("/app");
  await expect(alice.getByRole("heading", { level: 1 })).toHaveText("Access suspended");
  await aliceCtx.close();
});

test("a second owner tab acting on a stale request is told it changed", async ({ browser }) => {
  const ctx = await browser.newContext();
  await signInAs(ctx, OWNER);
  const first = await ctx.newPage();
  const second = await ctx.newPage();
  await first.goto("/admin");
  await second.goto("/admin");
  const row = (p: typeof first) =>
    p.getByRole("listitem").filter({ hasText: "pending@example.test" });
  await row(first).getByRole("button", { name: "Approve" }).click();
  await expect(first.getByRole("status").filter({ hasText: "Change saved" })).toBeVisible();
  await row(second).getByRole("button", { name: "Approve" }).click();
  await expect(
    second.getByRole("status").filter({ hasText: "changed since you loaded it" }),
  ).toBeVisible();
  const state = (await fake("/__test/state")) as { audit: unknown[] };
  expect(state.audit).toHaveLength(1);
  await ctx.close();
});
