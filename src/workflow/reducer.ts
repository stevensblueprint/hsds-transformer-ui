import {
  baseFindings,
  demoMappings,
  demoSource,
  initialCorrection,
  initialState,
  rerunNewFinding,
} from "./fixtures";
import type {
  Finding,
  FindingComparison,
  MappingRow,
  Run,
  WorkflowAction,
  WorkflowState,
} from "./model";

export { initialState } from "./fixtures";
export type { WorkflowAction, WorkflowState } from "./model";

export const supportedTransformations = [
  "Copy text",
  "Keep organization name; use reviewed source relation",
  "Split semicolon list; preserve source links",
] as const;

const supported = (value: string) =>
  supportedTransformations.some((entry) => entry === value);
const activeRun = (state: WorkflowState) =>
  state.runs.find((run) => run.id === state.activeRunId);
const inFlight = (state: WorkflowState) => {
  const status = activeRun(state)?.status;
  return status === "running" || status === "cancel requested";
};

export function isApprovalCurrent(state: WorkflowState): boolean {
  const { approval, source } = state;
  return (
    !!approval &&
    !!source &&
    source.inspected &&
    approval.sourceId === source.id &&
    approval.sourceVersion === source.version &&
    approval.mappingVersion === state.mappingVersion &&
    approval.contractVersion === state.contractVersion
  );
}

export function canApprove(state: WorkflowState): boolean {
  return (
    !!state.source?.inspected &&
    !inFlight(state) &&
    state.mappings.every(
      (row) => row.decision === "approved" || row.decision === "unmapped",
    )
  );
}

export function isCorrectionCurrent(state: WorkflowState): boolean {
  const approvedFor = state.correction.approvedFor;
  return (
    state.correction.decision === "approved" &&
    !!approvedFor &&
    approvedFor.sourceId === state.source?.id &&
    approvedFor.sourceVersion === state.source?.version &&
    approvedFor.mappingVersion === state.mappingVersion &&
    approvedFor.contractVersion === state.contractVersion
  );
}

/** Only explicit, unique stable identities establish resolved/remaining findings. */
export function compareFindings(
  previous: Finding[],
  current: Finding[],
): FindingComparison {
  const count = (list: Finding[], id: string) =>
    list.filter((finding) => finding.stableId === id).length;
  const reliable = (finding: Finding) =>
    !!finding.stableId &&
    count(previous, finding.stableId) <= 1 &&
    count(current, finding.stableId) <= 1;
  const oldIds = new Set(
    previous.filter(reliable).map((finding) => finding.stableId),
  );
  const newIds = new Set(
    current.filter(reliable).map((finding) => finding.stableId),
  );
  return {
    resolved: previous.filter(
      (finding) => reliable(finding) && !newIds.has(finding.stableId),
    ),
    remaining: current.filter(
      (finding) => reliable(finding) && oldIds.has(finding.stableId),
    ),
    newFindings: current.filter(
      (finding) => reliable(finding) && !oldIds.has(finding.stableId),
    ),
    uncertain: [...previous, ...current].filter(
      (finding) => !reliable(finding),
    ),
  };
}

function updateRow(
  state: WorkflowState,
  id: string,
  update: (row: MappingRow) => MappingRow,
  notice: string,
  revised = false,
): WorkflowState {
  if (!state.source?.inspected || inFlight(state))
    return {
      ...state,
      notice:
        "Inspect a source and finish the active request before changing mappings.",
    };
  if (!state.mappings.some((row) => row.id === id)) return state;
  return {
    ...state,
    mappings: state.mappings.map((row) => (row.id === id ? update(row) : row)),
    mappingVersion: state.mappingVersion + (revised ? 1 : 0),
    notice,
  };
}

function updateActiveRun(
  state: WorkflowState,
  update: (run: Run) => Run,
  notice: string,
): WorkflowState {
  return {
    ...state,
    runs: state.runs.map((run) =>
      run.id === state.activeRunId ? update(run) : run,
    ),
    notice,
  };
}

function finalizeRun(run: Run): Run {
  if (run.scenario === "system-failure") {
    return {
      ...run,
      status: "failed",
      artifact: "unavailable",
      checks: run.checks.map((check) => ({
        ...check,
        status: "not run",
        detail: "System failure prevented checks; no data-validity conclusion.",
      })),
    };
  }
  const corrected = run.correctionAfter?.replace(/[^0-9]/g, "").length === 10;
  const findings = corrected
    ? [
        ...baseFindings.filter((finding) => finding.id !== "phone-length"),
        rerunNewFinding,
      ]
    : [...baseFindings];
  const partial = run.scenario === "partial";
  return {
    ...run,
    status: partial ? "partial" : "completed",
    stage: run.stages.length,
    findings,
    artifact: partial ? "unavailable" : "available",
    checks: [
      {
        name: "Synthetic deterministic checks",
        status: findings.some((finding) => finding.severity === "error")
          ? "failed"
          : "passed",
        detail:
          "Only authored fixture rules ran. Warnings and unknown evidence remain reviewable.",
      },
      {
        name: "HSDS schema",
        status: "not run",
        detail:
          "No agreed HSDS release/profile or real validator is connected.",
      },
      {
        name: "Receiving API",
        status: "unavailable",
        detail: "No receiving interface has been contacted.",
      },
      {
        name: "Semantic accuracy",
        status: "not run",
        detail:
          "Requires domain review; transformation is not correctness evidence.",
      },
    ],
    counts: {
      source: 3,
      transformed: partial ? 2 : 3,
      filtered: 0,
      rejected: 0,
      emitted: partial ? 2 : 3,
      unprocessed: partial ? 1 : 0,
    },
  };
}

export function reducer(
  state: WorkflowState,
  action: WorkflowAction,
): WorkflowState {
  switch (action.type) {
    case "RESET":
      return initialState;
    case "LOAD_SOURCE":
      if (state.source) return state;
      return {
        ...state,
        source: {
          ...demoSource,
          rows: demoSource.rows.map((row) => ({ ...row })),
          files: [...demoSource.files],
        },
        notice:
          "Synthetic files selected in memory. Inspect them before reviewing mappings; nothing was uploaded.",
      };
    case "INSPECT_SOURCE":
      if (!state.source || state.source.inspected) return state;
      return {
        ...state,
        source: { ...state.source, inspected: true },
        notice:
          "Bounded synthetic sample inspected: 3 source records. This is not a full-file or HSDS validation.",
      };
    case "NAVIGATE":
      return { ...state, step: action.step };
    case "CLARIFY":
      if (
        state.mappings.some(
          (row) =>
            row.id === action.id &&
            row.answer === action.answer.trim().slice(0, 1000) &&
            row.decision !== "rejected",
        )
      )
        return state;
      if (!action.answer.trim())
        return {
          ...state,
          notice:
            "Enter an answer or leave this question unresolved. Answering does not approve the mapping.",
        };
      return updateRow(
        state,
        action.id,
        (row) => ({
          ...row,
          answer: action.answer.trim().slice(0, 1000),
          decision: "proposed",
        }),
        "Clarification saved as a proposal. Explicit row and mapping approval are still required.",
        true,
      );
    case "REJECT_MAPPING":
      if (
        state.mappings.find((row) => row.id === action.id)?.decision ===
        "rejected"
      )
        return state;
      return updateRow(
        state,
        action.id,
        (row) => ({ ...row, decision: "rejected" }),
        "Proposal rejected. Revise it or explicitly leave this field unmapped before approval.",
        true,
      );
    case "MARK_UNMAPPED":
      if (
        state.mappings.find((row) => row.id === action.id)?.decision ===
        "unmapped"
      )
        return state;
      return updateRow(
        state,
        action.id,
        (row) => ({
          ...row,
          decision: "unmapped",
          entity: "None",
          targetPaths: [],
          transformation: "Intentionally omit; retain original source",
        }),
        "Field intentionally unmapped. The original synthetic source remains intact.",
        true,
      );
    case "REVISE_MAPPING": {
      const paths = action.targetPaths
        .map((path) => path.trim())
        .filter(Boolean);
      if (
        !paths.length ||
        !paths.every((path) =>
          /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)+$/.test(path),
        ) ||
        !supported(action.transformation)
      ) {
        return {
          ...state,
          notice:
            "Choose supported demo transformations and full target paths. Executable transforms are unsupported.",
        };
      }
      const old = state.mappings.find((row) => row.id === action.id);
      if (
        old?.transformation === action.transformation &&
        old.targetPaths.join() === paths.join() &&
        old.decision === "proposed"
      )
        return state;
      return updateRow(
        state,
        action.id,
        (row) => ({
          ...row,
          targetPaths: [...new Set(paths)],
          entity: [...new Set(paths.map((path) => path.split(".")[0]))].join(
            " + ",
          ),
          transformation: action.transformation,
          decision:
            row.clarification && !row.answer ? "unresolved" : "proposed",
        }),
        "Mapping revised to a new version. Previous approval is stale; review and approve the revision explicitly.",
        true,
      );
    }
    case "APPROVE_ROW": {
      const row = state.mappings.find((entry) => entry.id === action.id);
      if (!row || row.decision === "approved") return state;
      if (
        row.decision !== "proposed" ||
        !supported(row.transformation) ||
        !row.targetPaths.length
      )
        return {
          ...state,
          notice: "Resolve or revise this proposal before approving it.",
        };
      return updateRow(
        state,
        action.id,
        (entry) => ({ ...entry, decision: "approved" }),
        "Row approved. Approve the complete versioned mapping separately before running.",
      );
    }
    case "APPROVE_MAPPING":
      if (isApprovalCurrent(state)) return state;
      if (!canApprove(state) || !state.source)
        return {
          ...state,
          notice:
            "Mapping approval blocked: inspect the source and resolve every proposed, unresolved, rejected or unsupported row.",
        };
      if (state.scenario === "conflict")
        return {
          ...state,
          mappingVersion: state.mappingVersion + 1,
          notice:
            "Simulated version conflict. Approval was not saved. Review the current mapping version and try again after clearing the scenario.",
        };
      return {
        ...state,
        approval: {
          sourceId: state.source.id,
          sourceVersion: state.source.version,
          mappingVersion: state.mappingVersion,
          contractVersion: state.contractVersion,
        },
        notice:
          "This source, mapping and demo contract version are explicitly approved. Running is a separate action.",
      };
    case "CHANGE_SOURCE":
      if (!state.source || inFlight(state)) return state;
      return {
        ...state,
        source: {
          ...state.source,
          version: state.source.version + 1,
          inspected: false,
        },
        mappingVersion: state.mappingVersion + 1,
        mappings: demoMappings.map((row) => ({
          ...row,
          targetPaths: [...row.targetPaths],
        })),
        correction: { ...initialCorrection },
        notice:
          "Source version changed. Reinspect source shape and review mappings again; prior approval and results describe earlier versions.",
      };
    case "CHANGE_CONTRACT":
      if (inFlight(state)) return state;
      return {
        ...state,
        contractVersion:
          "demo-contract-" +
          (Number(
            state.contractVersion.match(/^demo-contract-([0-9]+)/)?.[1] ?? 1,
          ) +
            1) +
          " (not an agreed HSDS profile)",
        mappings: state.mappings.map((row) =>
          row.decision === "approved" ? { ...row, decision: "proposed" } : row,
        ),
        correction: { ...initialCorrection },
        notice:
          "Demo target contract changed. Earlier approval is stale; review and approve against this contract before running.",
      };
    case "START_RUN": {
      if (inFlight(state)) return state;
      if (!isApprovalCurrent(state) || !canApprove(state) || !state.source)
        return {
          ...state,
          notice:
            "Run blocked: approve the current source, mapping and demo contract versions first.",
        };
      if (state.scenario === "conflict")
        return {
          ...state,
          mappingVersion: state.mappingVersion + 1,
          notice:
            "Simulated version conflict. No run was started; approval is stale.",
        };
      const parent = [...state.runs]
        .reverse()
        .find(
          (run) =>
            run.sourceId === state.source?.id &&
            run.sourceVersion === state.source?.version &&
            run.status === "completed",
        );
      const run: Run = {
        id: "demo-run-" + (state.runs.length + 1),
        sourceId: state.source.id,
        sourceVersion: state.source.version,
        mappingVersion: state.mappingVersion,
        contractVersion: state.contractVersion,
        parentRunId: parent?.id,
        status: "running",
        scenario: state.scenario,
        stage: 0,
        stages: [
          "Read synthetic input",
          "Apply reviewed demo mapping",
          "Check output",
          "Prepare fixture artifacts",
        ],
        mappings: state.mappings.map((row) => ({
          ...row,
          targetPaths: [...row.targetPaths],
        })),
        findings: [],
        checks: [
          {
            name: "Synthetic deterministic checks",
            status: "not run",
            detail: "Demo run has not reached checks.",
          },
        ],
        artifact: "unavailable",
        correctionVersion: isCorrectionCurrent(state)
          ? state.correction.version
          : undefined,
        correctionAfter: isCorrectionCurrent(state)
          ? state.correction.after
          : undefined,
        counts: {
          source: 3,
          transformed: 0,
          filtered: 0,
          rejected: 0,
          emitted: 0,
          unprocessed: 3,
        },
      };
      return {
        ...state,
        activeRunId: run.id,
        runs: [...state.runs, run],
        step: "run",
        notice:
          "Synthetic run started. Stages are fixture events, not backend progress; no service or model request was made.",
      };
    }
    case "ADVANCE_RUN": {
      const current = activeRun(state);
      if (
        !current ||
        current.status !== "running" ||
        (action.runId && action.runId !== current.id)
      )
        return state;
      if (current.stage + 1 < current.stages.length)
        return updateActiveRun(
          state,
          (run) => ({ ...run, stage: run.stage + 1 }),
          "Synthetic stage completed. No percentage or durable job is implied.",
        );
      const finished = finalizeRun(current);
      return {
        ...state,
        runs: state.runs.map((run) => (run.id === current.id ? finished : run)),
        correction:
          finished.status === "completed" &&
          finished.findings.some(
            (finding) => finding.id === state.correction.findingId,
          )
            ? { ...initialCorrection, basedOnRunId: finished.id }
            : state.correction,
        notice:
          finished.status === "failed"
            ? "Simulated system failure. No validity conclusion or artifact is available; explicit retry starts a new run."
            : finished.status === "partial"
              ? "Synthetic partial result: one source record was not processed. Available findings remain readable; output download is withheld."
              : "Synthetic transformation completed. Inspect deterministic findings; HSDS validity and semantic accuracy are not established.",
      };
    }
    case "INTERRUPT_RUN":
      if (!inFlight(state)) return state;
      return updateActiveRun(
        state,
        (run) => ({ ...run, status: "unknown", artifact: "unavailable" }),
        "Connection interrupted: status unknown. The request cannot be reconciled; do not assume it stopped or completed.",
      );
    case "REQUEST_CANCEL":
      if (activeRun(state)?.status !== "running") return state;
      return updateActiveRun(
        state,
        (run) => ({ ...run, status: "cancel requested" }),
        "Simulated cancellation requested. This is not acknowledgement that processing stopped.",
      );
    case "ACKNOWLEDGE_CANCEL":
      if (activeRun(state)?.status !== "cancel requested") return state;
      return updateActiveRun(
        state,
        (run) => ({ ...run, status: "cancelled", artifact: "unavailable" }),
        "Synthetic cancellation acknowledged by the fixture only. The real ZIP API does not provide this guarantee.",
      );
    case "RECONNECT":
      return {
        ...state,
        notice:
          activeRun(state)?.status === "unknown"
            ? "Reconnected, but the earlier request is still status unknown. No durable-job/reconciliation contract is available. Earlier reports remain in this session."
            : "Synthetic connection restored. Existing in-memory source, answers and reports remain; reloading still loses them.",
      };
    case "SET_SCENARIO":
      return {
        ...state,
        scenario: action.scenario,
        modelStatus:
          action.scenario === "model-timeout"
            ? "timeout"
            : action.scenario === "model-malformed"
              ? "malformed"
              : "available",
        notice:
          action.scenario === "model-timeout" ||
          action.scenario === "model-malformed"
            ? "Simulated model failure. No suggestion was applied; deterministic reports and existing answers remain available."
            : "Scenario selected for the next synthetic action. Existing run snapshots and findings are unchanged.",
      };
    case "REJECT_CORRECTION":
      if (
        state.correction.decision === "approved" ||
        !state.correction.basedOnRunId
      )
        return state;
      return {
        ...state,
        correction: { ...state.correction, decision: "rejected" },
        notice:
          "Correction rejected. The source, prior report and mapping are unchanged.",
      };
    case "REVISE_CORRECTION":
      if (
        state.correction.decision === "proposed" &&
        state.correction.after === action.after.trim().slice(0, 1000) &&
        state.correction.reason === action.reason.trim().slice(0, 1000)
      )
        return state;
      if (
        state.correction.decision === "approved" ||
        !state.correction.basedOnRunId
      )
        return state;
      if (!action.after.trim() || !action.reason.trim())
        return {
          ...state,
          notice:
            "A revised value and reason are required; no correction was applied.",
        };
      return {
        ...state,
        correction: {
          ...state.correction,
          after: action.after.trim().slice(0, 1000),
          reason: action.reason.trim().slice(0, 1000),
          version: state.correction.version + 1,
          decision: "proposed",
        },
        notice:
          "Correction revised. Review the before/after and scope, then explicitly approve the new proposal.",
      };
    case "APPROVE_CORRECTION": {
      const current = activeRun(state);
      if (
        state.correction.decision !== "proposed" ||
        !current ||
        current.status !== "completed" ||
        state.correction.basedOnRunId !== current.id ||
        current.sourceVersion !== state.source?.version ||
        current.mappingVersion !== state.mappingVersion ||
        current.contractVersion !== state.contractVersion
      )
        return {
          ...state,
          notice:
            "Correction blocked: use a current completed report and a non-rejected proposal. Stale corrections cannot be applied.",
        };
      return {
        ...state,
        correction: {
          ...state.correction,
          decision: "approved",
          approvedFor: {
            sourceId: current.sourceId,
            sourceVersion: current.sourceVersion,
            mappingVersion: state.mappingVersion + 1,
            contractVersion: current.contractVersion,
          },
        },
        mappingVersion: state.mappingVersion + 1,
        notice:
          "Correction approved as an in-memory reviewed patch; original source and prior report are preserved. Mapping approval is now stale. Approve the new version, then run again.",
      };
    }
    case "EXPIRE_ARTIFACT":
      if (activeRun(state)?.artifact !== "available") return state;
      return updateActiveRun(
        state,
        (run) => ({ ...run, artifact: "expired" }),
        "Synthetic artifact expired. Download is unavailable; previous check results remain identifiable.",
      );
  }
}
