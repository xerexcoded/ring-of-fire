import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

type Rectangle = { x: number; y: number; width: number; height: number };

function rectanglesOverlap(first: Rectangle, second: Rectangle) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

test("guided journey exposes the definition and manual chapter controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /A ring that isn’t a ring/i })).toBeVisible();
  await expect(page.getByText("GVP 5.3.6 · 688 volcanoes · 41 PROF regions")).toBeVisible();
  await expect(page.getByRole("button", { name: /chapter 6: The Andes/i })).toBeAttached();
});

test("manual chapters remain usable with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const andes = page.getByRole("button", { name: /chapter 6: The Andes/i });
  await andes.click();
  await expect(andes).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { level: 3, name: "The Andes" })).toBeVisible();
});

test("atlas offers a non-map equivalent for every visible layer", async ({ page }) => {
  await page.goto("/atlas");
  await page.getByText("Open accessible tables for every visible map layer").click();
  await expect(page.getByText(/Volcanoes matching the current atlas filters/)).toBeVisible();
  await expect(page.getByText(/Earthquakes matching magnitude, depth, and date filters/)).toBeVisible();
  await expect(page.getByText(/Plate boundary segments/)).toBeVisible();
  await expect(page.getByText(/Significant tsunami sources/)).toBeVisible();
});

test("atlas search, layers, VEI filters, and profile deep links work together", async ({ page }) => {
  await page.goto("/atlas");
  await page.getByRole("searchbox", { name: "Search volcano, country, or region" }).fill("Fuji");
  const tables = page.locator(".map-text-equivalent");
  const summary = tables.locator("summary");
  await summary.scrollIntoViewIfNeeded();
  await summary.click();
  if (!await tables.evaluate((element) => (element as HTMLDetailsElement).open)) {
    await summary.press("Enter");
  }
  await expect(tables).toHaveJSProperty("open", true);
  const fujiLink = page.getByRole("link", { name: /Fuji(?:san)?/i });
  await fujiLink.scrollIntoViewIfNeeded();
  await fujiLink.click();
  await expect(page).toHaveURL(/\/volcanoes\/fuji$/);

  await page.goto("/atlas");
  await page.getByRole("button", { name: "Hide Volcanoes" }).click();
  await expect(page.getByRole("button", { name: "Show Volcanoes" })).toBeVisible();
  await page.getByRole("button", { name: /Filters/ }).click();
  await expect(page.getByLabel("Minimum VEI")).toBeVisible();
  await expect(page.getByLabel("Maximum VEI")).toBeVisible();
});

test("all ten volcano profiles are statically addressable", async ({ page }) => {
  await page.goto("/volcanoes/mount-st-helens");
  await expect(page.getByRole("heading", { level: 1, name: "Mount St. Helens" })).toBeVisible();
  await expect(page.getByText("Fixture refreshed")).toBeVisible();
  await expect(page.getByRole("link", { name: /Smithsonian GVP profile/i })).toBeVisible();
});

test("history and sourcebook expose uncertainty and provenance", async ({ page }) => {
  await page.goto("/history");
  await expect(page.getByRole("heading", { level: 1, name: /History, written in ash and water/i })).toBeVisible();
  await expect(page.getByText(/Uncertainty/).first()).toBeVisible();
  await page.goto("/sourcebook");
  await expect(page.getByRole("heading", { level: 1, name: /Show your work/i })).toBeVisible();
  await expect(page.getByText("GET /api/v1/sources/status")).toBeVisible();
});

test("editorial title stacks keep labels and supporting copy clear", async ({ page }) => {
  const routes = [
    "/",
    "/history",
    "/data",
    "/sourcebook",
    "/volcanoes/hunga-tonga-hunga-haapai",
    "/does-not-exist",
  ];

  for (const route of routes) {
    await page.goto(route);

    const titleStacks = await page
      .locator(".display-title-group, .section-title-group")
      .evaluateAll((groups) => groups.map((group) => {
        const label = group.querySelector<HTMLElement>(":scope > .eyebrow");
        const heading = group.querySelector<HTMLElement>(":scope > h1, :scope > h2");
        const labelRect = label?.getBoundingClientRect();
        const headingRect = heading?.getBoundingClientRect();

        return {
          label: label?.textContent?.trim() ?? "missing label",
          gap: labelRect && headingRect ? headingRect.top - labelRect.bottom : -1,
        };
      }));

    expect(titleStacks.length, `${route} should expose at least one title stack`).toBeGreaterThan(0);
    for (const stack of titleStacks) {
      expect(stack.gap, `${route}: ${stack.label} overlaps its heading`).toBeGreaterThanOrEqual(12);
    }

    const siblingCollisions = await page
      .locator(".display-title-group")
      .evaluateAll((groups) => groups.flatMap((group) => {
        const sibling = group.nextElementSibling;
        if (!(sibling instanceof HTMLElement)) return [];

        const heading = group.querySelector<HTMLElement>(":scope > h1, :scope > h2");
        if (!heading) return [];

        const titleRect = heading.getBoundingClientRect();
        const siblingRect = sibling.getBoundingClientRect();
        const overlaps = titleRect.left < siblingRect.right
          && titleRect.right > siblingRect.left
          && titleRect.top < siblingRect.bottom
          && titleRect.bottom > siblingRect.top;

        return overlaps ? [sibling.textContent?.trim() ?? sibling.tagName] : [];
      }));

    expect(siblingCollisions, `${route}: title overlaps adjacent copy`).toEqual([]);
  }
});

test("wide volcano titles remain clear of the atlas return link", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "wide-layout regression");
  await page.setViewportSize({ width: 2048, height: 1250 });
  await page.goto("/volcanoes/hunga-tonga-hunga-haapai");

  const [back, title] = await Promise.all([
    page.locator(".profile-back").boundingBox(),
    page.locator(".profile-identity h1").boundingBox(),
  ]);

  expect(back).not.toBeNull();
  expect(title).not.toBeNull();
  expect(rectanglesOverlap(back!, title!), "profile title overlaps the atlas return link").toBe(false);
});

test("sourcebook preview has a static reduced-motion equivalent", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sourcebook");
  await expect(page.locator(".sourcebook-demo-motion")).toBeHidden();
  await expect(page.locator(".sourcebook-demo-static")).toBeVisible();
});

test("Data Lab fails gracefully when analytics is unavailable", async ({ page }) => {
  await page.route("**/metabase/guest-token", (route) => route.fulfill({
    status: 503,
    contentType: "application/problem+json",
    body: JSON.stringify({ title: "Analytics unavailable", status: 503 }),
  }));
  await page.goto("/data");
  await expect(page.getByRole("heading", { level: 1, name: /Evidence, with its edges showing/i })).toBeVisible();
  await expect(page.getByText("Data Lab is temporarily unavailable")).toBeVisible();
});

test("live Data Lab renders six positioned charts and synchronizes filters", async ({ page }) => {
  test.skip(process.env.FULL_STACK !== "1", "requires the provisioned Compose stack");
  await page.goto("/data");
  const embed = page.locator("metabase-dashboard");
  await embed.scrollIntoViewIfNeeded();
  const frame = page.frameLocator("metabase-dashboard iframe");
  await expect(frame.getByText("Ring membership by GVP region", { exact: true })).toBeVisible({ timeout: 30_000 });

  const cards = frame.locator("[data-testid=dashcard-container]");
  await expect(cards).toHaveCount(6);
  const positions = await cards.evaluateAll((elements) => elements.map((element) => {
    const { x, y } = element.getBoundingClientRect();
    return `${Math.round(x)}:${Math.round(y)}`;
  }));
  expect(new Set(positions).size).toBe(6);
  await expect(frame.getByText("Which fields do you want to use for the X and Y axes?", { exact: true })).toHaveCount(0);

  await page.getByLabel("Region").selectOption("Taupo Volcanic Arc");
  await expect(frame.getByText("Taupo Volcanic Arc", { exact: true }).first()).toBeVisible();
  await expect(embed).toHaveAttribute("parameters", /Taupo Volcanic Arc/);
});

test("mobile navigation is keyboard-operable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only flow");
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.getByRole("link", { name: /History$/ }).click();
  await expect(page).toHaveURL(/\/history$/);
});

test("homepage has no critical accessibility violations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(({ impact }) => impact === "critical" || impact === "serious")).toEqual([]);
});
