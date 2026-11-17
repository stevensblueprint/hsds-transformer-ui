import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { deflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";

test.setTimeout(90000);
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Transformation workflow" })
    .getByRole("link", { name, exact: true });
async function go(page: Page, step: string) {
  await nav(page, step).click();
  await expect(nav(page, step)).toHaveAttribute("aria-current", "step");
}
async function selected(page: Page) {
  await page.goto("/");
  await button(page, "Use repository JSON").click();
  await button(page, "Inspect source").click();
}
async function approved(page: Page) {
  await selected(page);
  await go(page, "Mapping");
  await button(page, "Approve supplied mapping").click();
  await go(page, "Run");
}
async function capture(page: Page, info: TestInfo, step: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: `docs/evidence/repository-json/${info.project.name}-${step}.png`,
    fullPage: true,
  });
}
// Deliberately test-only HTTP fixture. Separate evidence records the real backend round trip.
function outputZip() {
  const name = Buffer.from("organization_1.json");
  const data = Buffer.from(
    JSON.stringify({
      id: "1",
      name: "Test Organization",
      description: "<img src=x onerror=alert(1)>",
    }),
  );
  const body = deflateRawSync(data);
  const local = 30 + name.length + body.length;
  const central = 46 + name.length;
  const bytes = Buffer.alloc(local + central + 22);
  bytes.writeUInt32LE(0x04034b50, 0);
  bytes.writeUInt16LE(8, 8);
  bytes.writeUInt32LE(body.length, 18);
  bytes.writeUInt32LE(data.length, 22);
  bytes.writeUInt16LE(name.length, 26);
  name.copy(bytes, 30);
  body.copy(bytes, 30 + name.length);
  bytes.writeUInt32LE(0x02014b50, local);
  bytes.writeUInt16LE(8, local + 10);
  bytes.writeUInt32LE(body.length, local + 20);
  bytes.writeUInt32LE(data.length, local + 24);
  bytes.writeUInt16LE(name.length, local + 28);
  name.copy(bytes, local + 46);
  const end = local + central;
  bytes.writeUInt32LE(0x06054b50, end);
  bytes.writeUInt16LE(1, end + 8);
  bytes.writeUInt16LE(1, end + 10);
  bytes.writeUInt32LE(central, end + 12);
  bytes.writeUInt32LE(local, end + 16);
  return bytes;
}
async function mockSuccess(page: Page) {
  await page.route("**/transform", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/zip",
      body: outputZip(),
    }),
  );
}

test("repository JSON replaces the synthetic entry and real upload stays separate from inspection/review", async ({
  page,
}, info) => {
  let posts = 0;
  await page.route("**/transform", (route) => {
    posts++;
    expect(route.request().postDataBuffer()?.toString()).toContain(
      'name="input_format"\r\n\r\njson',
    );
    expect(route.request().postDataBuffer()?.toString()).toContain(
      'filename="repository-json.zip"',
    );
    return route.fulfill({
      status: 201,
      contentType: "application/zip",
      body: outputZip(),
    });
  });
  await selected(page);
  await expect(
    page.getByText("Load synthetic sample", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Source JSON preview")).toContainText(
    "<p>Clean Me</p>",
  );
  await capture(page, info, "source");
  await go(page, "Mapping");
  await expect(
    page.getByText("organization.phones[].number", { exact: true }),
  ).toBeVisible();
  await button(page, "Reject supplied mapping").click();
  await go(page, "Run");
  await expect(button(page, "Run JSON transformation")).toBeDisabled();
  await go(page, "Mapping");
  await button(page, "Approve supplied mapping").click();
  expect(posts).toBe(0);
  await capture(page, info, "mapping");
  await go(page, "Run");
  await button(page, "Run JSON transformation").dblclick();
  await expect(page.getByLabel("Returned JSON preview")).toContainText(
    "Test Organization",
  );
  await expect(page.getByLabel("Returned JSON preview")).toContainText(
    "<img src=x onerror=alert(1)>",
  );
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(posts).toBe(1);
  await expect(page.getByRole("status")).toContainText("HTTP 201");
  await capture(page, info, "review-mocked-transport");
  await go(page, "Export");
  await expect(page.getByLabel("Check layers")).toContainText("not run");
  const download = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download transformed ZIP", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "repository-json-output.zip",
  );
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Download transformed ZIP", exact: true }),
  ).toHaveCount(0);
  await go(page, "Run");
  await expect(button(page, "Run JSON transformation")).toBeDisabled();
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});

test("invalid input, system failure and disconnected outcomes remain distinct with bounded explicit retry", async ({
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
        detail: posts === 1 ? "Bad mapping" : "Worker unavailable",
      }),
    });
  });
  await approved(page);
  await button(page, "Run JSON transformation").click();
  await expect(page.getByRole("status")).toContainText("HTTP 422");
  await expect(page.getByText("invalid-data", { exact: true })).toBeVisible();
  await button(page, "Retry JSON transformation").click();
  await expect(page.getByRole("status")).toContainText("HTTP 500");
  await expect(page.getByText("system-failure", { exact: true })).toBeVisible();
  await button(page, "Retry JSON transformation").click();
  await expect(page.getByRole("status")).toContainText("unknown");
  await expect(button(page, "Retry JSON transformation")).toBeDisabled();
  expect(posts).toBe(3);
});

test("stopping and switching inputs discard late responses without cancellation acknowledgement", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  let started = false;
  await page.route("**/transform", async (route) => {
    started = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({
        status: 201,
        contentType: "application/zip",
        body: outputZip(),
      })
      .catch(() => undefined);
  });
  await approved(page);
  await button(page, "Run JSON transformation").click();
  await expect.poll(() => started).toBe(true);
  await button(page, "Stop waiting").click();
  await expect(page.getByRole("status")).toContainText(
    "cancellation is not acknowledged",
  );
  release?.();
  await go(page, "Review");
  await expect(
    page.getByRole("link", { name: "Download transformed ZIP", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: "ZIP upload", exact: true }).check();
  await page
    .getByRole("radio", { name: "Repository JSON", exact: true })
    .check();
  await go(page, "Run");
  await expect(button(page, "Run JSON transformation")).toBeDisabled();
});

test("five steps support keyboard, labels, dark preference and 320px reflow", async ({
  page,
}, info) => {
  await mockSuccess(page);
  await page.goto("/");
  await keyboardActivate(page, button(page, "Use repository JSON"));
  await keyboardActivate(page, button(page, "Inspect source"));
  await keyboardActivate(page, nav(page, "Mapping"));
  await expect(
    page.getByRole("heading", { name: "Review & approve", exact: true }),
  ).toBeFocused();
  await keyboardActivate(page, button(page, "Approve supplied mapping"));
  await keyboardActivate(page, nav(page, "Run"));
  await keyboardActivate(page, button(page, "Run JSON transformation"));
  await expect(page.getByLabel("Returned JSON preview")).toBeVisible();
  const original = page.viewportSize()!;
  for (const step of ["Source", "Mapping", "Run", "Review", "Export"]) {
    await page.setViewportSize(original);
    await go(page, step);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
      step,
    ).toEqual([]);
    await page.setViewportSize({ width: 320, height: 900 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      step,
    ).toBe(true);
  }
  await page.setViewportSize(original);
  await page.emulateMedia({ colorScheme: "dark" });
  await go(page, "Review");
  await capture(page, info, "dark-review-mocked-transport");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

function testZip(name = "source.csv") {
  const path = Buffer.from(name);
  const localSize = 30 + path.length + 1;
  const centralSize = 46 + path.length;
  const bytes = Buffer.alloc(localSize + centralSize + 22);
  bytes.writeUInt32LE(0x04034b50, 0);
  bytes.writeUInt32LE(1, 18);
  bytes.writeUInt32LE(1, 22);
  bytes.writeUInt16LE(path.length, 26);
  path.copy(bytes, 30);
  bytes[localSize - 1] = 65;
  bytes.writeUInt32LE(0x02014b50, localSize);
  bytes.writeUInt32LE(1, localSize + 20);
  bytes.writeUInt32LE(1, localSize + 24);
  bytes.writeUInt16LE(path.length, localSize + 28);
  path.copy(bytes, localSize + 46);
  const end = localSize + centralSize;
  bytes.writeUInt32LE(0x06054b50, end);
  bytes.writeUInt16LE(1, end + 8);
  bytes.writeUInt16LE(1, end + 10);
  bytes.writeUInt32LE(centralSize, end + 12);
  bytes.writeUInt32LE(localSize, end + 16);
  return bytes;
}

test("real ZIP transport is opt-in and malformed/unsafe sources never upload", async ({
  page,
}) => {
  let posts = 0;
  await page.route("**/health", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/transform", (route) => {
    posts++;
    return route.fulfill({
      status: 201,
      contentType: "application/zip",
      body: testZip(),
    });
  });
  await page.goto("/");
  await page.getByRole("radio", { name: "ZIP upload", exact: true }).check();
  const input = page.getByLabel("Browse ZIP or drop it in this section");
  await input.setInputFiles({
    name: "malformed.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("malformed"),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Malformed" }),
  ).toBeVisible();
  await expect(button(page, "Upload ZIP and transform")).toBeDisabled();
  await input.setInputFiles({
    name: "unsafe.zip",
    mimeType: "application/zip",
    buffer: testZip("../source.csv"),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Unsafe archive" }),
  ).toBeVisible();
  expect(posts).toBe(0);
  await input.setInputFiles({
    name: "test.zip",
    mimeType: "application/zip",
    buffer: testZip(),
  });
  await expect(button(page, "Upload ZIP and transform")).toBeEnabled();
  expect(posts).toBe(0);
  await button(page, "Upload ZIP and transform").dblclick();
  await expect(
    page.getByRole("link", { name: "Download transformed ZIP", exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
  await expect(
    page.getByRole("status").filter({ hasText: "not proof of HSDS validity" }),
  ).toBeFocused();
  await button(page, "Clear selection").click();
  await expect(input).toBeFocused();
  await expect(
    page.getByRole("link", { name: "Download transformed ZIP", exact: true }),
  ).toHaveCount(0);
});

test("real ZIP disconnection and stopping the wait never acknowledge server cancellation", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/health", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/transform", (route) => {
    requests++;
    return route.abort("failed");
  });
  await page.goto("/");
  await page.getByRole("radio", { name: "ZIP upload", exact: true }).check();
  await page.getByLabel("Browse ZIP or drop it in this section").setInputFiles({
    name: "test.zip",
    mimeType: "application/zip",
    buffer: testZip(),
  });
  await button(page, "Upload ZIP and transform").click();
  const status = page.getByRole("status").filter({ hasText: /unknown:/ });
  await expect(status).toBeVisible();
  await button(page, "Check connection").click();
  await expect(status).toBeVisible();
  expect(requests).toBe(1);
  await page.unroute("**/transform");
  let release: (() => void) | undefined;
  await page.route("**/transform", async (route) => {
    requests++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({
        status: 201,
        contentType: "application/zip",
        body: testZip(),
      })
      .catch(() => undefined);
  });
  await button(page, "Retry transformation").click();
  await button(page, "Stop waiting (request cancellation)").click();
  await expect(status).toBeVisible();
  await expect(
    page.getByText(
      /Server cancellation is not acknowledged; status remains unknown/,
    ),
  ).toBeVisible();
  release?.();
  expect(requests).toBe(2);
  await expect(
    page.getByRole("link", { name: "Download transformed ZIP", exact: true }),
  ).toHaveCount(0);
});

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 160; index++) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Core control is not keyboard reachable");
}
async function keyboardActivate(page: Page, target: Locator) {
  await tabTo(page, target);
  await page.keyboard.press("Enter");
}

test("expired local artifacts preserve the received-response check and earlier output", async ({
  page,
}) => {
  await page.clock.install();
  await mockSuccess(page);
  await approved(page);
  await button(page, "Run JSON transformation").click();
  await expect(page.getByLabel("Returned JSON preview")).toBeVisible();
  await go(page, "Source");
  await expect(
    page.getByText("Selected in memory. Upload has not started.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await go(page, "Mapping");
  await button(page, "Reject supplied mapping").click();
  await expect(page.getByRole("status")).toContainText("Earlier results");
  await go(page, "Export");
  await page.clock.fastForward(15 * 60 * 1000);
  await expect(page.getByRole("status")).toContainText("expired");
  await expect(
    page.getByRole("link", { name: "Download transformed ZIP", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Check layers")).toContainText("HTTP 201 ZIP");
  await expect(page.getByLabel("Returned JSON preview")).toContainText(
    "Test Organization",
  );
});

test("unpreviewable output preserves the original ZIP and makes no validation claim", async ({
  page,
}) => {
  await page.route("**/transform", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/zip",
      body: testZip("output.json"),
    }),
  );
  await approved(page);
  await button(page, "Run JSON transformation").click();
  await expect(page.getByText(/Preview unavailable:/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download transformed ZIP", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Check layers")).toContainText("not run");
});

test("generic JSON ZIP uses the explicit format and changing it invalidates inspection", async ({
  page,
}) => {
  let posts = 0;
  await page.route("**/health", (route) =>
    route.fulfill({ status: 200, body: "{}" }),
  );
  await page.route("**/transform", (route) => {
    posts++;
    expect(route.request().postDataBuffer()?.toString()).toContain(
      'name="input_format"\r\n\r\njson',
    );
    return route.fulfill({
      status: 201,
      contentType: "application/zip",
      body: outputZip(),
    });
  });
  await page.goto("/");
  await page.getByRole("radio", { name: "ZIP upload", exact: true }).check();
  const format = page.getByLabel("Archive input format");
  await format.selectOption("json");
  const input = page.getByLabel("Browse ZIP or drop it in this section");
  await input.setInputFiles({
    name: "repository-json.zip",
    mimeType: "application/zip",
    buffer: readFileSync("src/assets/repository-json/repository-json.zip"),
  });
  await expect(
    page.getByText("Archive inventory (2 JSON files; names only)"),
  ).toBeVisible();
  await format.selectOption("csv");
  await expect(button(page, "Upload ZIP and transform")).toBeDisabled();
  await format.selectOption("json");
  await input.setInputFiles({
    name: "repository-json.zip",
    mimeType: "application/zip",
    buffer: readFileSync("src/assets/repository-json/repository-json.zip"),
  });
  await button(page, "Upload ZIP and transform").click();
  await expect(
    page.getByRole("link", { name: "Download transformed ZIP", exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
});
