import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  APP,
  FAKE,
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
test("private memory, source confirmation, forgetting, brand switch and AI fallback", async ({
  page,
  context,
}, info) => {
  await signInAs(context, ALICE);
  const headers = { origin: APP };
  const workspace = (
    await (
      await page.request.post("/api/v1/workspaces", { headers, data: { name: "Assistant studio" } })
    ).json()
  ).workspace.id;
  const create = async (name: string) =>
    (
      await (
        await page.request.post(`/api/v1/workspaces/${workspace}/brands`, {
          headers,
          data: { name },
        })
      ).json()
    ).brand.id;
  const brand = await create("Writing"),
    other = await create("Speaking");
  const rpc = async (operation: string, data: unknown) => {
    const response = await page.request.post(`${FAKE}/rest/v1/rpc/assistant_mutate`, {
      headers: { authorization: "Bearer e2e-secret-key-value" },
      data: {
        p_user: ALICE.id,
        p_workspace: workspace,
        p_brand: brand,
        p_operation: operation,
        p_data: data,
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const turn = await rpc("begin", {
    requestId: randomUUID(),
    text: "Remember that I like a calm voice",
    leaseSeconds: 240,
    retentionDays: 30,
    admission: { minute: 6, day: 100 },
  });
  await rpc("finish", {
    turnId: turn.turn_id,
    assistantMessageId: turn.assistant_message_id,
    text: "Review this proposed memory.",
    proposals: [{ kind: "memory", scope: "brand", key: "voice", value: "Calm voice" }],
  });
  await page.goto(`/app/assistant?brandId=${brand}`);
  const main = page.getByRole("region", { name: "Assistant workspace", exact: true });
  await expect(main.getByRole("button", { name: "Confirm proposal", exact: true })).toBeVisible();
  await expect(main.getByText("No confirmed memories yet.", { exact: true })).toBeVisible();
  await main.getByRole("button", { name: "Confirm proposal", exact: true }).click();
  await expect(main.getByRole("button", { name: "Confirmed", exact: true })).toBeVisible();
  await main.getByRole("button", { name: "View source", exact: true }).click();
  await expect(main.getByRole("heading", { name: "Memory source", exact: true })).toBeVisible();
  await main.getByRole("button", { name: "Close source", exact: true }).click();
  await main
    .getByRole("textbox", { name: "Memory value: voice", exact: true })
    .fill("Calm and concise");
  await main.getByRole("button", { name: "Save memory", exact: true }).click();
  await expect(main.getByRole("textbox", { name: "Memory value: voice", exact: true })).toHaveValue(
    "Calm and concise",
  );
  await expectAccessible(page);
  await expectNoHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/screens/assistant-${info.project.name}.png`,
    fullPage: true,
  });
  page.once("dialog", (dialog) => dialog.accept());
  await main.getByRole("button", { name: "Forget memory", exact: true }).click();
  await expect(main.getByText("No confirmed memories yet.", { exact: true })).toBeVisible();
  await main
    .getByRole("textbox", { name: "Your message", exact: true })
    .fill("Help set up this brand");
  await main.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(main.getByRole("alert")).toContainText("disabled");
  await expect(main.getByRole("textbox", { name: "Your message", exact: true })).toHaveValue(
    "Help set up this brand",
  );
  await expect(main.getByRole("link", { name: "Brand settings form", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Assistant brand", exact: true }).selectOption(other);
  await page.getByRole("button", { name: "Open brand", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Assistant workspace", exact: true })
      .getByText("Remember that I like a calm voice", { exact: true }),
  ).toHaveCount(0);
  const denied = await page.request.get(
    `/api/v1/workspaces/${randomUUID()}/brands/${brand}/assistant`,
  );
  expect(denied.status()).toBe(404);
});
test("SSE failure clears provisional text while preserving the unsaved question", async ({
  page,
  context,
}) => {
  await signInAs(context, ALICE);
  const headers = { origin: APP },
    workspace = (
      await (
        await page.request.post("/api/v1/workspaces", { headers, data: { name: "Stream studio" } })
      ).json()
    ).workspace.id,
    brand = (
      await (
        await page.request.post(`/api/v1/workspaces/${workspace}/brands`, {
          headers,
          data: { name: "Stream" },
        })
      ).json()
    ).brand.id;
  await page.route("**/assistant/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'event: delta\ndata: {"text":"Unfinished provisional answer"}\n\nevent: error\ndata: {"error":{"code":"DEPENDENCY_UNAVAILABLE","message":"The response was interrupted."}}\n\n',
    }),
  );
  await page.goto(`/app/assistant?brandId=${brand}`);
  const main = page.getByRole("region", { name: "Assistant workspace", exact: true });
  await main.getByRole("textbox", { name: "Your message", exact: true }).fill("Keep this question");
  await main.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(main.getByRole("alert")).toContainText("interrupted");
  await expect(main.getByLabel("Provisional response")).toHaveCount(0);
  await expect(main.getByRole("textbox", { name: "Your message", exact: true })).toHaveValue(
    "Keep this question",
  );
});
