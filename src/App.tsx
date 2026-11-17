import { useEffect, useReducer, useRef, useState } from "react";
import RealZipFlow from "./integration/RealZipFlow";
import {
  CorrectionScreen,
  ExportScreen,
  MappingScreen,
  ReviewScreen,
  RunScreen,
  SourceScreen,
} from "./screens";
import { Badge, Guide, Output } from "./ui";
import {
  canApprove,
  initialState,
  isApprovalCurrent,
  reducer,
} from "./workflow/reducer";
import type { Scenario, Step } from "./workflow/model";
import "@fontsource/poppins/600.css";
import "@fontsource/albert-sans/400.css";
import "@fontsource/albert-sans/500.css";
import "@fontsource/albert-sans/600.css";
import "./App.css";

const steps: Step[] = ["source", "mapping", "run", "review", "export"];
const titles: Record<Step, string> = {
  source: "Bring your data into focus",
  mapping: "Review & approve",
  run: "Run your transformation",
  review: "Understand every finding",
  export: "Export with context",
};
const currentStep = (): Step =>
  steps.find((step) => `#${step}` === window.location.hash) ?? "source";

export default function App() {
  const [state, send] = useReducer(reducer, initialState, (initial) => ({
    ...initial,
    step: currentStep(),
  }));
  const [mode, setMode] = useState<"demo" | "real">("demo");
  const [help, setHelp] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const helpButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const navigate = () => {
      if (steps.some((step) => `#${step}` === window.location.hash))
        send({ type: "NAVIGATE", step: currentStep() });
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  useEffect(() => {
    title.current?.focus();
  }, [state.step, mode]);
  const run = state.runs.find((item) => item.id === state.activeRunId);
  const busy = run?.status === "running" || run?.status === "cancel requested";
  const unresolved = state.mappings.filter(
    (row) => row.decision !== "approved" && row.decision !== "unmapped",
  ).length;
  const errors =
    run?.findings.filter((item) => item.severity === "error").length ?? 0;
  const stale =
    run &&
    (run.sourceVersion !== state.source?.version ||
      run.mappingVersion !== state.mappingVersion ||
      run.contractVersion !== state.contractVersion);
  const props = { state, send, run };
  return (
    <div className="application">
      <a
        className="skip-link"
        href="#workspace"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("workspace")?.focus();
        }}
      >
        Skip to workspace
      </a>
      <header className="app-header">
        <a className="wordmark" href="#source" aria-label="Open Referral home">
          <span>
            OPEN
            <span className="wordmark-lines" aria-hidden="true">
              ═══
            </span>
          </span>
          <span>REFERRAL</span>
        </a>
        <div className="brand-title">
          <span>OPEN REFERRAL</span>
          <strong>.json File Converter</strong>
        </div>
        <button
          ref={helpButton}
          className="help-button"
          aria-label="Workflow help"
          aria-expanded={help}
          onClick={() => setHelp(!help)}
        >
          ?
        </button>
      </header>
      {help && (
        <section className="help-panel" aria-label="Workflow help">
          <h2>One reviewed step at a time</h2>
          <p>
            Inspect the source, review proposals, approve the exact mapping
            version, then run. Review evidence before corrections and export.
            Synthetic mode makes no backend or model calls. Real ZIP mode sends
            only your selected archive to the configured transformer.
          </p>
          <button
            className="button secondary"
            onClick={() => {
              setHelp(false);
              helpButton.current?.focus();
            }}
          >
            Close help
          </button>
        </section>
      )}
      <div className="workspace-toolbar">
        <div>
          <span className="eyebrow">Dataset workspace</span>
          <strong>
            {mode === "demo"
              ? (state.source?.name ?? "New source")
              : "Existing ZIP transformation"}
          </strong>
        </div>
        <fieldset className="mode-switch">
          <legend className="visually-hidden">Integration mode</legend>
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === "demo"}
              onChange={() => setMode("demo")}
            />{" "}
            Synthetic demo
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === "real"}
              onChange={() => setMode("real")}
            />{" "}
            Real ZIP integration
          </label>
        </fieldset>
      </div>
      <div className="mode-banner">
        <Badge tone={mode === "demo" ? "warning" : "neutral"}>
          {mode === "demo" ? "SIMULATED" : "REAL REQUESTS · ZIP ONLY"}
        </Badge>
        <span>
          {mode === "demo"
            ? "Synthetic data · no backend or model calls · memory only; reload loses this session."
            : "Explicit ZIP upload to the configured backend. Rich mapping, diagnostics and history remain simulated."}
        </span>
      </div>
      {mode === "demo" && (
        <nav className="workflow-nav" aria-label="Transformation workflow">
          <ol>
            {steps.map((step, index) => (
              <li key={step}>
                <a
                  href={`#${step}`}
                  aria-label={step.charAt(0).toUpperCase() + step.slice(1)}
                  aria-current={state.step === step ? "step" : undefined}
                >
                  <span className="step-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{step.charAt(0).toUpperCase() + step.slice(1)}</span>
                  {step === "mapping" && state.source && (
                    <span className="nav-count">{unresolved} to review</span>
                  )}
                  {step === "review" && run && (
                    <span className="nav-count">{errors} errors</span>
                  )}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <main id="workspace" tabIndex={-1}>
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              {mode === "demo"
                ? `${String(steps.indexOf(state.step) + 1).padStart(2, "0")} / 05 · ${state.step}`
                : "Existing integration"}
            </p>
            <h1 ref={title} tabIndex={-1}>
              {mode === "demo"
                ? titles[state.step]
                : "Transform your ZIP archive"}
            </h1>
          </div>
          {mode === "demo" && (
            <div className="version-summary">
              <span>
                Source {state.source ? `v${state.source.version}` : "—"} ·
                Mapping v{state.mappingVersion}
              </span>
              <Badge
                tone={
                  isApprovalCurrent(state)
                    ? "approved"
                    : state.approval
                      ? "warning"
                      : "neutral"
                }
              >
                {isApprovalCurrent(state)
                  ? "Version approved"
                  : state.approval
                    ? "Approval stale"
                    : "Approval required"}
              </Badge>
            </div>
          )}
        </div>
        {mode === "demo" ? (
          <>
            <p
              className="session-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {state.notice}
            </p>
            {stale && (
              <p className="notice warning">
                Earlier run {run.id} describes previous versions. Renew approval
                and rerun; earlier reports remain available.
              </p>
            )}
            <div className={`workspace-grid step-${state.step}`}>
              {state.step === "source" ? (
                <SourceScreen {...props} />
              ) : state.step === "mapping" ? (
                <MappingScreen {...props} />
              ) : state.step === "run" ? (
                <RunScreen {...props} />
              ) : state.step === "review" ? (
                <ReviewScreen {...props} />
              ) : (
                <ExportScreen {...props} />
              )}
              <Guide state={state} />
              {state.step === "review" ? (
                <CorrectionScreen {...props} />
              ) : (
                <Output state={state} run={run} />
              )}
            </div>
            <section
              className="approval-bar"
              aria-label="Approval scope and primary actions"
            >
              <div>
                <strong>
                  {isApprovalCurrent(state)
                    ? "Approved scope"
                    : "Review before you run"}
                </strong>
                <p>
                  Source{" "}
                  {state.source ? `v${state.source.version}` : "not selected"} ·
                  Mapping v{state.mappingVersion} · {state.contractVersion}
                </p>
                <span>
                  {unresolved} mapping decisions to review · {errors} errors in{" "}
                  {run?.id ?? "no run yet"}
                </span>
              </div>
              <div className="actions">
                <button
                  className="button secondary"
                  disabled={!canApprove(state) || isApprovalCurrent(state)}
                  onClick={() => send({ type: "APPROVE_MAPPING" })}
                >
                  Approve mapping version
                </button>
                <button
                  className="button primary"
                  aria-label={
                    state.runs.length
                      ? "Run transformation again"
                      : "Run transformation"
                  }
                  disabled={
                    !isApprovalCurrent(state) || !canApprove(state) || busy
                  }
                  onClick={() => {
                    send({ type: "START_RUN" });
                    window.location.hash = "run";
                  }}
                >
                  {state.runs.length
                    ? "Run transformation again"
                    : "Run transformation"}{" "}
                  →
                </button>
              </div>
            </section>
            <details className="scenario-panel">
              <summary>
                Demo controls · explore failure & version states
              </summary>
              <div className="scenario-body">
                <label htmlFor="scenario">
                  Scenario for the next synthetic action
                </label>
                <select
                  id="scenario"
                  value={state.scenario}
                  onChange={(e) =>
                    send({
                      type: "SET_SCENARIO",
                      scenario: e.target.value as Scenario,
                    })
                  }
                >
                  <option value="normal">Normal fixture behavior</option>
                  <option value="model-timeout">
                    Model timeout · deterministic report remains
                  </option>
                  <option value="model-malformed">
                    Malformed model output · no suggestion applied
                  </option>
                  <option value="conflict">
                    Version conflict · approval/run blocked
                  </option>
                  <option value="partial">
                    Partial result · one unprocessed record
                  </option>
                  <option value="system-failure">
                    System failure · checks not run
                  </option>
                </select>
                <div className="actions">
                  <button
                    className="button secondary"
                    disabled={!state.source || busy}
                    onClick={() => send({ type: "CHANGE_SOURCE" })}
                  >
                    Simulate source version change
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => send({ type: "CHANGE_CONTRACT" })}
                  >
                    Simulate target contract change
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => send({ type: "RECONNECT" })}
                  >
                    Reconnect synthetic workspace
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      send({ type: "RESET" });
                      window.location.hash = "source";
                    }}
                  >
                    Reset demo
                  </button>
                </div>
                <p>
                  Refresh starts an empty workspace. Source, approvals, reports
                  and files are never saved in browser storage. No account or
                  server history is implied.
                </p>
              </div>
            </details>
          </>
        ) : (
          <RealZipFlow />
        )}
      </main>
      <footer className="app-footer">
        <span>Blueprint · Open Referral</span>
        <span>
          Shared frontend scaffold · target contract & real validation pending
        </span>
      </footer>
    </div>
  );
}
