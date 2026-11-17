import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewScreen } from "../screens";
import { Output } from "../ui";
import App from "../App";
import { fireEvent, render, screen } from "@testing-library/react";
import { baseFindings } from "./fixtures";
import {
  canApprove,
  compareFindings,
  initialState,
  isApprovalCurrent,
  isCorrectionCurrent,
  reducer,
} from "./reducer";
import type { WorkflowAction, WorkflowState } from "./model";

const act = (state: WorkflowState, ...actions: WorkflowAction[]) =>
  actions.reduce(reducer, state);
function reviewed(): WorkflowState {
  let state = act(
    initialState,
    { type: "LOAD_SOURCE" },
    { type: "INSPECT_SOURCE" },
  );
  state = act(
    state,
    {
      type: "CLARIFY",
      id: "phone",
      answer: "Public service contact, verified in this synthetic fixture",
    },
    { type: "REJECT_MAPPING", id: "service" },
    {
      type: "REVISE_MAPPING",
      id: "service",
      targetPaths: ["service.name"],
      transformation: "Copy text",
    },
    {
      type: "REVISE_MAPPING",
      id: "locations",
      targetPaths: [
        "service_at_location.location_id",
        "service_at_location.service_id",
      ],
      transformation: "Split semicolon list; preserve source links",
    },
  );
  for (const row of state.mappings.filter(
    (entry) => entry.decision === "proposed",
  ))
    state = reducer(state, { type: "APPROVE_ROW", id: row.id });
  return state;
}
function approved(): WorkflowState {
  return reducer(reviewed(), { type: "APPROVE_MAPPING" });
}
function finished(state = approved()): WorkflowState {
  state = reducer(state, { type: "START_RUN" });
  const runId = state.activeRunId!;
  for (let index = 0; index < 4; index += 1)
    state = reducer(state, { type: "ADVANCE_RUN", runId });
  return state;
}
const run = (state: WorkflowState) =>
  state.runs.find((entry) => entry.id === state.activeRunId)!;

describe("synthetic source and explicit versioned mapping review", () => {
  it("distinguishes selection, inspection and approval without uploads or persisted data", () => {
    expect(initialState.source).toBeNull();
    const selected = reducer(initialState, { type: "LOAD_SOURCE" });
    expect(selected.source?.inspected).toBe(false);
    expect(canApprove(selected)).toBe(false);
    expect(reducer(selected, { type: "LOAD_SOURCE" })).toBe(selected);
    const inspected = reducer(selected, { type: "INSPECT_SOURCE" });
    expect(inspected.source?.rows).toHaveLength(3);
    expect(canApprove(inspected)).toBe(false);
    expect(inspected.source?.rows[2].notes).toBe(
      "<script>also plain text</script>",
    );
    expect(reducer(inspected, { type: "RESET" }).source).toBeNull();
  });

  it("keeps clarification distinct from approval and preserves one-to-many paths", () => {
    const state = act(
      initialState,
      { type: "LOAD_SOURCE" },
      { type: "INSPECT_SOURCE" },
      { type: "CLARIFY", id: "phone", answer: "Public contact" },
    );
    expect(state.mappings.find((row) => row.id === "phone")).toMatchObject({
      decision: "proposed",
      answer: "Public contact",
    });
    expect(state.approval).toBeNull();
    expect(state.mappings[0].targetPaths).toEqual([
      "organization.name",
      "service.organization_id",
    ]);
    expect(canApprove(state)).toBe(false);
  });

  it("blocks unresolved, unsupported and rejected proposals until reviewed", () => {
    let state = act(
      initialState,
      { type: "LOAD_SOURCE" },
      { type: "INSPECT_SOURCE" },
    );
    state = act(
      state,
      { type: "APPROVE_ROW", id: "phone" },
      { type: "APPROVE_ROW", id: "locations" },
      { type: "APPROVE_MAPPING" },
      { type: "START_RUN" },
    );
    expect(state.runs).toHaveLength(0);
    expect(state.mappings.find((row) => row.id === "phone")?.decision).toBe(
      "unresolved",
    );
    expect(state.mappings.find((row) => row.id === "locations")?.decision).toBe(
      "unsupported",
    );
    state = reducer(state, { type: "REJECT_MAPPING", id: "service" });
    state = reducer(state, { type: "APPROVE_ROW", id: "service" });
    expect(state.mappings.find((row) => row.id === "service")?.decision).toBe(
      "rejected",
    );
  });

  it("accepts an intentional unmapped decision without executing transforms", () => {
    const state = reducer(reviewed(), { type: "MARK_UNMAPPED", id: "service" });
    expect(state.mappings.find((row) => row.id === "service")).toMatchObject({
      decision: "unmapped",
      targetPaths: [],
    });
    expect(canApprove(state)).toBe(true);
    const unsafe = reducer(state, {
      type: "REVISE_MAPPING",
      id: "service",
      targetPaths: ["service.name"],
      transformation: "eval(source)",
    });
    expect(unsafe.mappingVersion).toBe(state.mappingVersion);
    expect(unsafe.notice).toContain("unsupported");
  });

  it("binds approval to inspected source, mapping and target versions", () => {
    const state = approved();
    expect(isApprovalCurrent(state)).toBe(true);
    expect(state.approval).toEqual({
      sourceId: state.source?.id,
      sourceVersion: 1,
      mappingVersion: state.mappingVersion,
      contractVersion: state.contractVersion,
    });
    const revised = reducer(state, { type: "REJECT_MAPPING", id: "service" });
    expect(isApprovalCurrent(revised)).toBe(false);
    expect(revised.approval).toEqual(state.approval);
    const freshSource = reducer(state, { type: "CHANGE_SOURCE" });
    expect(isApprovalCurrent(freshSource)).toBe(false);
    expect(freshSource.source?.inspected).toBe(false);
    expect(
      freshSource.mappings.find((row) => row.id === "phone")?.answer,
    ).toBeUndefined();
    expect(isApprovalCurrent(reducer(state, { type: "CHANGE_CONTRACT" }))).toBe(
      false,
    );
    expect(
      isApprovalCurrent(
        act(state, { type: "CHANGE_CONTRACT" }, { type: "CHANGE_CONTRACT" }),
      ),
    ).toBe(false);
  });

  it("does not duplicate approval or run submission on repeated clicks", () => {
    const state = approved();
    expect(reducer(state, { type: "APPROVE_MAPPING" })).toBe(state);
    const started = reducer(state, { type: "START_RUN" });
    expect(reducer(started, { type: "START_RUN" })).toBe(started);
    expect(started.runs).toHaveLength(1);
    expect(
      reducer(started, { type: "REJECT_MAPPING", id: "service" })
        .mappingVersion,
    ).toBe(started.mappingVersion);
  });

  it("requires a nonblank clarification and supported full target paths", () => {
    const state = act(
      initialState,
      { type: "LOAD_SOURCE" },
      { type: "INSPECT_SOURCE" },
    );
    expect(
      reducer(state, { type: "CLARIFY", id: "phone", answer: " " }).mappings,
    ).toEqual(state.mappings);
    for (const target of [
      "name",
      "service/name",
      "service-name",
      "service<script>name",
    ]) {
      expect(
        reducer(state, {
          type: "REVISE_MAPPING",
          id: "service",
          targetPaths: [target],
          transformation: "Copy text",
        }).mappingVersion,
      ).toBe(state.mappingVersion);
    }
  });
});

describe("request state and deterministic reports", () => {
  it("advances fixture stages and distinguishes transformation from real validity", () => {
    let state = approved();
    expect(state.runs).toHaveLength(0);
    state = reducer(state, { type: "START_RUN" });
    expect(run(state).status).toBe("running");
    expect(run(state).checks[0].status).toBe("not run");
    state = reducer(state, { type: "ADVANCE_RUN", runId: state.activeRunId! });
    expect(run(state).stage).toBe(1);
    for (let index = 0; index < 3; index += 1)
      state = reducer(state, {
        type: "ADVANCE_RUN",
        runId: state.activeRunId!,
      });
    expect(run(state).status).toBe("completed");
    expect(run(state).checks.map((check) => check.status)).toEqual([
      "failed",
      "not run",
      "unavailable",
      "not run",
    ]);
    expect(run(state).findings[0]).toMatchObject({
      code: "DEMO_PHONE_LENGTH",
      sourceFile: "services.csv",
      sourceRow: 2,
      sourceField: "phone",
      targetPath: "phone.number",
    });
    expect(
      run(state).findings.find((finding) => finding.id === "missing-provenance")
        ?.evidence,
    ).toBeUndefined();
    expect(run(state).counts).toEqual({
      source: 3,
      transformed: 3,
      filtered: 0,
      rejected: 0,
      emitted: 3,
      unprocessed: 0,
    });
  });

  it("ignores stale stage callbacks from an earlier run", () => {
    const first = finished();
    const second = reducer(first, { type: "START_RUN" });
    expect(
      reducer(second, { type: "ADVANCE_RUN", runId: first.activeRunId! }),
    ).toBe(second);
  });

  it("retains deterministic evidence and answers across model failure and retry", () => {
    const complete = finished();
    for (const scenario of ["model-timeout", "model-malformed"] as const) {
      const state = reducer(complete, { type: "SET_SCENARIO", scenario });
      expect(state.runs).toBe(complete.runs);
      expect(state.mappings).toBe(complete.mappings);
      expect(state.modelStatus).toBe(
        scenario === "model-timeout" ? "timeout" : "malformed",
      );
      expect(
        reducer(state, { type: "SET_SCENARIO", scenario: "normal" })
          .modelStatus,
      ).toBe("available");
    }
  });

  it("keeps interrupted status unknown through reconnect without claiming recovery", () => {
    let state = act(
      approved(),
      { type: "START_RUN" },
      { type: "INTERRUPT_RUN" },
    );
    const unknownRun = run(state);
    expect(unknownRun.status).toBe("unknown");
    state = reducer(state, { type: "RECONNECT" });
    expect(run(state)).toBe(unknownRun);
    expect(state.notice).toContain("still status unknown");
    expect(reducer(state, { type: "ADVANCE_RUN" })).toBe(state);
  });

  it("separates cancellation request from acknowledgement", () => {
    let state = act(
      approved(),
      { type: "START_RUN" },
      { type: "REQUEST_CANCEL" },
    );
    expect(run(state).status).toBe("cancel requested");
    expect(reducer(state, { type: "ADVANCE_RUN" })).toBe(state);
    expect(reducer(state, { type: "REQUEST_CANCEL" })).toBe(state);
    state = reducer(state, { type: "ACKNOWLEDGE_CANCEL" });
    expect(run(state).status).toBe("cancelled");
    expect(run(state).artifact).toBe("unavailable");
    expect(state.notice).toContain("fixture only");
  });

  it("retains partial reports but withholds complete output artifacts", () => {
    const state = finished(
      reducer(approved(), { type: "SET_SCENARIO", scenario: "partial" }),
    );
    expect(run(state).status).toBe("partial");
    expect(run(state).findings.length).toBeGreaterThan(0);
    expect(run(state).counts.unprocessed).toBe(1);
    expect(run(state).artifact).toBe("unavailable");
  });

  it("separates system failure from invalid data and retries as a fresh run", () => {
    const failed = finished(
      reducer(approved(), { type: "SET_SCENARIO", scenario: "system-failure" }),
    );
    expect(run(failed).status).toBe("failed");
    expect(run(failed).findings).toEqual([]);
    expect(
      run(failed).checks.every((check) => check.status === "not run"),
    ).toBe(true);
    const retry = finished(
      reducer(failed, { type: "SET_SCENARIO", scenario: "normal" }),
    );
    expect(run(retry).status).toBe("completed");
    expect(retry.runs).toHaveLength(2);
    expect(retry.runs[0]).toEqual(run(failed));
  });

  it("freezes scenario on each run rather than changing an active result", () => {
    let state = act(
      approved(),
      { type: "START_RUN" },
      { type: "SET_SCENARIO", scenario: "system-failure" },
    );
    for (let index = 0; index < 4; index += 1)
      state = reducer(state, { type: "ADVANCE_RUN" });
    expect(run(state).status).toBe("completed");
  });

  it("blocks simulated conflicts without creating a false approval or run", () => {
    const state = reducer(reviewed(), {
      type: "SET_SCENARIO",
      scenario: "conflict",
    });
    const conflict = reducer(state, { type: "APPROVE_MAPPING" });
    expect(conflict.approval).toBeNull();
    const startedConflict = act(
      approved(),
      { type: "SET_SCENARIO", scenario: "conflict" },
      { type: "START_RUN" },
    );
    expect(startedConflict.runs).toHaveLength(0);
    expect(isApprovalCurrent(startedConflict)).toBe(false);
  });

  it("expires downloads without erasing report provenance", () => {
    const state = finished();
    const expired = reducer(state, { type: "EXPIRE_ARTIFACT" });
    expect(run(expired).artifact).toBe("expired");
    expect(run(expired).findings).toBe(run(state).findings);
    expect(run(expired).mappingVersion).toBe(run(state).mappingVersion);
  });
});

describe("reviewed correction, rerun and comparison", () => {
  it("preserves source and earlier reports across rejection, revision, approval and rerun", () => {
    const first = finished();
    const sourceSnapshot = JSON.stringify(first.source);
    const reportSnapshot = JSON.stringify(first.runs[0]);
    const rejected = reducer(first, { type: "REJECT_CORRECTION" });
    expect(rejected.mappingVersion).toBe(first.mappingVersion);
    expect(rejected.correction.decision).toBe("rejected");
    expect(
      reducer(rejected, { type: "APPROVE_CORRECTION" }).correction.decision,
    ).toBe("rejected");
    const revised = reducer(rejected, {
      type: "REVISE_CORRECTION",
      after: "201-555-0101",
      reason: "Verified against the synthetic fixture specification",
    });
    expect(revised.correction.version).toBe(2);
    let patched = reducer(revised, { type: "APPROVE_CORRECTION" });
    expect(patched.mappingVersion).toBe(first.mappingVersion + 1);
    expect(isApprovalCurrent(patched)).toBe(false);
    expect(reducer(patched, { type: "START_RUN" }).runs).toHaveLength(1);
    patched = reducer(patched, { type: "APPROVE_MAPPING" });
    const second = finished(patched);
    expect(second.runs).toHaveLength(2);
    expect(run(second).parentRunId).toBe(first.activeRunId);
    expect(run(second).correctionVersion).toBe(2);
    expect(JSON.stringify(second.source)).toBe(sourceSnapshot);
    expect(JSON.stringify(second.runs[0])).toBe(reportSnapshot);
    const comparison = compareFindings(
      first.runs[0].findings,
      run(second).findings,
    );
    expect(comparison.resolved.map((finding) => finding.id)).toEqual([
      "phone-length",
    ]);
    expect(comparison.remaining.map((finding) => finding.id)).toEqual([
      "reference-review",
    ]);
    expect(comparison.newFindings.map((finding) => finding.id)).toEqual([
      "new-review",
    ]);
    expect(
      comparison.uncertain.every(
        (finding) => finding.id === "missing-provenance",
      ),
    ).toBe(true);
  });

  it("does not consider correction approval evidence that the correction passed", () => {
    let state = act(
      finished(),
      {
        type: "REVISE_CORRECTION",
        after: "123",
        reason: "Deliberately invalid synthetic revision",
      },
      { type: "APPROVE_CORRECTION" },
      { type: "APPROVE_MAPPING" },
    );
    state = finished(state);
    expect(
      run(state).findings.some((finding) => finding.id === "phone-length"),
    ).toBe(true);
    expect(run(state).checks[0].status).toBe("failed");
  });

  it("blocks stale correction application and preserves original reports", () => {
    const first = finished();
    const changed = reducer(first, { type: "CHANGE_SOURCE" });
    expect(
      reducer(changed, { type: "APPROVE_CORRECTION" }).mappingVersion,
    ).toBe(changed.mappingVersion);
    expect(changed.runs).toBe(first.runs);
    const staleMapping = reducer(first, {
      type: "REJECT_MAPPING",
      id: "service",
    });
    expect(
      reducer(staleMapping, { type: "APPROVE_CORRECTION" }).correction.decision,
    ).toBe("proposed");
  });

  it("does not apply an approved patch after later mapping changes", () => {
    let state = act(finished(), { type: "APPROVE_CORRECTION" });
    expect(isCorrectionCurrent(state)).toBe(true);
    state = reducer(state, {
      type: "REVISE_MAPPING",
      id: "service",
      targetPaths: ["service.description"],
      transformation: "Copy text",
    });
    expect(isCorrectionCurrent(state)).toBe(false);
    state = act(
      state,
      { type: "APPROVE_ROW", id: "service" },
      { type: "APPROVE_MAPPING" },
    );
    state = finished(state);
    expect(run(state).correctionAfter).toBeUndefined();
    expect(
      run(state).findings.some((finding) => finding.id === "phone-length"),
    ).toBe(true);
  });

  it("never marks absent or duplicated stable identities as confidently resolved", () => {
    const unknown = baseFindings.filter((finding) => !finding.stableId);
    const comparison = compareFindings(unknown, []);
    expect(comparison.resolved).toHaveLength(0);
    expect(comparison.uncertain).toEqual(unknown);
    const duplicated = compareFindings(
      [baseFindings[0], { ...baseFindings[0], id: "duplicate" }],
      [],
    );
    expect(duplicated.resolved).toHaveLength(0);
    expect(duplicated.uncertain).toHaveLength(2);
  });

  it("keeps navigation separate from decisions, and reset removes all session state", () => {
    const state = finished();
    const navigated = act(
      state,
      { type: "NAVIGATE", step: "source" },
      { type: "NAVIGATE", step: "export" },
      { type: "NAVIGATE", step: "review" },
    );
    expect(navigated.approval).toBe(state.approval);
    expect(navigated.runs).toBe(state.runs);
    expect(reducer(navigated, { type: "RESET" })).toEqual(initialState);
  });
});

describe("integrated correctness regressions", () => {
  it("keeps the selected workflow step when the skip link targets the workspace", () => {
    const previousHash = window.location.hash;
    try {
      window.location.hash = "#mapping";
      render(createElement(App));
      expect(
        screen.getByRole("heading", { name: "Review & approve", level: 1 }),
      ).toBeInTheDocument();
      window.location.hash = "#workspace";
      fireEvent(window, new HashChangeEvent("hashchange"));
      expect(
        screen.getByRole("heading", { name: "Review & approve", level: 1 }),
      ).toBeInTheDocument();
    } finally {
      window.location.hash = previousHash;
    }
  });
  it("does not show a rejected mapping destination in a current approved sample", () => {
    const state = act(
      approved(),
      { type: "MARK_UNMAPPED", id: "service" },
      { type: "APPROVE_MAPPING" },
    );
    const html = renderToStaticMarkup(createElement(Output, { state }));
    const document = new DOMParser().parseFromString(html, "text/html");
    const sample = document.querySelector("pre")?.textContent;
    expect(sample).not.toContain('"name": "Food pantry"');
  });

  it("does not call earlier findings resolved when the new run failed before checks", () => {
    const state = finished(
      reducer(finished(), { type: "SET_SCENARIO", scenario: "system-failure" }),
    );
    const html = renderToStaticMarkup(
      createElement(ReviewScreen, { state, run: run(state), send: () => {} }),
    );
    expect(html).not.toContain("Resolved: ");
  });

  it("does not call earlier findings resolved when the new report is partial", () => {
    let state = act(
      finished(),
      { type: "APPROVE_CORRECTION" },
      { type: "APPROVE_MAPPING" },
      { type: "SET_SCENARIO", scenario: "partial" },
    );
    state = finished(state);
    const html = renderToStaticMarkup(
      createElement(ReviewScreen, { state, run: run(state), send: () => {} }),
    );
    expect(html).not.toContain("Resolved: ");
  });

  it("deduplicates repeated clarification submissions instead of creating extra versions", () => {
    const state = act(
      initialState,
      { type: "LOAD_SOURCE" },
      { type: "INSPECT_SOURCE" },
      { type: "CLARIFY", id: "phone", answer: "Public service contact" },
    );
    const repeated = reducer(state, {
      type: "CLARIFY",
      id: "phone",
      answer: "Public service contact",
    });
    expect(repeated.mappingVersion).toBe(state.mappingVersion);
  });

  it("deduplicates repeated correction revision submissions", () => {
    const state = reducer(finished(), {
      type: "REVISE_CORRECTION",
      after: "201-555-0101",
      reason: "Verified synthetic contact",
    });
    const repeated = reducer(state, {
      type: "REVISE_CORRECTION",
      after: "201-555-0101",
      reason: "Verified synthetic contact",
    });
    expect(repeated.correction.version).toBe(state.correction.version);
  });
});

it("keeps target entity aligned with revised full paths and intentional omission", () => {
  const state = act(
    initialState,
    { type: "LOAD_SOURCE" },
    { type: "INSPECT_SOURCE" },
  );
  const revised = reducer(state, {
    type: "REVISE_MAPPING",
    id: "phone",
    targetPaths: ["service.description"],
    transformation: "Copy text",
  });
  expect(revised.mappings.find((row) => row.id === "phone")?.entity).toBe(
    "service",
  );
  const omitted = reducer(state, { type: "MARK_UNMAPPED", id: "organization" });
  expect(
    omitted.mappings.find((row) => row.id === "organization")?.entity,
  ).toBe("None");
});
