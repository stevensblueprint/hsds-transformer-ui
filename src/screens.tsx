import { useEffect, useRef, useState } from "react";
import type { Dispatch } from "react";
import { Badge, Checks, Context, Evidence, Output, Panel } from "./ui";
import {
  compareFindings,
  isCorrectionCurrent,
  supportedTransformations,
} from "./workflow/reducer";
import type {
  MappingRow,
  Run,
  WorkflowAction,
  WorkflowState,
} from "./workflow/model";
type Send = Dispatch<WorkflowAction>;
type Props = { state: WorkflowState; send: Send; run?: Run };

export function SourceScreen({ state, send }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [issue, setIssue] = useState("");
  function pick(file?: File) {
    if (!file) return;
    setIssue(
      file.size > 10 * 1024 * 1024
        ? "Oversized input. Provisional browser limit: 10 MiB. Choose a smaller synthetic fixture."
        : !/\.(csv|json|zip)$/i.test(file.name)
          ? "Unsupported file type. Use the built-in sample or real ZIP integration."
          : "File contents were not read. Direct CSV/JSON intake is simulated. Load the built-in synthetic sample, or select real ZIP integration for an archive.",
    );
  }
  return (
    <Panel title="Your file" meta="Source · 01">
      <p className="eyebrow">A clear start for your directory</p>
      <h3>Choose a source. Keep its meaning.</h3>
      <p>
        Explore three invented services, linked locations, and a contact number
        that needs review.
      </p>
      <div
        className="drop-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files[0]);
        }}
      >
        <span className="file-symbol" aria-hidden="true">
          ⇧
        </span>
        <strong>Bring a source file</strong>
        <p>
          CSV and JSON are simulated here. ZIP processing is available in real
          integration mode.
        </p>
        <button
          className="button secondary"
          onClick={() => input.current?.click()}
        >
          Browse simulated source
        </button>
        <input
          ref={input}
          className="visually-hidden"
          tabIndex={-1}
          aria-label="Simulated source file"
          type="file"
          accept=".csv,.json,.zip"
          onChange={(e) => pick(e.currentTarget.files?.[0])}
        />
      </div>
      {issue && (
        <p className="notice warning" role="alert">
          {issue}
        </p>
      )}
      <div className="sample-card">
        <div>
          <Badge>Synthetic fixture</Badge>
          <h3>Harbor Community Directory</h3>
          <p>2 named CSVs · 3 service records · memory only</p>
        </div>
        <button
          className="button primary"
          disabled={!!state.source}
          onClick={() => send({ type: "LOAD_SOURCE" })}
        >
          {state.source ? "Sample selected" : "Load synthetic sample"}
        </button>
      </div>
      {state.source && (
        <>
          <p className="notice">
            Selected in memory; no upload has occurred.{" "}
            {state.source.inspected
              ? "Bounded sample inspected."
              : "Inspect separately before mapping."}
          </p>
          <div className="actions">
            <button
              className="button primary"
              disabled={state.source.inspected}
              onClick={() => send({ type: "INSPECT_SOURCE" })}
            >
              Inspect source
            </button>
            {state.source.inspected && (
              <a className="button secondary" href="#mapping">
                Continue to mapping →
              </a>
            )}
          </div>
        </>
      )}
      {state.source?.inspected && (
        <>
          <h3 className="section-title">Bounded source preview</h3>
          <p className="muted">
            All 3 synthetic rows. Text and formulas stay data; original values
            are preserved.
          </p>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Source preview table"
          >
            <table>
              <thead>
                <tr>
                  <th>Source ID</th>
                  <th>Service</th>
                  <th>Phone</th>
                  <th>Locations</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {state.source.rows.map((row) => (
                  <tr key={row.source_id}>
                    <th scope="row">{row.source_id}</th>
                    <td>{row.service}</td>
                    <td>{row.phone}</td>
                    <td>{row.location_ids}</td>
                    <td>{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <details className="details">
        <summary>File requirements & data handling</summary>
        <p>
          Demo: no file contents read, stored, uploaded or sent to a model.
          Refresh clears state. Real ZIP mode applies provisional 10 MiB
          compressed / 50 MiB expanded / 100-entry metadata preflight. Engine
          safety checks remain required.
        </p>
      </details>
    </Panel>
  );
}
function MappingCard({
  row,
  send,
  busy,
}: {
  row: MappingRow;
  send: Send;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [paths, setPaths] = useState(
    row.targetPaths.join("\n") || "service.description",
  );
  const [transform, setTransform] = useState<string>(
    row.decision === "unsupported"
      ? supportedTransformations[2]
      : supportedTransformations.includes(
            row.transformation as (typeof supportedTransformations)[number],
          )
        ? row.transformation
        : "Copy text",
  );
  const [answer, setAnswer] = useState(row.answer ?? "");
  const revise = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);
  function close() {
    setEditing(false);
    requestAnimationFrame(() => revise.current?.focus());
  }
  return (
    <article className="mapping-card" aria-label={`Review ${row.id} mapping`}>
      <div className="card-title">
        <h3>{row.sourceField}</h3>
        <Badge tone={row.decision}>{row.decision}</Badge>
      </div>
      <p className="source-evidence">
        Source evidence <code>{row.evidence}</code>
      </p>
      <dl className="mapping-definition">
        <dt>Target entity</dt>
        <dd>{row.entity}</dd>
        <dt>
          Full target path{row.targetPaths.length > 1 ? "s · one to many" : ""}
        </dt>
        <dd>
          {row.targetPaths.length
            ? row.targetPaths.map((path) => <code key={path}>{path}</code>)
            : "Intentionally unmapped"}
        </dd>
        <dt>Transformation</dt>
        <dd>{row.transformation}</dd>
      </dl>
      {row.clarification && (
        <form
          className="clarification"
          onSubmit={(e) => {
            e.preventDefault();
            send({ type: "CLARIFY", id: row.id, answer });
          }}
        >
          <label htmlFor={`answer-${row.id}`}>{row.clarification}</label>
          <input
            id={`answer-${row.id}`}
            aria-label="Clarification answer"
            value={answer}
            maxLength={1000}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={busy}
          />
          <button
            className="button secondary"
            disabled={busy || !answer.trim()}
            type="submit"
          >
            Save clarification
          </button>
          {row.answer && (
            <p>Saved answer: {row.answer}. Approval is still required.</p>
          )}
        </form>
      )}
      <div className="actions">
        <button
          className="button small primary"
          disabled={busy || row.decision !== "proposed"}
          onClick={() => send({ type: "APPROVE_ROW", id: row.id })}
        >
          Approve {row.id}
        </button>
        <button
          className="button small secondary"
          disabled={busy || row.decision === "rejected"}
          onClick={() => send({ type: "REJECT_MAPPING", id: row.id })}
        >
          Reject {row.id}
        </button>
        <button
          ref={revise}
          className="button small secondary"
          disabled={busy}
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
        >
          Revise {row.id}
        </button>
        {row.decision !== "unmapped" && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => send({ type: "MARK_UNMAPPED", id: row.id })}
          >
            Leave {row.id} unmapped
          </button>
        )}
      </div>
      {editing && (
        <form
          className="revision-form"
          onSubmit={(e) => {
            e.preventDefault();
            send({
              type: "REVISE_MAPPING",
              id: row.id,
              targetPaths: paths.split("\n"),
              transformation: transform,
            });
            close();
          }}
        >
          <label htmlFor={`paths-${row.id}`}>
            Full target paths (one per line)
          </label>
          <textarea
            ref={field}
            id={`paths-${row.id}`}
            value={paths}
            onChange={(e) => setPaths(e.target.value)}
            maxLength={2000}
            required
          />
          <label htmlFor={`transform-${row.id}`}>
            Supported demo transformation
          </label>
          <select
            id={`transform-${row.id}`}
            value={transform}
            onChange={(e) => setTransform(e.target.value)}
          >
            {supportedTransformations.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <p>
            A revision invalidates earlier approval. Saving does not approve the
            row.
          </p>
          <div className="actions">
            <button className="button primary" type="submit">
              Save mapping revision
            </button>
            <button className="button secondary" type="button" onClick={close}>
              Cancel revision
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
export function MappingScreen({ state, send }: Props) {
  const active = state.runs.find((run) => run.id === state.activeRunId);
  const busy =
    active?.status === "running" || active?.status === "cancel requested";
  return (
    <Panel
      title="Your file → mapping"
      meta={`Mapping v${state.mappingVersion}`}
    >
      {!state.source?.inspected ? (
        <p className="notice">
          Inspect a source first. <a href="#source">Return to Source</a>.
        </p>
      ) : (
        <>
          <p>
            Review every proposal against its evidence. Unresolved, unsupported
            and rejected rows block version approval. Intentionally unmapped
            fields stay visible.
          </p>
          <div className="mapping-list">
            {state.mappings.map((row) => (
              <MappingCard
                key={`${state.source?.version}-${state.contractVersion}-${row.id}`}
                row={row}
                send={send}
                busy={busy}
              />
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
export function RunScreen({ state, run, send }: Props) {
  return (
    <Panel title="Transformation" meta={run?.id ?? "Not started"}>
      <Context state={state} run={run} />
      <p>
        These stages are fixture events. Real ZIP integration exposes one
        request without percentages or durable jobs.
      </p>
      {run ? (
        <>
          <Badge
            tone={
              run.status === "failed"
                ? "error"
                : run.status === "completed"
                  ? "approved"
                  : "neutral"
            }
          >
            {run.status}
          </Badge>
          <ol className="stage-list">
            {run.stages.map((stage, index) => (
              <li
                key={stage}
                aria-current={
                  run.status === "running" && index === run.stage
                    ? "step"
                    : undefined
                }
              >
                <span className="stage-number" aria-hidden="true">
                  {index < run.stage ? "✓" : index + 1}
                </span>
                <div>
                  <strong>{stage}</strong>
                  <p>
                    {index < run.stage
                      ? "Fixture stage completed"
                      : index === run.stage && run.status === "running"
                        ? "Current simulated stage"
                        : "Not completed"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="actions">
            {run.status === "running" && (
              <>
                <button
                  className="button primary"
                  onClick={() => send({ type: "ADVANCE_RUN", runId: run.id })}
                >
                  Advance simulated stage
                </button>
                <button
                  className="button secondary"
                  onClick={() => send({ type: "REQUEST_CANCEL" })}
                >
                  Request cancellation
                </button>
                <button
                  className="button secondary"
                  onClick={() => send({ type: "INTERRUPT_RUN" })}
                >
                  Simulate disconnection
                </button>
              </>
            )}
            {run.status === "cancel requested" && (
              <button
                className="button secondary"
                onClick={() => send({ type: "ACKNOWLEDGE_CANCEL" })}
              >
                Simulate cancellation acknowledgement
              </button>
            )}
            {run.status === "unknown" && (
              <button
                className="button secondary"
                onClick={() => send({ type: "RECONNECT" })}
              >
                Reconnect
              </button>
            )}
            {["completed", "partial"].includes(run.status) && (
              <a href="#review" className="button primary">
                Review findings →
              </a>
            )}
          </div>
          {["unknown", "cancel requested"].includes(run.status) && (
            <p className="notice warning">
              {run.status === "unknown"
                ? "Status cannot be reconciled. Reconnection is not evidence of completion or cancellation."
                : "Requested is not acknowledged. The real ZIP API cannot acknowledge cancellation."}
            </p>
          )}
          {run.status === "partial" && (
            <p className="notice warning">
              Partial result: {run.counts.unprocessed} source record not
              processed. Output download withheld.
            </p>
          )}
          {run.status === "failed" && (
            <p className="notice warning">
              System failure prevented checks. This is not an invalid-data
              result. Explicit retry starts a new run.
            </p>
          )}
        </>
      ) : (
        <div className="empty-preview">
          <span aria-hidden="true">↪</span>
          <h3>Ready when you have reviewed</h3>
          <p>
            Approve the mapping version, then use the separate run action below.
          </p>
          <a href="#mapping">Review mappings</a>
        </div>
      )}
    </Panel>
  );
}
export function ReviewScreen({ state, run }: Props) {
  const [findingId, setFindingId] = useState("phone-length");
  const [viewRunId, setViewRunId] = useState("");
  const selectedRun = state.runs.find((item) => item.id === viewRunId) ?? run;
  const finding =
    selectedRun?.findings.find((item) => item.id === findingId) ??
    selectedRun?.findings[0];
  const parent = state.runs.find(
    (item) => item.id === selectedRun?.parentRunId,
  );
  const comparison =
    parent &&
    selectedRun &&
    parent.status === "completed" &&
    selectedRun.status === "completed" &&
    parent.sourceId === selectedRun.sourceId &&
    parent.sourceVersion === selectedRun.sourceVersion &&
    parent.contractVersion === selectedRun.contractVersion
      ? compareFindings(parent.findings, selectedRun.findings)
      : undefined;
  return (
    <Panel title="Deterministic report" meta={selectedRun?.id ?? "No report"}>
      <p>
        The report stays usable without a model. Findings come from the stated
        check layer; factual and semantic accuracy remain separate.
      </p>
      <label htmlFor="report-run">Report version</label>
      <select
        id="report-run"
        value={selectedRun?.id ?? ""}
        onChange={(e) => setViewRunId(e.target.value)}
      >
        <option value="" disabled>
          No report selected
        </option>
        {state.runs.map((item) => (
          <option key={item.id} value={item.id}>
            {item.id} · source v{item.sourceVersion} / mapping v
            {item.mappingVersion} · {item.status}
          </option>
        ))}
      </select>
      {selectedRun && (
        <>
          <Context state={state} run={selectedRun} />
          <div className="finding-totals">
            <Badge tone="error">
              {
                selectedRun.findings.filter((item) => item.severity === "error")
                  .length
              }{" "}
              errors
            </Badge>
            <Badge tone="warning">
              {
                selectedRun.findings.filter(
                  (item) => item.severity === "warning",
                ).length
              }{" "}
              warnings
            </Badge>
            <Badge>
              {
                selectedRun.findings.filter((item) => item.severity === "info")
                  .length
              }{" "}
              informational
            </Badge>
          </div>
        </>
      )}
      {state.modelStatus !== "available" && (
        <p className="notice warning" role="status">
          Model{" "}
          {state.modelStatus === "timeout" ? "timeout" : "malformed output"}{" "}
          simulated. No suggestion applied; deterministic evidence remains
          below.
        </p>
      )}
      <div className="finding-list" aria-label="Findings">
        {selectedRun?.findings.map((item) => (
          <button
            key={item.id}
            className={`finding ${finding?.id === item.id ? "selected" : ""}`}
            aria-pressed={finding?.id === item.id}
            onClick={() => setFindingId(item.id)}
          >
            <Badge tone={item.severity}>{item.severity}</Badge>
            <strong>{item.code}</strong>
            <span>{item.message}</span>
          </button>
        ))}
      </div>
      {finding ? (
        <section className="evidence" aria-label="Selected diagnostic evidence">
          <h3>Evidence & location</h3>
          <Evidence finding={finding} />
        </section>
      ) : (
        <p className="notice">
          No diagnostic evidence is available.{" "}
          {selectedRun?.status === "failed"
            ? "System failure prevented checks."
            : "Complete a synthetic run first."}
        </p>
      )}
      {selectedRun && <Checks run={selectedRun} />}
      {parent && !comparison && (
        <p className="notice warning">
          Comparison is inconclusive: both reports must be complete and cover
          the same source and target contract. Missing findings are not evidence
          of resolution.
        </p>
      )}
      {comparison && (
        <section className="comparison" aria-label="Rerun comparison">
          <h3>
            {parent?.id} → {selectedRun?.id}
          </h3>
          <div className="comparison-counts">
            <div>
              <strong>{comparison.resolved.length}</strong>Resolved
            </div>
            <div>
              <strong>{comparison.remaining.length}</strong>Remaining
            </div>
            <div>
              <strong>{comparison.newFindings.length}</strong>New
            </div>
            <div>
              <strong>{comparison.uncertain.length}</strong>Uncertain matches
            </div>
          </div>
          <p>
            Only unique stable fixture identities establish resolved/remaining
            findings. Missing identities stay uncertain, never silently cleared.
          </p>
          {comparison.resolved.map((item) => (
            <p key={item.id}>Resolved: {item.code}</p>
          ))}
          {comparison.newFindings.map((item) => (
            <p key={item.id}>New: {item.code}</p>
          ))}
        </section>
      )}
    </Panel>
  );
}
export function CorrectionScreen({ state, run, send }: Props) {
  const [editing, setEditing] = useState(false);
  const [after, setAfter] = useState(state.correction.after);
  const [reason, setReason] = useState(state.correction.reason);
  const revise = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);
  const c = state.correction;
  const current =
    run &&
    run.id === c.basedOnRunId &&
    run.sourceVersion === state.source?.version &&
    run.mappingVersion === state.mappingVersion &&
    run.contractVersion === state.contractVersion;
  return (
    <Panel title="Review a correction" meta={`Proposal v${c.version}`}>
      {!c.basedOnRunId ? (
        <>
          <p className="notice">
            Complete a run with the phone finding first. No correction engine is
            connected.
          </p>
          <Output state={state} run={run} />
        </>
      ) : (
        <>
          <Badge tone={c.decision}>{c.decision}</Badge>
          <p>
            Proposed against <strong>{c.basedOnRunId}</strong>. The replacement
            is authored synthetic data, not an inferred real phone number.
          </p>
          <div className="diff">
            <div>
              <span>Before · original retained</span>
              <code>{c.before}</code>
            </div>
            <div>
              <span>After · proposed patch</span>
              <code>{c.after}</code>
            </div>
          </div>
          <dl className="evidence-list">
            <div>
              <dt>Reason</dt>
              <dd>{c.reason}</dd>
            </div>
            <div>
              <dt>Affected scope</dt>
              <dd>{c.scope}</dd>
            </div>
            <div>
              <dt>Version effect</dt>
              <dd>
                Approval creates a reviewed patch and a new mapping version.
                Renew mapping approval and create a fresh run. Original source
                and earlier report remain in memory.
              </dd>
            </div>
          </dl>
          {!current && c.decision !== "approved" && (
            <p className="notice warning">
              Stale correction. Use a report for the current source, mapping and
              target contract.
            </p>
          )}
          {c.decision === "approved" && !isCorrectionCurrent(state) && (
            <p className="notice warning">
              Approved patch is stale and will not apply to a new run.
            </p>
          )}
          <div className="actions">
            <button
              className="button primary"
              disabled={!current || c.decision !== "proposed"}
              onClick={() => send({ type: "APPROVE_CORRECTION" })}
            >
              Approve correction version
            </button>
            <button
              className="button secondary"
              disabled={c.decision === "approved" || c.decision === "rejected"}
              onClick={() => send({ type: "REJECT_CORRECTION" })}
            >
              Reject correction
            </button>
            <button
              ref={revise}
              className="button secondary"
              disabled={c.decision === "approved"}
              aria-expanded={editing}
              onClick={() => setEditing(!editing)}
            >
              Revise correction
            </button>
          </div>
          {editing && (
            <form
              className="revision-form"
              onSubmit={(e) => {
                e.preventDefault();
                send({ type: "REVISE_CORRECTION", after, reason });
                setEditing(false);
                requestAnimationFrame(() => revise.current?.focus());
              }}
            >
              <label htmlFor="correction-after">Revised value</label>
              <input
                ref={field}
                id="correction-after"
                value={after}
                maxLength={1000}
                onChange={(e) => setAfter(e.target.value)}
                required
              />
              <label htmlFor="correction-reason">Reason for revision</label>
              <textarea
                id="correction-reason"
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
                required
              />
              <button className="button primary" type="submit">
                Save correction revision
              </button>
            </form>
          )}
          {c.decision === "approved" && (
            <p className="notice">
              Patch approved.{" "}
              <a href="#mapping">Approve the new mapping version</a>, then rerun
              to compare findings.
            </p>
          )}
          <details className="details">
            <summary>Original source & previous reports</summary>
            <p>
              No source cell was overwritten. Reports are snapshots retained
              until reload.
            </p>
            <pre>{JSON.stringify(state.source?.rows[0], null, 2)}</pre>
            <ul>
              {state.runs.map((item) => (
                <li key={item.id}>
                  {item.id} · mapping v{item.mappingVersion} ·{" "}
                  {item.findings.length} findings
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </Panel>
  );
}
function downloadReport(run: Run) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          simulated: true,
          disclaimer:
            "Authored fixture report; not HSDS validity or production-readiness evidence",
          run,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${run.id}-synthetic-report.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ExportScreen({ state, run, send }: Props) {
  const stale =
    run &&
    (run.sourceVersion !== state.source?.version ||
      run.mappingVersion !== state.mappingVersion ||
      run.contractVersion !== state.contractVersion);
  return (
    <Panel title="Artifacts & checks" meta={run?.id ?? "No run"}>
      <p>
        Download an identified synthetic report. This scaffold does not generate
        real HSDS output; use real ZIP integration for the existing backend
        transformation.
      </p>
      <Context state={state} run={run} />
      {run ? (
        <>
          <Badge tone={run.status === "failed" ? "error" : "neutral"}>
            {run.status}
          </Badge>
          {stale && (
            <p className="notice warning">
              Earlier-version result. This artifact does not describe current
              versions.
            </p>
          )}
          <Checks run={run} />
          <dl className="record-counts">
            {Object.entries(run.counts).map(([name, count]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
          <div className="artifact-card">
            <h3>{run.id}-synthetic-report.json</h3>
            <p>
              Artifact: {run.artifact}. Fixture findings, counts, check layers,
              parent run and version context.
            </p>
            <p>
              Expiry: this memory-only session or explicit demo expiry. No
              server retention or persisted history.
            </p>
            <button
              className="button primary"
              disabled={run.artifact !== "available"}
              onClick={() => downloadReport(run)}
            >
              Download simulated report
            </button>
            <button
              className="text-button"
              disabled={run.artifact !== "available"}
              onClick={() => send({ type: "EXPIRE_ARTIFACT" })}
            >
              Simulate artifact expiry
            </button>
          </div>
          {run.artifact !== "available" && (
            <p className="notice warning">
              Download unavailable:{" "}
              {run.artifact === "expired"
                ? "artifact expired"
                : "no complete artifact"}
              . Earlier checks remain identifiable.
            </p>
          )}
        </>
      ) : (
        <p className="notice">
          No run artifacts yet.{" "}
          <a href="#mapping">Review and approve your mapping</a>.
        </p>
      )}
    </Panel>
  );
}
