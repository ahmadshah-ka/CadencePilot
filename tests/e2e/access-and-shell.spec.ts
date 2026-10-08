import { expect, test } from "@playwright/test";
import {
  ALICE,
  APP,
  BOB,
  OWNER,
  PENDING,
  REJECTED,
  SUSPENDED,
  expectAccessible,
  expectNoHorizontalOverflow,
  fake,
  resetWorld,
  signInAs,
  snap,
} from "./helpers";

const EVERYONE = [OWNER, ALICE, BOB, PENDING, REJECTED, SUSPENDED];
test.beforeEach(async () => resetWorld(EVERYONE));

test.describe("access states", () => {
  test("signed-out visitors are sent to sign-in and keep their intended location", async ({
    page,
  }) => {
    await page.goto("/app/brands");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fbrands$/);
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.locator('input[name="next"]')).toHaveValue("/app/brands");
  });

  test("a hostile next parameter is neutralised", async ({ page }) => {
    await page.goto("/sign-in?next=https://evil.example/steal");
    await expect(page.locator('input[name="next"]')).toHaveValue("/app");
  });

  test("OAuth cancellation and failure show a safe message", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied");
    await expect(page).toHaveURL(/error=cancelled/);
    await expect(page.locator("main p[role=alert]")).toContainText("cancelled");
    await page.goto("/auth/callback?code=forged");
    await expect(page).toHaveURL(/error=failed/);
    await expect(page.locator("main p[role=alert]")).toContainText("could not be completed");
  });

  for (const [user, heading] of [
    [PENDING, "Request received"],
    [REJECTED, "Access not granted"],
    [SUSPENDED, "Access suspended"],
  ] as const) {
    test(`${user.email.split("@")[0]} sees only the status page and no product data`, async ({
      page,
      context,
    }, testInfo) => {
      await signInAs(context, user);
      await page.goto("/app/brands");
      await expect(page).toHaveURL(/\/account-status$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.getByRole("navigation")).toHaveCount(0);
      await expectAccessible(page);
      await snap(page, testInfo, `status-${user.status}`);

      const api = await context.request.get(`${APP}/api/v1/workspaces/current`);
      expect(api.status()).toBe(403);
      const admin = await page.goto("/admin");
      expect(admin?.url()).toMatch(/account-status$/);
    });
  }

  test("an approved non-owner gets a not-found page for the owner area and API", async ({
    page,
    context,
  }) => {
    await signInAs(context, ALICE);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
    expect((await context.request.get(`${APP}/api/v1/admin/accounts`)).status()).toBe(403);
  });

  test("a signed-in approved user visiting sign-in is sent on to the app", async ({
    page,
    context,
  }) => {
    await signInAs(context, ALICE);
    await page.goto("/sign-in?next=/app/calendar");
    await expect(page).toHaveURL(/\/app\/calendar$/);
  });
});

test.describe("private shell", () => {
  test("onboarding creates one workspace, then brands can be added, switched, archived and restored", async ({
    page,
    context,
  }, testInfo) => {
    await signInAs(context, ALICE);
    await page.goto("/app");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This week");
    await expect(
      page.getByRole("heading", { name: "Create your private workspace" }),
    ).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, "app-onboarding");

    await page.getByLabel("Workspace name").fill("Alice Studio");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Your workspace is ready" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "No plan yet" })).toBeVisible();

    await page.goto("/app/brands");
    await expect(page.getByRole("heading", { name: "No brands yet" })).toBeVisible();
    for (const name of ["Codex Foundry", "Narrative Doc"]) {
      await page.getByLabel("New brand name").fill(name);
      await page.getByRole("button", { name: "Add brand" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Brand added" })).toBeVisible();
    }
    await expect(
      page.getByRole("list").filter({ hasText: "Narrative Doc" }).getByRole("listitem"),
    ).toHaveCount(2);

    // duplicate names are refused with a clear message
    await page.getByLabel("New brand name").fill("codex foundry");
    await page.getByRole("button", { name: "Add brand" }).click();
    await expect(page.getByRole("status").filter({ hasText: "already exists" })).toBeVisible();

    await expectAccessible(page);
    await snap(page, testInfo, "app-brands");

    // visible scope switching
    const scope = page.getByTestId("scope-label");
    await expect(scope).toContainText("All brands");
    await page.getByRole("combobox", { name: "Brand" }).selectOption({ label: "Narrative Doc" });
    await expect(scope).toContainText("Narrative Doc");
    await page.goto("/app/calendar");
    await expect(page.getByTestId("scope-label")).toContainText("Narrative Doc");

    // archive and restore
    await page.goto("/app/brands");
    await page
      .getByRole("listitem")
      .filter({ hasText: "Codex Foundry" })
      .getByRole("button", { name: "Archive" })
      .click();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Codex Foundry" })
        .getByRole("button", { name: "Restore" }),
    ).toBeVisible();
    await page
      .getByRole("listitem")
      .filter({ hasText: "Codex Foundry" })
      .getByRole("button", { name: "Restore" })
      .click();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Codex Foundry" })
        .getByRole("button", { name: "Archive" }),
    ).toBeVisible();
  });

  test("repeating workspace creation never makes a second workspace", async ({ page, context }) => {
    await signInAs(context, ALICE);
    await page.goto("/app");
    await page.getByLabel("Workspace name").fill("One");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByRole("status").filter({ hasText: "ready" })).toBeVisible();
    const state = (await fake("/__test/state")) as { workspaces: number };
    expect(state.workspaces).toBe(1);
    const again = await context.request.post(`${APP}/api/v1/workspaces`, {
      headers: { origin: APP },
      data: { name: "Two" },
    });
    expect(again.status()).toBe(200);
    expect(((await fake("/__test/state")) as { workspaces: number }).workspaces).toBe(1);
  });

  test("each customer sees only their own brands, and forged ids are refused", async ({
    browser,
  }) => {
    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    await signInAs(aliceCtx, ALICE);
    await signInAs(bobCtx, BOB);

    const create = async (ctx: typeof aliceCtx, workspace: string, brand: string) => {
      const ws = await ctx.request.post(`${APP}/api/v1/workspaces`, {
        headers: { origin: APP },
        data: { name: workspace },
      });
      const workspaceId = (await ws.json()).workspace.id as string;
      const res = await ctx.request.post(`${APP}/api/v1/workspaces/${workspaceId}/brands`, {
        headers: { origin: APP },
        data: { name: brand },
      });
      return { workspaceId, brandId: (await res.json()).brand.id as string };
    };
    const a = await create(aliceCtx, "Alice Studio", "Alice Brand");
    const b = await create(bobCtx, "Bob Studio", "Bob Brand");

    const alicePage = await aliceCtx.newPage();
    await alicePage.goto("/app/brands");
    await expect(alicePage.getByRole("listitem").filter({ hasText: "Alice Brand" })).toBeVisible();
    await expect(alicePage.getByText("Bob Brand")).toHaveCount(0);

    for (const url of [
      `/api/v1/workspaces/${b.workspaceId}/brands`,
      `/api/v1/workspaces/${b.workspaceId}/brands/${b.brandId}`,
      `/api/v1/workspaces/${a.workspaceId}/brands/${b.brandId}`,
    ]) {
      expect((await aliceCtx.request.get(`${APP}${url}`)).status(), url).toBe(404);
    }
    const hijack = await aliceCtx.request.patch(
      `${APP}/api/v1/workspaces/${b.workspaceId}/brands/${b.brandId}`,
      {
        headers: { origin: APP },
        data: { expectedRevision: 1, name: "Hijacked" },
      },
    );
    expect(hijack.status()).toBe(404);

    // a forged brand-scope cookie cannot widen the view
    await aliceCtx.addCookies([{ name: "cp_brand", value: b.brandId, url: APP }]);
    await alicePage.goto("/app");
    await expect(alicePage.getByTestId("scope-label")).toContainText("All brands");

    await aliceCtx.close();
    await bobCtx.close();
  });

  test("sign-out removes access and the back button shows no private content", async ({
    page,
    context,
  }) => {
    await signInAs(context, ALICE);
    await page.goto("/app");
    await page.getByRole("heading", { name: "Create your private workspace" }).waitFor();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(`${APP}/`);
    await page.goBack();
    await expect(page.getByText("Create your private workspace")).toHaveCount(0);
    await expect(page).toHaveURL(/sign-in/);
  });

  test("suspension and revoked membership take effect on the next request", async ({
    page,
    context,
  }) => {
    await signInAs(context, ALICE);
    await page.goto("/app");
    await page.getByLabel("Workspace name").fill("Studio");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByRole("status").filter({ hasText: "ready" })).toBeVisible();

    await fake("/__test/revoke", { userId: ALICE.id });
    await page.goto("/app/brands");
    await expect(page.getByRole("heading", { name: "Create your workspace first" })).toBeVisible();

    await fake("/__test/set-status", { userId: ALICE.id, status: "suspended" });
    await page.goto("/app");
    await expect(page).toHaveURL(/account-status/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Access suspended");
  });

  for (const [path, heading, text] of [
    ["/app/content", "Content", /not available yet/],
    ["/app/calendar", "Calendar", /not available yet/],
    ["/app/progress", "Progress", /No progress to show yet/],
    ["/app/settings", "Settings", /Preferences are not available yet/],
    ["/app/assistant", "Brand assistant", /not available yet/],
  ] as const) {
    test(`${path} is honest, accessible and fits the viewport`, async ({
      page,
      context,
    }, testInfo) => {
      await signInAs(context, ALICE);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.getByText(text).first()).toBeVisible();
      await expectAccessible(page);
      await expectNoHorizontalOverflow(page);
      await snap(page, testInfo, path.replace("/app/", "app-"));
    });
  }

  test("keyboard users can reach the shell navigation and the skip link works", async ({
    page,
    context,
  }) => {
    await signInAs(context, ALICE);
    await page.goto("/app");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      const nav = page.getByRole("navigation", { name: "Main", exact: true });
      for (const label of ["This week", "Brands", "Content", "Calendar", "Progress", "Settings"]) {
        await expect(nav.getByRole("link", { name: label })).toBeVisible();
      }
      await expect(nav.getByRole("link", { name: "This week" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    }
  });

  test("the mobile menu lists every destination including the assistant", async ({
    page,
    context,
  }) => {
    test.skip((page.viewportSize()?.width ?? 2000) >= 1024, "small screens only");
    await signInAs(context, ALICE);
    await page.goto("/app");
    await page.getByText("Menu", { exact: true }).click();
    const nav = page.getByRole("navigation", { name: "Main (mobile)" });
    for (const label of [
      "This week",
      "Brands",
      "Content",
      "Calendar",
      "Progress",
      "Settings",
      "Assistant",
    ]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
  });
});
