// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RealZipFlow from "./RealZipFlow";
import { checkHealth, transformZip, TransformError } from "./adapter";
import { inspectZip } from "./zip";

vi.mock("./adapter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./adapter")>()),
  checkHealth: vi.fn(),
  transformZip: vi.fn(),
}));
vi.mock("./zip", () => ({ inspectZip: vi.fn() }));

beforeEach(() => {
  vi.mocked(checkHealth).mockResolvedValue(true);
  vi.mocked(inspectZip).mockResolvedValue({
    entries: [{ name: "source.csv", expandedBytes: 1 }],
    expandedBytes: 1,
  });
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:synthetic-artifact");
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function select() {
  fireEvent.change(
    screen.getByLabelText("Browse ZIP or drop it in this section"),
    { target: { files: [new File(["synthetic"], "source.zip")] } },
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Upload ZIP and transform" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
}

describe("real ZIP request lifecycle", () => {
  it("inspects before explicit upload; rejects repeated submit and preserves honest validation labels", async () => {
    let finish: (value: { blob: Blob; logs: null }) => void = () => undefined;
    vi.mocked(transformZip).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<RealZipFlow />);
    await select();
    expect(transformZip).not.toHaveBeenCalled();
    const button = screen.getByRole("button", {
      name: "Upload ZIP and transform",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(transformZip).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Request in flight:/)).toBeTruthy();
    finish({ blob: new Blob(["synthetic"]), logs: null });
    await screen.findByRole("link", { name: "Download transformed ZIP" });
    expect(screen.getByText(/This is not proof of HSDS validity/)).toBeTruthy();
    expect(
      screen.getByText(/backend run\/version\/contract: unavailable/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-artifact");
    expect(
      screen.queryByRole("link", { name: "Download transformed ZIP" }),
    ).toBeNull();
  });

  it("stopping the browser request shows requested, never acknowledged server cancellation", async () => {
    vi.mocked(transformZip).mockImplementation(
      (_file, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () =>
            reject(new TransformError("Server status unknown", "unknown")),
          ),
        ),
    );
    render(<RealZipFlow />);
    await select();
    fireEvent.click(
      screen.getByRole("button", { name: "Upload ZIP and transform" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Stop waiting (request cancellation)",
      }),
    );
    await screen.findByText(/Server cancellation is not acknowledged/);
    await screen.findByText(/Check with the backend operator before retrying/);
    expect(transformZip).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("does not show stale request completion after leaving real mode", async () => {
    let finish: (value: { blob: Blob; logs: null }) => void = () => undefined;
    vi.mocked(transformZip).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const mounted = render(<RealZipFlow />);
    await select();
    fireEvent.click(
      screen.getByRole("button", { name: "Upload ZIP and transform" }),
    );
    mounted.unmount();
    finish({ blob: new Blob(["synthetic"]), logs: null });
    await Promise.resolve();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("leaves malformed selection unusable, with no POST", async () => {
    vi.mocked(inspectZip).mockRejectedValue(
      new Error("Malformed synthetic ZIP"),
    );
    render(<RealZipFlow />);
    fireEvent.change(
      screen.getByLabelText("Browse ZIP or drop it in this section"),
      { target: { files: [new File(["bad"], "bad.zip")] } },
    );
    await screen.findByText(/Malformed synthetic ZIP/);
    expect(
      screen
        .getByRole("button", { name: "Upload ZIP and transform" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(transformZip).not.toHaveBeenCalled();
  });
});

it("never publishes late completion after the user stops waiting", async () => {
  let finish: (value: { blob: Blob; logs: null }) => void = () => undefined;
  vi.mocked(transformZip).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<RealZipFlow />);
  await select();
  fireEvent.click(
    screen.getByRole("button", { name: "Upload ZIP and transform" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Stop waiting (request cancellation)" }),
  );
  finish({ blob: new Blob(["synthetic"]), logs: null });
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: "Download transformed ZIP" }),
    ).toBeNull(),
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(screen.getByText(/status unknown|status is unknown/i)).toBeTruthy();
});

it("a browser timeout becomes unknown immediately and ignores later success", async () => {
  let finish: (value: { blob: Blob; logs: null }) => void = () => undefined;
  vi.mocked(transformZip).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<RealZipFlow />);
  await select();
  vi.useFakeTimers();
  fireEvent.click(
    screen.getByRole("button", { name: "Upload ZIP and transform" }),
  );
  act(() => vi.advanceTimersByTime(120000));
  expect(screen.getByText(/Request stopped or timed out/)).toBeTruthy();
  await act(async () => {
    finish({ blob: new Blob(["synthetic"]), logs: null });
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("link", { name: "Download transformed ZIP" }),
  ).toBeNull();
});
