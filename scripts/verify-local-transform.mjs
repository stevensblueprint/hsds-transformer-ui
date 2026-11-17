// Explicit, local-only smoke check. Uses the repository fixture, never partner data.
import { chromium } from "playwright-core";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const directory = "docs/evidence/interactions";
await mkdir(directory, { recursive: true });
const source = await readFile("src/assets/repository-json/orgs.json", "utf8");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
const requests = [];
page.on("request", (request) => {
  if (request.method() === "POST") requests.push(request.url());
});
const button = (name) => page.getByRole("button", { name, exact: true });
try {
  await page.goto("http://localhost:5173");
  assert.match(
    await page.getByText(/Configured transformer:/).textContent(),
    /http:\/\/localhost:8000/,
  );
  await page
    .getByText("Need a working repository input?", { exact: true })
    .click();
  await button("Use repository JSON").click();
  await button("Mark pending rows reviewed").click();
  await button("Approve mapping").click();
  await button("Run transformation").click();
  const preview = page.getByLabel("Returned JSON: organization_1.json");
  await preview.waitFor();
  const first = JSON.parse(await preview.textContent());
  assert.equal(first.name, "Test Organization");
  assert.equal(first.description, "Clean Me");
  await button("Review current mapping").click();
  await page.getByText("Inspect source values", { exact: true }).click();
  await button("Correct source values").click();
  await page
    .getByLabel("Revised source")
    .fill(source.replace("Test Organization", "Reviewed Organization"));
  await page
    .getByLabel("Reason for correction")
    .fill(
      "Verify an explicit local source correction against the actual transformer.",
    );
  await button("Review source change").click();
  await button("Approve source change").click();
  await page
    .getByRole("heading", { name: "Review & approve", level: 1 })
    .waitFor();
  await button("Mark pending rows reviewed").click();
  await button("Approve mapping").click();
  await button("Run transformation").click();
  await preview.waitFor();
  const second = JSON.parse(await preview.textContent());
  assert.equal(second.name, "Reviewed Organization");
  assert.equal(second.description, "Clean Me");
  assert.equal(second.phones.length, 2);
  assert.equal(second.languages.length, 2);
  await page.evaluate(async () => {
    await document.fonts.ready;
    document
      .querySelectorAll(".panel-body")
      .forEach((element) => element.scrollTo(0, 0));
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: `${directory}/actual-backend-desktop-correction.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${directory}/actual-backend-mobile-output.png`,
    fullPage: true,
  });
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download output ZIP", exact: true })
    .click();
  const download = await downloadEvent;
  await download.saveAs(`${directory}/actual-corrected-output.zip`);
  assert.equal(requests.length, 2);
  assert.ok(requests.every((url) => url === "http://localhost:8000/transform"));
  await writeFile(
    `${directory}/actual-local-backend.json`,
    JSON.stringify(
      {
        backendRevision: "6486294a7aac8fbce1bb4e021fe6e810c1f335df",
        input: "Bundled upstream orgs.json + supplied JSON mapping",
        requests,
        first,
        second,
        localSourceVersions: [1, 2],
        mappingVersion: 1,
        limitations:
          "HTTP 201 actual returned JSON; no HSDS schema/semantic checks. Existing installed local backend dependencies, not a fresh locked backend install.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS: two actual local JSON transformations, reviewed source correction, fresh approval and retained earlier output.",
  );
} finally {
  await browser.close();
}
