import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

test.setTimeout(90_000);
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Transformation workflow" })
    .getByRole("link", { name, exact: true });
const runButton = (page: Page) =>
  page.getByRole("button", { name: /^Run transformation(?: again)?$/ });
const mapping = (page: Page, id: string) =>
  page.getByRole("article", { name: `Review ${id} mapping`, exact: true });
async function go(page: Page, step: string) {
  await nav(page, step).click();
  await expect(nav(page, step)).toHaveAttribute("aria-current", "step");
}
async function controls(page: Page) {
  const details = page.locator("details.scenario-panel");
  if (!(await details.evaluate((element) => element.hasAttribute("open"))))
    await details.locator("summary").click();
}
async function scenario(page: Page, value: string) {
  await controls(page);
  await page
    .getByLabel("Scenario for the next synthetic action")
    .selectOption(value);
}
async function inspectSyntheticSource(page: Page) {
  await button(page, "Load synthetic sample").click();
  await button(page, "Inspect source").click();
}
async function approveRows(page: Page, demonstrateRevision = false) {
  await go(page, "Mapping");
  if (demonstrateRevision) {
    await button(page, "Reject organization").click();
    await expect(mapping(page, "organization")).toContainText("rejected");
    await button(page, "Revise organization").click();
    await expect(
      mapping(page, "organization").getByLabel(
        "Full target paths (one per line)",
      ),
    ).toBeFocused();
    await mapping(page, "organization")
      .getByLabel("Full target paths (one per line)")
      .fill("organization.name\nservice.organization_id");
    await mapping(page, "organization")
      .getByRole("button", { name: "Save mapping revision", exact: true })
      .click();
    await expect(button(page, "Revise organization")).toBeFocused();
  }
  await button(page, "Approve organization").click();
  await button(page, "Approve service").click();
  await page
    .getByLabel("Clarification answer", { exact: true })
    .fill(
      "This is an invented public service contact, not an internal staff number.",
    );
  await button(page, "Save clarification").click();
  await expect(mapping(page, "phone")).toContainText("proposed");
  await expect(button(page, "Approve mapping version")).toBeDisabled();
  await button(page, "Approve phone").click();
  await button(page, "Revise locations").click();
  await mapping(page, "locations")
    .getByLabel("Supported demo transformation")
    .selectOption("Split semicolon list; preserve source links");
  await mapping(page, "locations")
    .getByRole("button", { name: "Save mapping revision", exact: true })
    .click();
  await expect(mapping(page, "locations")).toContainText("one to many");
  await button(page, "Approve locations").click();
  await expect(button(page, "Approve mapping version")).toBeEnabled();
}
async function approvedWorkspace(page: Page) {
  await page.goto("/");
  await inspectSyntheticSource(page);
  await approveRows(page);
  await button(page, "Approve mapping version").click();
}
async function completeRun(page: Page) {
  await runButton(page).click();
  for (let index = 0; index < 4; index++)
    await button(page, "Advance simulated stage").click();
}
async function capture(page: Page, info: TestInfo, step: string) {
  const viewport = info.project.name.startsWith("mobile")
    ? "mobile"
    : "desktop";
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
    await new Promise(requestAnimationFrame);
  });
  await page.screenshot({
    path: `docs/evidence/after-${viewport}-${step}.png`,
    fullPage: true,
  });
}

test("full review, correction, rerun and identified export preserve the earlier source and report", async ({
  page,
}, info) => {
  await page.goto("/");
  await inspectSyntheticSource(page);
  await capture(page, info, "source");
  await approveRows(page, true);
  await capture(page, info, "mapping");
  await button(page, "Approve mapping version").dblclick();
  await expect(runButton(page)).toBeEnabled();
  await runButton(page).dblclick();
  for (let index = 0; index < 4; index++)
    await button(page, "Advance simulated stage").click();
  await go(page, "Review");
  await expect(
    page.getByLabel("Report version").locator("option:not([disabled])"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: /DEMO_PHONE_LENGTH/ }).click();
  const evidence = page.getByRole("region", {
    name: "Selected diagnostic evidence",
  });
  await expect(evidence).toContainText("services.csv");
  await expect(evidence).toContainText("phone.number");
  await expect(evidence).toContainText("201-555-01 → 8 digits");
  await page.getByRole("button", { name: /DEMO_PROVENANCE_UNKNOWN/ }).click();
  await expect(evidence).toContainText("Unavailable — not supplied");
  await capture(page, info, "review");
  await button(page, "Reject correction").click();
  await expect(button(page, "Approve correction version")).toBeDisabled();
  await button(page, "Revise correction").click();
  await expect(page.getByLabel("Revised value", { exact: true })).toBeFocused();
  await page.getByLabel("Revised value", { exact: true }).fill("201-555-0101");
  await page
    .getByLabel("Reason for revision", { exact: true })
    .fill("Reviewed authored fixture value; preserve original source.");
  await button(page, "Save correction revision").click();
  await expect(button(page, "Revise correction")).toBeFocused();
  await button(page, "Approve correction version").click();
  await expect(page.getByText(/Approval stale/).first()).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await button(page, "Approve mapping version").click();
  await completeRun(page);
  await go(page, "Review");
  const comparison = page.getByRole("region", { name: "Rerun comparison" });
  await expect(comparison).toContainText("Resolved: DEMO_PHONE_LENGTH");
  await expect(comparison).toContainText("New: DEMO_HOURS_REVIEW");
  await expect(comparison).toContainText("Uncertain matches");
  await expect(
    page.getByLabel("Report version").locator("option:not([disabled])"),
  ).toHaveCount(2);
  await page.getByLabel("Report version").selectOption("demo-run-1");
  await expect(
    page.getByRole("button", { name: /DEMO_PHONE_LENGTH/ }),
  ).toBeVisible();
  await page.getByLabel("Report version").selectOption("demo-run-2");
  await go(page, "Export");
  await capture(page, info, "export");
  const downloadEvent = page.waitForEvent("download");
  await button(page, "Download simulated report").click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("demo-run-2-synthetic-report.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const artifact = JSON.parse(Buffer.concat(chunks).toString());
  expect(artifact.simulated).toBe(true);
  expect(artifact.run.id).toBe("demo-run-2");
  expect(artifact.run.parentRunId).toBe("demo-run-1");
  expect(artifact.run.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "HSDS schema", status: "not run" }),
    ]),
  );
  await button(page, "Simulate artifact expiry").click();
  await expect(button(page, "Download simulated report")).toBeDisabled();
  await expect(
    page.getByText(/Download unavailable: artifact expired/),
  ).toBeVisible();
  await go(page, "Source");
  await expect(
    page.getByRole("region", { name: "Source preview table" }),
  ).toContainText("201-555-01");
});

test("synthetic mode stays local and discards source and approvals on reload", async ({
  page,
}) => {
  const serviceRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin !== "http://127.0.0.1:5173" ||
      /\/(health|transform)(\/|$)/.test(url.pathname)
    )
      serviceRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
  });
  await approvedWorkspace(page);
  await completeRun(page);
  await scenario(page, "model-timeout");
  await go(page, "Review");
  await expect(
    page.getByRole("button", { name: /DEMO_PHONE_LENGTH/ }),
  ).toBeVisible();
  await scenario(page, "model-malformed");
  await expect(
    page.getByRole("button", { name: /DEMO_PHONE_LENGTH/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  await page.reload();
  await go(page, "Source");
  await expect(button(page, "Load synthetic sample")).toBeEnabled();
  await go(page, "Run");
  await expect(runButton(page)).toBeDisabled();
  expect(serviceRequests).toEqual([]);
});

test("workflow history and keyboard focus remain navigable without false approval", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Bring your data into focus",
      exact: true,
    }),
  ).toBeFocused();
  await button(page, "Load synthetic sample").focus();
  await page.keyboard.press("Enter");
  await button(page, "Inspect source").focus();
  await page.keyboard.press("Enter");
  await nav(page, "Mapping").focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Review & approve", exact: true }),
  ).toBeFocused();
  await go(page, "Run");
  await page.goBack();
  await expect(nav(page, "Mapping")).toHaveAttribute("aria-current", "step");
  await page.goForward();
  await expect(nav(page, "Run")).toHaveAttribute("aria-current", "step");
  await expect(runButton(page)).toBeDisabled();
  await button(page, "Workflow help").focus();
  await page.keyboard.press("Enter");
  await button(page, "Close help").focus();
  await page.keyboard.press("Enter");
  await expect(button(page, "Workflow help")).toBeFocused();
  await go(page, "Mapping");
  await button(page, "Revise organization").focus();
  await page.keyboard.press("Enter");
  await expect(
    mapping(page, "organization").getByLabel(
      "Full target paths (one per line)",
    ),
  ).toBeFocused();
  await button(page, "Cancel revision").focus();
  await page.keyboard.press("Enter");
  await expect(button(page, "Revise organization")).toBeFocused();
});

test("source and target changes invalidate approval and conflicts cannot create a run", async ({
  page,
}) => {
  await approvedWorkspace(page);
  await controls(page);
  await button(page, "Simulate target contract change").click();
  await expect(runButton(page)).toBeDisabled();
  for (const id of ["organization", "service", "phone", "locations"])
    await button(page, `Approve ${id}`).click();
  await scenario(page, "conflict");
  await button(page, "Approve mapping version").click();
  await expect(
    page.getByRole("status").filter({ hasText: "Simulated version conflict" }),
  ).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await scenario(page, "normal");
  await button(page, "Approve mapping version").click();
  await expect(runButton(page)).toBeEnabled();
  await scenario(page, "conflict");
  await runButton(page).click();
  await expect(
    page.getByRole("status").filter({ hasText: "No run was started" }),
  ).toBeVisible();
  await expect(button(page, "Advance simulated stage")).toHaveCount(0);
  await scenario(page, "normal");
  await button(page, "Approve mapping version").click();
  await button(page, "Simulate source version change").click();
  await expect(runButton(page)).toBeDisabled();
  await go(page, "Source");
  await expect(button(page, "Inspect source")).toBeEnabled();
});

test("interrupted and cancelled requests distinguish unknown, requested and acknowledged states", async ({
  page,
}) => {
  await approvedWorkspace(page);
  await runButton(page).click();
  await button(page, "Simulate disconnection").click();
  await expect(page.getByText(/^\s*[·✓!]\s*unknown\s*$/)).toBeVisible();
  await button(page, "Reconnect").click();
  await expect(
    page.getByRole("status").filter({ hasText: "still status unknown" }),
  ).toBeVisible();
  await expect(button(page, "Advance simulated stage")).toHaveCount(0);
  await runButton(page).click();
  await button(page, "Request cancellation").click();
  await expect(
    page.getByText(/^\s*[·✓!]\s*cancel requested\s*$/),
  ).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await button(page, "Simulate cancellation acknowledgement").click();
  await expect(page.getByText(/^\s*[·✓!]\s*cancelled\s*$/)).toBeVisible();
  await expect(button(page, "Advance simulated stage")).toHaveCount(0);
});

test("partial output and system failure have different report and artifact consequences", async ({
  page,
}) => {
  await approvedWorkspace(page);
  await scenario(page, "partial");
  await completeRun(page);
  await go(page, "Review");
  await expect(
    page.getByRole("button", { name: /DEMO_PHONE_LENGTH/ }),
  ).toBeVisible();
  await go(page, "Export");
  await expect(button(page, "Download simulated report")).toBeDisabled();
  await expect(page.getByText(/^\s*[·✓!]\s*partial\s*$/)).toBeVisible();
  await scenario(page, "system-failure");
  await completeRun(page);
  await go(page, "Review");
  await expect(
    page
      .getByText("System failure prevented checks.", { exact: false })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /DEMO_PHONE_LENGTH/ }),
  ).toHaveCount(0);
  await go(page, "Export");
  await expect(button(page, "Download simulated report")).toBeDisabled();
});

test("all five steps and real ZIP mode pass automated accessibility and narrow reflow checks", async ({
  page,
}, info) => {
  await approvedWorkspace(page);
  await completeRun(page);
  const originalViewport = page.viewportSize()!;
  for (const step of ["Source", "Mapping", "Run", "Review", "Export"]) {
    await page.setViewportSize(originalViewport);
    await go(page, step);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(result.violations, `${step} accessibility violations`).toEqual([]);
    await page.setViewportSize({ width: 320, height: 900 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      `${step} body overflow at 320px`,
    ).toBe(true);
  }
  await page.setViewportSize(originalViewport);
  await page.emulateMedia({ colorScheme: "dark" });
  await go(page, "Review");
  await capture(page, info, "dark-review");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 320, height: 900 });
  await capture(page, info, "narrow-dark-review");
  await page.route("**/health", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page
    .getByRole("radio", { name: "Real ZIP integration", exact: true })
    .check();
  const real = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(real.violations, "Real ZIP accessibility violations").toEqual([]);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

function syntheticZip(name = "source.csv") {
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
      body: syntheticZip(),
    });
  });
  await page.goto("/");
  await page
    .getByRole("radio", { name: "Real ZIP integration", exact: true })
    .check();
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
    buffer: syntheticZip("../source.csv"),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Unsafe archive" }),
  ).toBeVisible();
  expect(posts).toBe(0);
  await input.setInputFiles({
    name: "synthetic.zip",
    mimeType: "application/zip",
    buffer: syntheticZip(),
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
  await page
    .getByRole("radio", { name: "Real ZIP integration", exact: true })
    .check();
  await page.getByLabel("Browse ZIP or drop it in this section").setInputFiles({
    name: "synthetic.zip",
    mimeType: "application/zip",
    buffer: syntheticZip(),
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
        body: syntheticZip(),
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
  await expect(target).toBeAttached();
  for (let index = 0; index < 160; index++) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error(
    "A core control was not reachable through the keyboard tab order.",
  );
}
async function keyboardActivate(page: Page, target: Locator) {
  await tabTo(page, target);
  await page.keyboard.press("Enter");
}

test("keyboard-only core journey uses Tab, Enter and typed clarification through report download", async ({
  page,
}) => {
  await page.goto("/");
  await keyboardActivate(page, button(page, "Load synthetic sample"));
  await keyboardActivate(page, button(page, "Inspect source"));
  await keyboardActivate(page, nav(page, "Mapping"));
  await expect(
    page.getByRole("heading", { name: "Review & approve", exact: true }),
  ).toBeFocused();
  await keyboardActivate(page, button(page, "Approve organization"));
  await keyboardActivate(page, button(page, "Approve service"));
  await tabTo(page, page.getByLabel("Clarification answer", { exact: true }));
  await page.keyboard.type("Authored synthetic public service contact.");
  await keyboardActivate(page, button(page, "Save clarification"));
  await expect(button(page, "Approve mapping version")).toBeDisabled();
  await keyboardActivate(page, button(page, "Approve phone"));
  await keyboardActivate(page, button(page, "Revise locations"));
  await expect(
    mapping(page, "locations").getByLabel("Full target paths (one per line)"),
  ).toBeFocused();
  await keyboardActivate(
    page,
    mapping(page, "locations").getByRole("button", {
      name: "Save mapping revision",
      exact: true,
    }),
  );
  await expect(button(page, "Revise locations")).toBeFocused();
  await keyboardActivate(page, button(page, "Approve locations"));
  await keyboardActivate(page, button(page, "Approve mapping version"));
  await keyboardActivate(page, runButton(page));
  for (let index = 0; index < 4; index++)
    await keyboardActivate(page, button(page, "Advance simulated stage"));
  await keyboardActivate(page, nav(page, "Review"));
  await keyboardActivate(
    page,
    page.getByRole("button", { name: /DEMO_PHONE_LENGTH/ }),
  );
  await expect(
    page.getByRole("region", { name: "Selected diagnostic evidence" }),
  ).toContainText("phone.number");
  await keyboardActivate(page, nav(page, "Export"));
  const downloadEvent = page.waitForEvent("download");
  await keyboardActivate(page, button(page, "Download simulated report"));
  expect((await downloadEvent).suggestedFilename()).toBe(
    "demo-run-1-synthetic-report.json",
  );
});
