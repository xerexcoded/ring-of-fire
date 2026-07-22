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
  test.slow();
  await page.goto("/atlas");
  const tables = page.locator(".map-text-equivalent");
  const summary = tables.locator("summary");
  await summary.scrollIntoViewIfNeeded();
  await summary.click();
  if (!await tables.evaluate((element) => (element as HTMLDetailsElement).open)) {
    await summary.press("Enter");
  }
  await expect(tables).toHaveJSProperty("open", true);
  await expect(page.getByText(/Volcanoes matching the current atlas filters/)).toBeVisible();
  await expect(page.getByText(/Earthquakes matching magnitude, depth, and date filters/)).toBeVisible();
  await expect(page.getByText(/Plate boundary segments/)).toBeVisible();
  await expect(page.getByText(/Significant tsunami sources/)).toBeVisible();
});

test("atlas search, layers, VEI filters, and profile deep links work together", async ({ page }) => {
  test.slow();
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
  await page.getByRole("button", { name: "Filters", exact: true }).click({ force: true });
  await expect(page.getByLabel("Minimum VEI")).toBeVisible();
  const maximumVei = page.locator("#atlas-filters label").filter({ hasText: "Maximum VEI" }).locator("select");
  await maximumVei.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await expect(maximumVei).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1, name: /Showing the Ring/i })).toBeVisible();
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
  await page.route("**/metabase/resources/ring-of-fire-data-lab", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ entityType: "dashboard", entityId: 1 }),
  }));
  await page.route("**/metabase/guest-token", (route) => route.fulfill({
    status: 503,
    contentType: "application/problem+json",
    body: JSON.stringify({ title: "Analytics unavailable", status: 503 }),
  }));
  await page.goto("/data");
  await expect(page.getByRole("heading", { level: 1, name: /Explore the Pacific evidence/i })).toBeVisible();
  await page.locator("#overview").scrollIntoViewIfNeeded();
  await expect(page.getByText("This workspace is temporarily unavailable")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Compare the reviewed volcanic record" })).toBeAttached();
});

test("Data Lab exposes four navigable workspaces and reduced-motion loading", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/data");
  await expect(page.getByRole("navigation", { name: "Data Lab sections" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(4);
  await page.getByRole("link", { name: "04 Tsunamis" }).click();
  await expect(page.locator("#tsunamis")).toBeInViewport();
  await expect(page.locator("#tsunamis .lazy-metabase-dashboard")).toHaveCSS("transform", "none");
});

test("live Data Lab renders sixteen positioned charts across four dashboards", async ({ page }, testInfo) => {
  test.skip(process.env.FULL_STACK !== "1", "requires the provisioned Compose stack");
  await page.goto("/data");
  const workspaces = [
    { id: "overview", card: "Pacific observation density", filter: null },
    { id: "volcanoes", card: "Reviewed volcanoes by GVP region", filter: "Start year", choice: "1980" },
    { id: "seismicity", card: "Recent earthquake density", filter: "Lookback days", choice: "90" },
    { id: "tsunamis", card: "Recorded tsunami density", filter: "Start year", choice: "2000" },
  ] as const;

  for (const workspace of workspaces) {
    const section = page.locator(`#${workspace.id}`);
    await section.scrollIntoViewIfNeeded();
    const embed = section.locator("metabase-dashboard");
    await expect(embed).toBeAttached({ timeout: 30_000 });
    const frame = section.frameLocator("metabase-dashboard iframe");
    await expect(frame.getByText(workspace.card, { exact: true })).toBeVisible({ timeout: 30_000 });

    const cards = frame.locator("[data-testid=dashcard-container]");
    await expect(cards).toHaveCount(4);
    await expect.poll(async () => cards.evaluateAll((elements) => new Set(elements.map((element) => {
      const { x, y } = element.getBoundingClientRect();
      return `${Math.round(x)}:${Math.round(y)}`;
    })).size)).toBe(4);
    const layout = await cards.evaluateAll((elements) => {
      const positions = elements.map((element) => {
        const { x, y } = element.getBoundingClientRect();
        return `${Math.round(x)}:${Math.round(y)}`;
      });
      const grid = elements[0]?.parentElement?.getBoundingClientRect();
      const minLeft = Math.min(...elements.map((element) => element.getBoundingClientRect().left));
      const maxRight = Math.max(...elements.map((element) => element.getBoundingClientRect().right));
      return { positions, gridCoverage: grid ? (maxRight - minLeft) / grid.width : 0 };
    });
    expect(new Set(layout.positions).size).toBe(4);
    expect(layout.gridCoverage).toBeGreaterThan(0.97);
    await expect(frame.getByText("Which fields do you want to use for the X and Y axes?", { exact: true })).toHaveCount(0);
    if (workspace.filter && testInfo.project.name !== "mobile") {
      const filter = frame.getByRole("button", { name: workspace.filter });
      await expect(filter).toBeVisible();
      await filter.click();
      await frame.getByText(workspace.choice, { exact: true }).last().click();
      await frame.getByRole("button", { name: "Update filter" }).click();
      await expect(filter).toContainText(workspace.choice);
    }
  }
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
