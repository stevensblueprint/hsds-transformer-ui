import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { makeArchive, readArchive } from "../src/transformation/archive";

test.setTimeout(90000);
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const picker = (page: Page) => page.getByLabel("Browse files", { exact: true });
const sourceText = readFileSync("src/assets/repository-json/orgs.json", "utf8");
const mappingText = readFileSync(
  "src/assets/repository-json/orgs_organization_mapping.json",
  "utf8",
);
const sourceFiles = () => [
  {
    name: "orgs.json",
    mimeType: "application/json",
    buffer: Buffer.from(sourceText),
  },
  {
    name: "orgs_organization_mapping.json",
    mimeType: "application/json",
    buffer: Buffer.from(mappingText),
  },
];
const row = (page: Page, name = "Name") =>
  page.getByRole("article", {
    name: `Review ${name} in orgs_organization_mapping.json, row ${name === "Name" ? 2 : 1} mapping`,
    exact: true,
  });
async function openRow(page: Page, name = "Name") {
  const target = row(page, name);
  if (
    !(await target
      .locator("details")
      .evaluate((element) => element.hasAttribute("open")))
  )
    await target.locator("summary").click();
  return target;
}
async function inspect(page: Page, zip = false) {
  await page.goto("/");
  await picker(page).setInputFiles(
    zip
      ? {
          name: "repository-json.zip",
          mimeType: "application/zip",
          buffer: readFileSync(
            "src/assets/repository-json/repository-json.zip",
          ),
        }
      : sourceFiles(),
  );
  await button(page, "Inspect files").click();
  await expect(
    page.getByRole("heading", { name: "Review & approve", level: 1 }),
  ).toBeVisible();
}
async function approve(page: Page) {
  await button(page, "Mark pending rows reviewed").click();
  await button(page, "Approve mapping").click();
}
async function outputZip(name = "Test Organization") {
  const file = await makeArchive([
    new File(
      [
        JSON.stringify({
          id: "1",
          name,
          description: "<img src=x onerror=alert(1)>",
        }),
      ],
      "organization_1.json",
    ),
  ]);
  return Buffer.from(await file.arrayBuffer());
}
async function mockSuccess(page: Page, name?: string) {
  const body = await outputZip(name);
  await page.route("**/transform", (route) =>
    route.fulfill({ status: 201, contentType: "application/zip", body }),
  );
}
async function run(page: Page) {
  await button(page, "Run transformation").click();
  await expect(
    page.getByLabel("Returned JSON: organization_1.json"),
  ).toBeVisible();
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
    document
      .querySelectorAll(".panel-body")
      .forEach((element) => element.scrollTo(0, 0));
  });
  await page.screenshot({
    path: `docs/evidence/interactions/${info.project.name}-${name}.png`,
    fullPage: true,
  });
}
async function tabTo(page: Page, target: Locator) {
  for (let count = 0; count < 160; count++) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Core control not reachable by keyboard");
}
async function activate(page: Page, target: Locator) {
  await tabTo(page, target);
  await page.keyboard.press("Enter");
}

test("continuous intake replaces numbered pages and separate ZIP mode; direct files run only after explicit review", async ({
  page,
}, info) => {
  let requests = 0;
  const response = await outputZip();
  await page.route("**/transform", async (route) => {
    requests++;
    const form = await new Response(
      new Uint8Array(route.request().postDataBuffer()!).buffer,
      {
        headers: { "content-type": route.request().headers()["content-type"] },
      },
    ).formData();
    expect(form.get("input_format")).toBe("json");
    const files = await readArchive(
      form.get("zip_file") as File,
      "json",
      new AbortController().signal,
    );
    expect(await files.find((file) => file.name === "orgs.json")!.text()).toBe(
      sourceText,
    );
    expect(
      await files
        .find((file) => file.name === "orgs_organization_mapping.json")!
        .text(),
    ).toBe(mappingText);
    await route.fulfill({
      status: 201,
      contentType: "application/zip",
      body: response,
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Transformation workflow" }),
  ).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "ZIP upload" })).toHaveCount(0);
  await expect(
    page.getByText("Load synthetic sample", { exact: true }),
  ).toHaveCount(0);
  await capture(page, info, "intake");
  const chooser = page.waitForEvent("filechooser");
  await activate(page, picker(page));
  await (await chooser).setFiles(sourceFiles());
  expect(requests).toBe(0);
  await button(page, "Inspect files").click();
  await expect(button(page, "Run transformation")).toBeDisabled();
  await approve(page);
  expect(requests).toBe(0);
  await capture(page, info, "mapping");
  await button(page, "Run transformation").dblclick();
  await expect(
    page.getByLabel("Returned JSON: organization_1.json"),
  ).toContainText("Test Organization");
  expect(requests).toBe(1);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.getByLabel("Checks and export context")).toContainText(
    "not run",
  );
  await capture(page, info, "output-mocked-transport");
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download output ZIP", exact: true })
    .click();
  expect((await downloaded).suggestedFilename()).toBe("transformation-1.zip");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Bring your data into focus", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download output ZIP" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});

test("questions, rejection and revision require renewed explicit approval and preserve earlier outputs", async ({
  page,
}) => {
  let requests = 0;
  const body = await outputZip();
  await page.route("**/transform", (route) => {
    requests++;
    return route.fulfill({ status: 201, contentType: "application/zip", body });
  });
  await inspect(page, true);
  let name = await openRow(page);
  await name.getByRole("button", { name: /^Question about/ }).click();
  await name
    .getByLabel("Question for review")
    .fill("Is Name the organization display name?");
  await button(page, "Save review question").click();
  await button(page, "Mark pending rows reviewed").click();
  await expect(button(page, "Approve mapping")).toBeDisabled();
  await name.getByRole("button", { name: /^Answer question about/ }).click();
  await name
    .getByLabel("Answer from review")
    .fill("Confirmed by the source owner.");
  await button(page, "Save review answer").click();
  await expect(button(page, "Run transformation")).toBeDisabled();
  await name.getByRole("button", { name: /^Approve / }).click();
  await button(page, "Approve mapping").click();
  await run(page);
  await button(page, "Review current mapping").click();
  name = await openRow(page);
  await expect(name).toContainText("Confirmed by the source owner.");
  await name.getByRole("button", { name: /^Reject / }).click();
  await expect(button(page, "Run transformation again")).toBeDisabled();
  await name.getByRole("button", { name: /^Edit / }).click();
  await name
    .getByLabel("Target path within organization")
    .fill("alternate_name");
  await name
    .getByLabel("Reason for change")
    .fill("Review a different destination for this supplied value.");
  await button(page, "Save mapping change").click();
  await expect(
    page.getByRole("heading", { name: "Review & approve", level: 1 }),
  ).toBeFocused();
  await expect(page.getByLabel("Approval scope")).toContainText("mapping v2");
  const inputsDownloaded = page.waitForEvent("download");
  await button(page, "Download current inputs").click();
  expect((await inputsDownloaded).suggestedFilename()).toBe(
    "source-v1-mapping-v2-inputs.zip",
  );
  await expect(button(page, "Run transformation")).toBeDisabled();
  await approve(page);
  await run(page);
  await expect(
    page.getByLabel("Transformation result").locator("option"),
  ).toHaveCount(2);
  await page.getByText("Compare with attempt 1", { exact: true }).click();
  await expect(
    page.getByText(/Diagnostics, resolved\/new finding counts/),
  ).toBeVisible();
  await page.getByLabel("Transformation result").selectOption("1");
  await expect(
    page.getByLabel("Checks and export context").locator(".."),
  ).toContainText("mapping v1");
  expect(requests).toBe(2);
});

test("source correction reviews before/after, preserves submitted bytes and makes approval stale", async ({
  page,
}) => {
  await mockSuccess(page);
  await inspect(page);
  await approve(page);
  await run(page);
  await button(page, "Review current mapping").click();
  await page.getByText("Inspect source values", { exact: true }).click();
  await button(page, "Correct source values").click();
  await expect(button(page, "Run transformation again")).toBeDisabled();
  await page
    .getByLabel("Revised source")
    .fill(sourceText.replace("Test Organization", "Corrected Organization"));
  await page
    .getByLabel("Reason for correction")
    .fill("Fix the supplied display name.");
  await button(page, "Review source change").click();
  await expect(page.getByLabel("Source correction review")).toContainText(
    "Before",
  );
  await expect(page.getByLabel("Source correction review")).toContainText(
    "Corrected Organization",
  );
  await button(page, "Approve source change").click();
  await expect(page.getByLabel("Approval scope")).toContainText("Source v2");
  await expect(
    page.getByRole("heading", { name: "Review & approve", level: 1 }),
  ).toBeFocused();
  await expect(button(page, "Run transformation")).toBeDisabled();
  await button(page, "Change files").click();
  await button(page, "Inspect files").click();
  await page.getByText("Inspect source values", { exact: true }).click();
  await expect(page.getByLabel("Source preview")).toContainText(
    "Corrected Organization",
  );
  await page.getByText("Submitted source and mapping", { exact: true }).click();
  await page
    .getByRole("region", { name: "Output file", exact: true })
    .locator("details")
    .filter({ hasText: /^orgs.json/ })
    .locator("summary")
    .click();
  await expect(
    page.getByRole("region", { name: "Output file", exact: true }),
  ).toContainText("Test Organization");
});

test("missing mappings, unsupported/malformed/unsafe input and removal cannot upload stale selected bytes", async ({
  page,
}) => {
  let posts = 0;
  await page.route("**/transform", (route) => {
    posts++;
    return route.abort();
  });
  await page.goto("/");
  await picker(page).setInputFiles(sourceFiles()[0]);
  await button(page, "Inspect files").click();
  await expect(page.getByRole("status")).toContainText(
    "Add a matching mapping",
  );
  await picker(page).setInputFiles(sourceFiles()[1]);
  await button(page, "Inspect files").click();
  await expect(
    page.getByRole("heading", { name: "Review & approve", level: 1 }),
  ).toBeVisible();
  await approve(page);
  await button(page, "Change files").click();
  await button(page, "Remove orgs.json").click();
  await expect(button(page, "Return to mapping")).toHaveCount(0);
  await button(page, "Inspect files").click();
  await expect(page.getByRole("status")).toContainText("source data file");
  await picker(page).setInputFiles({
    name: "bad.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("bad"),
  });
  await button(page, "Inspect files").click();
  await expect(page.getByRole("status")).toContainText("Malformed");
  const unsafe = await makeArchive([
    new File(["[]"], "orgs.json"),
    new File([mappingText], "orgs_organization_mapping.json"),
  ]);
  const data = Buffer.from(await unsafe.arrayBuffer());
  // Same-length traversal name in both headers; unsafe path checks run before CRC.
  for (
    let pos = data.indexOf("orgs.json");
    pos >= 0;
    pos = data.indexOf("orgs.json", pos + 1)
  )
    data.write("../x.json", pos);
  await picker(page).setInputFiles({
    name: "unsafe.zip",
    mimeType: "application/zip",
    buffer: data,
  });
  await button(page, "Inspect files").click();
  await expect(page.getByRole("status")).toContainText("Unsafe archive");
  expect(posts).toBe(0);
});

test("data errors, system failure, interrupted request and explicit retry stay distinct", async ({
  page,
}) => {
  let posts = 0;
  await page.route("**/transform", (route) => {
    posts++;
    if (posts === 3) return route.abort("failed");
    return route.fulfill({
      status: posts === 1 ? 422 : 500,
      contentType: "application/json",
      body: JSON.stringify({
        detail: posts === 1 ? "Invalid mapping" : "Worker unavailable",
      }),
    });
  });
  await inspect(page);
  await approve(page);
  await button(page, "Run transformation").click();
  await expect(page.getByRole("status")).toContainText("HTTP 422");
  await expect(page.getByLabel("Transformation result")).toContainText(
    "invalid-data",
  );
  await button(page, "Run transformation again").click();
  await expect(page.getByRole("status")).toContainText("HTTP 500");
  await button(page, "Run transformation again").click();
  await expect(page.getByRole("status")).toContainText("unknown");
  await expect(button(page, "Run transformation again")).toBeDisabled();
  expect(posts).toBe(3);
});

test("stop waiting and clearing discard late responses without claiming server cancellation", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  let started = false;
  const body = await outputZip();
  await page.route("**/transform", async (route) => {
    started = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({ status: 201, contentType: "application/zip", body })
      .catch(() => undefined);
  });
  await inspect(page);
  await approve(page);
  await button(page, "Run transformation").click();
  await expect.poll(() => started).toBe(true);
  await button(page, "Stop waiting").click();
  await expect(page.getByRole("status")).toContainText(
    "does not acknowledge cancellation",
  );
  release?.();
  await expect(
    page.getByRole("link", { name: "Download output ZIP" }),
  ).toHaveCount(0);
  await button(page, "Clear session").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(button(page, "Clear session")).toBeFocused();
  await button(page, "Clear session").click();
  await button(page, "Clear session and files").click();
  await expect(
    page.getByRole("heading", { name: "Bring your data into focus", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download output ZIP" }),
  ).toHaveCount(0);
});

test("CSV and ZIP use the same picker and preserve literal source values", async ({
  page,
}) => {
  await mockSuccess(page);
  await page.goto("/");
  await picker(page).setInputFiles([
    {
      name: "orgs.csv",
      mimeType: "text/csv",
      buffer: Buffer.from('ID,Name\n1,"=1+1"\n'),
    },
    {
      name: "orgs_organization_mapping.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "output,input,split,strip,transform\nid,ID,,,\nname,Name,,,\n",
      ),
    },
  ]);
  await button(page, "Inspect files").click();
  await page.getByText("Inspect source values", { exact: true }).click();
  await expect(page.getByLabel("Source preview")).toContainText("=1+1");
  await approve(page);
  await run(page);
});

test("expiry preserves response history and keyboard/mobile layouts remain accessible", async ({
  page,
}, info) => {
  await mockSuccess(page);
  await page.goto("/");
  await page.clock.install();
  await page
    .getByText("Need a working repository input?", { exact: true })
    .click();
  await activate(page, button(page, "Use repository JSON"));
  await expect(
    page.getByRole("heading", { name: "Review & approve", level: 1 }),
  ).toBeFocused();
  await activate(page, button(page, "Mark pending rows reviewed"));
  await activate(page, button(page, "Approve mapping"));
  await activate(page, button(page, "Run transformation"));
  await expect(
    page.getByLabel("Returned JSON: organization_1.json"),
  ).toBeVisible();
  await page.clock.fastForward(15 * 60 * 1000);
  await expect(
    page.getByRole("link", { name: "Download output ZIP" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Checks and export context")).toContainText(
    "HTTP 201 ZIP",
  );
  await expect(
    page.getByLabel("Returned JSON: organization_1.json"),
  ).toContainText("Test Organization");
  for (const context of ["output", "mapping", "intake"]) {
    if (context === "mapping")
      await button(page, "Review current mapping").click();
    if (context === "intake") await button(page, "Change files").click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
      context,
    ).toEqual([]);
    const original = page.viewportSize()!;
    await page.setViewportSize({ width: 320, height: 900 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      context,
    ).toBe(true);
    await page.setViewportSize(original);
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await capture(page, info, "dark-preference-intake");
});
