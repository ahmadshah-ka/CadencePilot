import AxeBuilder from "@axe-core/playwright";
import { createServerClient } from "@supabase/ssr";
import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import type { SeedUser } from "./fake-supabase";

export const FAKE = "http://localhost:54321";
export const APP = "http://localhost:3200";

export const OWNER: SeedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
  name: "Olivia Owner",
  status: "approved",
  owner: true,
};
export const ALICE: SeedUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "alice@example.test",
  name: "Alice Approved",
  status: "approved",
};
export const BOB: SeedUser = {
  id: "33333333-3333-4333-8333-333333333333",
  email: "bob@example.test",
  name: "Bob Approved",
  status: "approved",
};
export const PENDING: SeedUser = {
  id: "44444444-4444-4444-8444-444444444444",
  email: "pending@example.test",
  name: "Pat Pending",
  status: "pending",
};
export const REJECTED: SeedUser = {
  id: "55555555-5555-4555-8555-555555555555",
  email: "rejected@example.test",
  name: "Rae Rejected",
  status: "rejected",
};
export const SUSPENDED: SeedUser = {
  id: "66666666-6666-4666-8666-666666666666",
  email: "suspended@example.test",
  name: "Sam Suspended",
  status: "suspended",
};

export async function fake(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${FAKE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return response.json();
}

export async function resetWorld(users: SeedUser[]): Promise<void> {
  await fake("/__test/reset");
  await fake("/__test/seed", { users });
}

function fakeJwt(user: SeedUser): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: user.id,
    email: user.email,
    aud: "authenticated",
    role: "authenticated",
    aal: "aal1",
    session_id: "e2e-session",
    iat: now,
    exp: now + 60 * 60 * 24,
  })}.${Buffer.from("e2e-signature-bytes-0123456789ab").toString("base64url")}`;
}

/** Creates a session cookie exactly as the app's Supabase client would, for a seeded fake user. */
export async function signInAs(context: BrowserContext, user: SeedUser): Promise<void> {
  const jar = new Map<string, string>();
  const supabase = createServerClient(FAKE, "e2e-publishable-key", {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error } = await supabase.auth.setSession({
    access_token: fakeJwt(user),
    refresh_token: "e2e-refresh-token",
  });
  if (error) throw new Error(`could not create test session: ${error.message}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: APP })));
}

/** Fails with a readable list if axe finds any WCAG A/AA violation (includes colour contrast). */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
  );
  expect(summary, "accessibility violations").toEqual([]);
}

/** The page body must never scroll sideways at the current viewport. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(0);
}

export async function snap(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({
    path: `test-results/screens/${name}-${testInfo.project.name}.png`,
    fullPage: true,
  });
}
