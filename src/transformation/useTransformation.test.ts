import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTransformation } from "./useTransformation";
import { prepareInput, rebuildInput } from "./input";
import { transformZip } from "../integration/adapter";
import { previewJsonOutput } from "../integration/jsonOutput";
import type { PreparedInput } from "./model";

vi.mock("./input", () => ({ prepareInput: vi.fn(), rebuildInput: vi.fn() }));
vi.mock("../integration/adapter", async (original) => ({
  ...(await original<typeof import("../integration/adapter")>()),
  transformZip: vi.fn(),
}));
vi.mock("../integration/jsonOutput", () => ({ previewJsonOutput: vi.fn() }));
function fixture(name = "Original") {
  const source = new File(["source"], "orgs.json");
  const mapping = new File(["mapping"], "orgs_organization_mapping.json");
  return {
    name: "orgs.json",
    format: "json",
    archive: new File(["zip"], "input.zip"),
    files: [
      {
        name: source.name,
        file: source,
        text: JSON.stringify([{ ID: "1", Name: name }]),
      },
      {
        name: mapping.name,
        file: mapping,
        text: '{"mappings":[{"input_path":"Name","output_path":"name"}]}',
      },
    ],
    warnings: [],
  } satisfies PreparedInput;
}
beforeEach(() => {
  vi.mocked(prepareInput).mockResolvedValue(fixture());
  vi.mocked(transformZip).mockResolvedValue({
    blob: new Blob(["output"]),
    logs: null,
  });
  vi.mocked(previewJsonOutput).mockResolvedValue([
    { name: "organization_1.json", text: '{"name":"Original"}' },
  ]);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:test-output");
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function ready() {
  const hook = renderHook(() => useTransformation());
  await act(async () => {
    await hook.result.current.inspect([new File(["selected"], "input.zip")]);
  });
  act(() => hook.result.current.approvePending());
  act(() => hook.result.current.approve());
  expect(hook.result.current.canRun).toBe(true);
  return hook;
}
describe("continuous real transformation lifecycle", () => {
  it("separates review from run and invalidates approval for edits, questions and removed files", async () => {
    const { result } = await ready();
    expect(transformZip).not.toHaveBeenCalled();
    act(() => result.current.decide(result.current.rows[0].id, "unresolved"));
    act(() => result.current.approvePending());
    expect(result.current.blocked).toBe(true);
    act(() => result.current.decide(result.current.rows[0].id, "pending"));
    expect(result.current.approved).toBe(false);
    act(() => result.current.approvePending());
    act(() => result.current.approve());
    act(() => result.current.setSourceEditing(true));
    expect(result.current.canRun).toBe(false);
    act(() => result.current.setSourceEditing(false));
    expect(result.current.approved).toBe(false);
    act(() => result.current.removeFile(0));
    expect(result.current.input).toBeNull();
    expect(result.current.rows).toHaveLength(0);
    await act(async () => {
      await result.current.run();
    });
    expect(transformZip).not.toHaveBeenCalled();
  });
  it("suppresses repeated clicks and late completion after stop, and permits an explicit fresh attempt", async () => {
    let resolve: ((value: { blob: Blob; logs: null }) => void) | undefined;
    vi.mocked(transformZip).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { result } = await ready();
    act(() => {
      void result.current.run();
      void result.current.run();
    });
    expect(transformZip).toHaveBeenCalledTimes(1);
    act(() => result.current.stop());
    expect(result.current.runs[0].phase).toBe("unknown");
    await act(async () => {
      resolve?.({ blob: new Blob(["late"]), logs: null });
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.runs.map((run) => run.phase)).toEqual([
      "unknown",
      "complete",
    ]);
    expect(result.current.runs[1].id).not.toBe(result.current.runs[0].id);
  });
  it("retains earlier input snapshots when corrected source versions are approved and rerun", async () => {
    const { result } = await ready();
    await act(async () => {
      await result.current.run();
    });
    const earlier = result.current.runs[0];
    vi.mocked(prepareInput).mockResolvedValue(fixture("Corrected"));
    await act(async () => {
      await result.current.saveSource(
        "orgs.json",
        '[{"ID":"1","Name":"Corrected"}]',
        "Correct the supplied name",
      );
    });
    expect(result.current.sourceVersion).toBe(2);
    expect(result.current.approved).toBe(false);
    expect(result.current.runs[0]).toBe(earlier);
    expect(earlier.inputSnapshot.files[0].text).toContain("Original");
    expect(result.current.draftFiles).toEqual(
      result.current.input!.files.map((file) => file.file),
    );
    act(() => result.current.approvePending());
    act(() => result.current.approve());
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.runs[1].receipt.sourceVersion).toBe(2);
    expect(result.current.runs[1].inputSnapshot.files[0].text).toContain(
      "Corrected",
    );
  });
  it("retains revised mapping bytes when returning to intake and makes earlier approval stale", async () => {
    const { result } = await ready();
    const revised = fixture();
    revised.files[1] = {
      ...revised.files[1],
      text: '{"mappings":[{"input_path":"Name","output_path":"description"}]}',
      file: new File(["revised"], "orgs_organization_mapping.json"),
    };
    vi.mocked(rebuildInput).mockResolvedValue(revised);
    await act(async () => {
      await result.current.saveMapping(
        revised.files[1].name,
        revised.files[1].text!,
        "Correct target",
      );
    });
    expect(result.current.mappingVersion).toBe(2);
    expect(result.current.approved).toBe(false);
    expect(result.current.draftFiles[1]).toBe(revised.files[1].file);
    expect(result.current.changes[0].before).toContain('"name"');
  });
  it("keeps a complete response distinct from local artifact expiry", async () => {
    const { result } = await ready();
    vi.useFakeTimers();
    await act(async () => {
      await result.current.run();
    });
    await act(async () => {
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    });
    expect(result.current.runs[0].phase).toBe("complete");
    expect(result.current.runs[0].url).toBeUndefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-output");
    expect(result.current.runs[0].message).toContain("expired");
  });
  it("reset or unmount aborts work and prevents stale inspection/results from returning", async () => {
    let finish: ((value: PreparedInput) => void) | undefined;
    vi.mocked(prepareInput).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result, unmount } = renderHook(() => useTransformation());
    act(() => {
      void result.current.inspect([new File(["zip"], "input.zip")]);
    });
    act(() => result.current.reset());
    await act(async () => {
      finish?.(fixture());
    });
    expect(result.current.input).toBeNull();
    await act(async () => {
      await result.current.inspect([new File(["zip"], "input.zip")]);
    });
    act(() => result.current.approvePending());
    act(() => result.current.approve());
    await act(async () => {
      await result.current.run();
    });
    await waitFor(() => expect(result.current.runs[0].phase).toBe("complete"));
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-output");
  });
});
