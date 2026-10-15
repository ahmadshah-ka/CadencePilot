import { test, expect } from "@playwright/test";
import {
  APP,
  ALICE,
  BOB,
  resetWorld,
  signInAs,
  expectAccessible,
  expectNoHorizontalOverflow,
} from "./helpers";
import contentPolicy from "../../src/config/content-policy.json" with { type: "json" };
test.beforeEach(async () => {
  await resetWorld([ALICE, BOB]);
});
test("manual original, production, derivative and publication correction", async ({
  page,
  context,
}, testInfo) => {
  await signInAs(context, ALICE);
  await page.goto("/app");
  await page.getByLabel("Workspace name").fill("Content Studio");
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.getByText("Your workspace is ready.", { exact: true })).toBeVisible();
  await page.goto("/app/brands");
  await page.getByLabel("New brand name").fill("Editorial");
  await page.getByRole("button", { name: "Add brand", exact: true }).click();
  await expect(page.getByText("Brand added.", { exact: true })).toBeVisible();
  await page.goto("/app/content");
  await page.getByLabel("New series title").fill("Weekly series");
  await page.getByRole("button", { name: "Add series", exact: true }).click();
  await expect(page.getByText("Series saved.", { exact: true })).toBeVisible();
  await page.getByLabel("Content title", { exact: true }).fill("Original video");
  await page
    .getByRole("combobox", { name: "Series (optional)", exact: true })
    .selectOption({ label: "Weekly series" });
  await page.getByRole("button", { name: "Create original", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Original video", exact: true })).toBeVisible();
  await expect(page.getByText("Series: Weekly series", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Source transcript (optional)", exact: true })
    .fill("An untimed original transcript, preserved separately.");
  await page
    .getByRole("textbox", { name: "Notes or derivative draft", exact: true })
    .fill("Original notes");
  await page.getByRole("button", { name: "Save content details", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.getByLabel("Recorded", { exact: true }).check();
  await expect(page.getByText("Creation: recorded", { exact: true })).toBeVisible();
  await page.getByLabel("Edited", { exact: true }).check();
  await expect(page.getByText("Creation: edited", { exact: true })).toBeVisible();
  await page.getByLabel("Ready", { exact: true }).check();
  await expect(page.getByText("Creation: ready", { exact: true })).toBeVisible();
  await page.getByLabel("This has been published", { exact: true }).check();
  await page
    .getByLabel("Published at (your device’s local time)", { exact: true })
    .fill("2020-01-01T12:00");
  await page.getByRole("button", { name: "Save publication record", exact: true }).click();
  await expect(page.getByText("1 platform publications", { exact: true })).toBeVisible();
  await page.getByLabel("This has been published", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save publication record", exact: true }).click();
  await expect(page.getByText("0 platform publications", { exact: true })).toBeVisible();
  await page.getByLabel("Recorded", { exact: true }).uncheck();
  await expect(page.getByText("Creation: planned", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Edited", { exact: true })).not.toBeChecked();
  await expectAccessible(page);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: `test-results/screens/content-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Derivative title", { exact: true }).fill("Written derivative");
  await page.getByRole("combobox", { name: "Content format", exact: true }).selectOption("post");
  await page.getByRole("button", { name: "Create derivative", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Written derivative", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Recorded", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Notes or derivative draft", exact: true }),
  ).toHaveValue("");
  await page.getByRole("link", { name: "View original content", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Original video", exact: true })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Source transcript (optional)", exact: true }),
  ).toHaveValue("An untimed original transcript, preserved separately.");
  await expect(page.getByRole("link", { name: "Written derivative", exact: true })).toBeVisible();
});

test("cursor pages do not duplicate records and foreign-parent links are rejected", async ({
  page,
  context,
}) => {
  await signInAs(context, ALICE);
  const headers = { origin: APP };
  const workspaceResponse = await page.request.post("/api/v1/workspaces", {
    headers,
    data: { name: "Paged studio" },
  });
  expect(workspaceResponse.ok()).toBe(true);
  const workspaceId = (await workspaceResponse.json()).workspace.id;
  const brandResponse = await page.request.post(`/api/v1/workspaces/${workspaceId}/brands`, {
    headers,
    data: { name: "Pages" },
  });
  expect(brandResponse.ok()).toBe(true);
  const brandId = (await brandResponse.json()).brand.id,
    base = `/api/v1/workspaces/${workspaceId}/brands/${brandId}`;
  for (let index = 0; index < contentPolicy.listPageSize + 1; index++) {
    const response = await page.request.post(`${base}/content-commands`, {
      headers,
      data: {
        action: "create",
        id: null,
        input: {
          requestId: `99999999-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          title: `Item ${index}`,
          format: "post",
          parentId: null,
          seriesId: null,
        },
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  const first = await (await page.request.get(`${base}/content`)).json();
  expect(first.items).toHaveLength(contentPolicy.listPageSize);
  expect(first.nextCursor).toBeTruthy();
  const second = await (
    await page.request.get(`${base}/content?cursor=${encodeURIComponent(first.nextCursor)}`)
  ).json();
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(
    new Set([...first.items, ...second.items].map((item: { id: string }) => item.id)).size,
  ).toBe(contentPolicy.listPageSize + 1);
  const otherBrand = (
    await (
      await page.request.post(`/api/v1/workspaces/${workspaceId}/brands`, {
        headers,
        data: { name: "Other brand" },
      })
    ).json()
  ).brand.id;
  const foreign = await page.request.post(
    `/api/v1/workspaces/${workspaceId}/brands/${otherBrand}/content-commands`,
    {
      headers,
      data: {
        action: "create",
        id: null,
        input: {
          requestId: "99999999-0000-4000-8000-999999999999",
          title: "Foreign derivative",
          format: "short",
          parentId: first.items[0].id,
          seriesId: null,
        },
      },
    },
  );
  expect(foreign.status()).toBe(404);
});
