import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://www.localhost";
const outputDirectory = fileURLToPath(new URL("../output/demo-frames/", import.meta.url));

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce",
});

async function settle(milliseconds = 900) {
  await page.waitForTimeout(milliseconds);
}

async function waitForMap(index = 0) {
  await page.locator(".map-loading").nth(index).waitFor({ state: "hidden", timeout: 20_000 });
}

async function capture(name) {
  await page.screenshot({ path: `${outputDirectory}/${name}.png`, animations: "disabled" });
}

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1, name: /A ring that isn’t a ring/i }).waitFor();
  await waitForMap();
  await settle();
  await capture("01-premise");

  const japanChapter = page.getByRole("button", { name: /chapter 3: Japan/i });
  await japanChapter.click();
  await page.getByRole("heading", { level: 3, name: /Japan.*Kurils.*Kamchatka/i }).waitFor();
  await waitForMap(1);
  await settle();
  await capture("02-journey");

  await page.goto(`${baseUrl}/atlas`, { waitUntil: "domcontentloaded" });
  await page.getByText(/\d+ volcanoes · \d+ earthquakes/).waitFor();
  await waitForMap();
  await page.getByRole("searchbox", { name: "Search volcano, country, or region" }).fill("Fuji");
  await settle();
  await capture("03-atlas-fuji");

  await page.goto(`${baseUrl}/data`, { waitUntil: "domcontentloaded" });
  const embed = page.locator("metabase-dashboard");
  await embed.evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 74));
  const frame = page.frameLocator("metabase-dashboard iframe");
  await frame.getByText("Ring membership by GVP region", { exact: true }).waitFor({ timeout: 30_000 });
  await page.getByLabel("Region").selectOption("Taupo Volcanic Arc");
  await frame.getByText("Taupo Volcanic Arc", { exact: true }).first().waitFor();
  await settle();
  await capture("04-data-lab");

  await page.goto(`${baseUrl}/sourcebook`, { waitUntil: "domcontentloaded" });
  await page.locator("#datasets").evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 74));
  await page.getByRole("heading", { name: /Freshness is part of the fact/i }).waitFor();
  await settle();
  await capture("05-sourcebook");
} finally {
  await browser.close();
}

console.log(`Captured demo frames in ${outputDirectory}`);
