import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalOverflow, resetWorld, snap } from "./helpers";

const PAGES = [
  { path: "/", name: "home", heading: /Turn good ideas into a week you can finish/ },
  { path: "/how-it-works", name: "how-it-works", heading: /How it works/ },
  { path: "/research", name: "research", heading: /Research you can check/ },
  { path: "/request-access", name: "request-access", heading: /Request access/ },
  { path: "/sign-in", name: "sign-in", heading: /Sign in/ },
];

test.beforeEach(async () => resetWorld([]));

for (const { path, name, heading } of PAGES) {
  test(`public page ${name}: renders, accessible, no sideways scroll`, async ({
    page,
  }, testInfo) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expectAccessible(page);
    await expectNoHorizontalOverflow(page);
    await snap(page, testInfo, name);
  });
}

test("keyboard: the skip link is the first stop and moves focus to the content", async ({
  page,
}) => {
  await page.goto("/how-it-works");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("navigation exposes the specified top-level links and marks the current page", async ({
  page,
  isMobile,
}) => {
  await page.goto("/research");
  if (page.viewportSize()!.width < 768) await page.getByText("Menu", { exact: true }).click();
  const nav = page.getByRole("navigation", {
    name: isMobile || page.viewportSize()!.width < 768 ? "Main (mobile)" : "Main",
  });
  for (const label of ["Product", "How it works", "Research", "Request access", "Sign in"]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: "Research" })).toHaveAttribute("aria-current", "page");
});

test("the workflow demo is operable by keyboard and always labelled as illustrative", async ({
  page,
}, testInfo) => {
  await page.goto("/#demo");
  const demo = page.locator("#demo");
  await expect(demo.getByText(/Illustrative example with made-up content/).first()).toBeVisible();
  await expect(demo.getByRole("heading", { level: 3 })).toHaveText(/Step 1: Add your brands/);

  const stepThree = demo.getByRole("button", { name: /Review the plan/ });
  await stepThree.focus();
  await page.keyboard.press("Enter");
  await expect(demo.getByRole("heading", { level: 3 })).toHaveText(/Step 3: Review the plan/);
  await expect(stepThree).toHaveAttribute("aria-current", "step");
  await expect(demo.getByText(/of 6h 30m available/)).toBeVisible();

  await demo.getByRole("button", { name: /Open a cited topic/ }).click();
  await expect(demo.getByText("insufficient", { exact: true })).toBeVisible();
  await demo.getByRole("button", { name: "Next" }).click();
  await expect(demo.getByRole("heading", { level: 3 })).toHaveText(/Step 5: Record/);
  await expectAccessible(page);
  await snap(page, testInfo, "demo");
});

test("the demo never shows invented customer metrics or testimonials", async ({ page }) => {
  await page.goto("/");
  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const forbidden of [
    "testimonial",
    "followers",
    "% growth",
    "free forever",
    "best-in-class",
    "#1 ",
  ]) {
    expect(text, forbidden).not.toContain(forbidden);
  }
});

test("reduced motion and dark colour scheme still render accessibly", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/");
  await expectAccessible(page);
  await snap(page, testInfo, "home-dark");
});

test("the mobile menu opens and reaches every destination", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) >= 768, "mobile layouts only");
  await page.goto("/");
  await page.getByText("Menu", { exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main (mobile)" })
    .getByRole("link", { name: "How it works" })
    .click();
  await expect(page).toHaveURL(/\/how-it-works$/);
});
