import { useEffect, useRef, useState } from "react";
import { Badge, Panel } from "../ui";
import { API_URL } from "../integration/adapter";
import MappingReview from "./MappingReview";
import SourceInspector from "./SourceInspector";
import OutputReview from "./OutputReview";
import { CONTRACT, useTransformation } from "./useTransformation";
import sourceText from "../assets/repository-json/orgs.json?raw";
import mappingText from "../assets/repository-json/orgs_organization_mapping.json?raw";

export default function Workspace() {
  const state = useTransformation();
  const [resetOpen, setResetOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const focusContext = `${state.view}:${state.sourceVersion}:${state.mappingVersion}`;
  const lastView = useRef(focusContext);
  useEffect(() => {
    if (lastView.current !== focusContext) {
      title.current?.focus();
      lastView.current = focusContext;
    }
  }, [focusContext]);
  useEffect(() => {
    if (resetOpen) dialog.current?.showModal();
  }, [resetOpen]);
  function closeReset() {
    dialog.current?.close();
    setResetOpen(false);
    resetButton.current?.focus();
  }
  function useRepositoryFiles() {
    const files = [
      new File([sourceText], "orgs.json", { type: "application/json" }),
      new File([mappingText], "orgs_organization_mapping.json", {
        type: "application/json",
      }),
    ];
    state.addFiles(files);
    void state.inspect(
      files,
      "hsds-transformer main @6486294a7aac8fbce1bb4e021fe6e810c1f335df · repository test fixture, not partner data",
    );
  }
  const unresolved = state.rows.filter(
    (row) => state.decisions[row.id] === "unresolved",
  ).length;
  const rejected = state.rows.filter(
    (row) => state.decisions[row.id] === "rejected",
  ).length;
  const reviewed = state.rows.filter(
    (row) => state.decisions[row.id] === "approved",
  ).length;
  const chosen =
    state.runs.find((run) => run.id === state.selectedRun) ?? state.runs.at(-1);
  return (
    <>
      <div className="workspace-toolbar compact-toolbar">
        <div>
          <span className="eyebrow">Your workspace</span>
          <strong>{state.input?.name ?? "New transformation"}</strong>
        </div>
        <div className="toolbar-actions">
          <span className="memory-note">
            In this browser only · reload clears the session
          </span>
          {(state.input ||
            state.draftFiles.length > 0 ||
            state.runs.length > 0) && (
            <button
              ref={resetButton}
              className="text-button"
              onClick={() => setResetOpen(true)}
            >
              Clear session
            </button>
          )}
        </div>
      </div>
      <main id="workspace" tabIndex={-1}>
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              {state.view === "intake"
                ? "Start with your source"
                : state.view === "mapping"
                  ? "Keep the meaning of your data"
                  : "Inspect what came back"}
            </p>
            <h1 ref={title} tabIndex={-1}>
              {state.view === "intake"
                ? "Bring your data into focus"
                : state.view === "mapping"
                  ? "Review & approve"
                  : "Your transformation"}
            </h1>
          </div>
          {state.input && (
            <Badge tone={state.approved ? "approved" : "neutral"}>
              {state.approved ? "Current mapping reviewed" : "Review required"}
            </Badge>
          )}
        </div>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={`session-status${state.error ? " interaction-error" : ""}`}
        >
          {state.notice}
        </p>
        <div className="workspace-grid interaction-grid">
          <Panel
            title={
              state.view === "intake"
                ? "Your file"
                : state.view === "mapping"
                  ? "Review & approve"
                  : "Transformation details"
            }
            meta={
              state.busy === "inspect"
                ? "Inspecting locally"
                : state.input
                  ? `${state.input.format.toUpperCase()} · source v${state.sourceVersion}`
                  : "CSV, JSON or ZIP"
            }
          >
            {state.view === "intake" ? (
              <>
                <h3>A clear start for your directory</h3>
                <p>
                  Add your source export and its mapping files together. You can
                  also bring a ZIP containing both.
                </p>
                <section
                  className={`intake-dropzone${dragging ? " is-dragging" : ""}`}
                  aria-label="File intake"
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (!state.busy) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    if (!state.busy)
                      state.addFiles(Array.from(event.dataTransfer.files));
                  }}
                >
                  <svg
                    viewBox="0 0 40 40"
                    width="38"
                    height="38"
                    aria-hidden="true"
                  >
                    <path
                      d="M20 28V7m-8 8 8-8 8 8M7 25v9h26v-9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                  <h3>Bring a source file</h3>
                  <p>Drop CSV, JSON or a ZIP here</p>
                  <label
                    className="button secondary file-picker-label"
                    htmlFor="transformation-files"
                  >
                    Browse files
                  </label>
                  <input
                    ref={picker}
                    id="transformation-files"
                    className="visually-hidden"
                    type="file"
                    multiple
                    accept=".csv,.json,.zip"
                    disabled={!!state.busy}
                    aria-describedby="input-requirements"
                    onChange={(event) => {
                      state.addFiles(Array.from(event.target.files ?? []));
                      event.target.value = "";
                    }}
                  />
                </section>
                <p id="input-requirements" className="muted requirements">
                  Up to 10 MiB of files or one ZIP. Use matching source and
                  mapping formats. Mappings follow{" "}
                  <code>source_entity_mapping.csv</code> or <code>.json</code>.
                  No mapping yet? Add one before inspection. Files stay local
                  until you explicitly run.
                </p>
                {state.draftFiles.length > 0 && (
                  <ul className="selected-files" aria-label="Selected files">
                    {state.draftFiles.map((file, index) => (
                      <li key={`${file.name}-${index}`}>
                        <div>
                          <strong>{file.name}</strong>
                          <span>{Math.ceil(file.size / 1024)} KiB</span>
                        </div>
                        <button
                          className="text-button"
                          disabled={!!state.busy}
                          aria-label={`Remove ${file.name}`}
                          onClick={() => state.removeFile(index)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="actions">
                  <button
                    className="button primary"
                    disabled={!state.draftFiles.length || !!state.busy}
                    onClick={() => void state.inspect()}
                  >
                    {state.busy === "inspect"
                      ? "Inspecting files…"
                      : "Inspect files"}
                  </button>
                  {state.input && (
                    <button
                      className="button secondary"
                      disabled={!!state.busy}
                      onClick={() => state.setView("mapping")}
                    >
                      Return to mapping
                    </button>
                  )}
                </div>
                <details className="repository-example">
                  <summary>Need a working repository input?</summary>
                  <p>
                    The backend main repository includes one “Test Organization”
                    JSON record and its mapping. It is an upstream test fixture.
                  </p>
                  <button
                    className="text-button"
                    disabled={!!state.busy}
                    onClick={useRepositoryFiles}
                  >
                    Use repository JSON
                  </button>
                </details>
                <details>
                  <summary>File requirements and data handling</summary>
                  <p>
                    Standard, single-root ZIP; no unsafe paths, duplicate names,
                    links or encryption. Archive metadata and expansion limits
                    are checked locally. The backend independently validates the
                    upload. JSON sources must be arrays of records.
                  </p>
                  <p>
                    CSV/JSON files are packaged in memory for the existing
                    transformer. Nothing is sent to a model or stored in browser
                    storage. Large files may have no text preview; missing or
                    malformed mapping files block review.
                  </p>
                </details>
              </>
            ) : null}
            {state.input && (
              <div hidden={state.view !== "mapping"}>
                <div className="source-context">
                  <strong>{state.input.name}</strong>
                  <span>
                    Source v{state.sourceVersion} · mapping v
                    {state.mappingVersion}
                  </span>
                  <button
                    className="text-button"
                    disabled={!!state.busy}
                    onClick={() => state.setView("intake")}
                  >
                    Change files
                  </button>
                  <button
                    className="text-button"
                    disabled={!!state.busy}
                    onClick={state.downloadInputs}
                  >
                    Download current inputs
                  </button>
                </div>
                {state.input.warnings.map((warning) => (
                  <p className="notice warning" key={warning}>
                    {warning}
                  </p>
                ))}
                <details className="source-details">
                  <summary>Inspect source values</summary>
                  <SourceInspector
                    key={`${state.sourceVersion}`}
                    files={state.input.files}
                    disabled={!!state.busy}
                    onSave={state.saveSource}
                    onEditingChange={state.setSourceEditing}
                  />
                </details>
                <MappingReview
                  key={`${state.sourceVersion}:${state.mappingVersion}`}
                  documents={state.documents}
                  sources={state.input.files}
                  decisions={state.decisions}
                  disabled={!!state.busy}
                  onDecision={state.decide}
                  onSave={state.saveMapping}
                />
                {state.rows.length > 0 && (
                  <button
                    className="button secondary"
                    disabled={!!state.busy || reviewed === state.rows.length}
                    onClick={state.approvePending}
                  >
                    Mark pending rows reviewed
                  </button>
                )}
                <section
                  className="approval-summary"
                  aria-label="Approval scope"
                >
                  <h3>Approve this mapping version</h3>
                  <p>
                    {reviewed} of {state.rows.length} rows reviewed · {rejected}{" "}
                    rejected · {unresolved} open questions
                  </p>
                  <p>
                    Source v{state.sourceVersion} · mapping v
                    {state.mappingVersion}. Review stays in this browser. Target
                    HSDS profile is unverified.
                  </p>
                  <button
                    className="button primary"
                    disabled={!!state.busy || state.blocked || state.approved}
                    onClick={state.approve}
                  >
                    {state.approved
                      ? "Mapping version approved"
                      : "Approve mapping"}
                  </button>
                  <p className="muted">
                    Editing source or mapping, rejection or a new question
                    invalidates this approval. Running is a separate action.
                  </p>
                </section>
              </div>
            )}
            {state.view === "output" && (
              <>
                <h3>
                  {chosen?.phase === "running"
                    ? "Transformation in progress"
                    : chosen?.phase === "complete"
                      ? "Output received"
                      : "Review the request outcome"}
                </h3>
                <p>
                  {chosen?.message ?? "No transformation request has started."}
                </p>
                <dl className="context-list">
                  <div>
                    <dt>Selected attempt</dt>
                    <dd>{chosen ? `Attempt ${chosen.id}` : "Not run"}</dd>
                  </div>
                  <div>
                    <dt>Submitted versions</dt>
                    <dd>
                      {chosen
                        ? `Source v${chosen.receipt.sourceVersion} · mapping v${chosen.receipt.mappingVersion}`
                        : "Unavailable"}
                    </dd>
                  </div>
                </dl>
                {state.busy === "run" ? (
                  <>
                    <p>
                      The request may still be processing on the server if you
                      leave or stop waiting. Cancellation and recovery endpoints
                      are unavailable.
                    </p>
                    <button className="button secondary" onClick={state.stop}>
                      Stop waiting
                    </button>
                  </>
                ) : (
                  <>
                    <p>
                      Review the returned JSON alongside its input snapshot. If
                      something needs changing, revise the current source or
                      mapping, then approve the new version and run again.
                    </p>
                    <button
                      className="button secondary"
                      disabled={!state.input}
                      onClick={() => state.setView("mapping")}
                    >
                      Review current mapping
                    </button>
                  </>
                )}
                <section className="next-action">
                  <h3>Run the current reviewed inputs</h3>
                  <p>
                    Source v{state.sourceVersion} · mapping v
                    {state.mappingVersion}
                  </p>
                  <button
                    className="button primary"
                    disabled={!state.canRun}
                    onClick={() => void state.run()}
                  >
                    {state.attempts
                      ? "Run transformation again"
                      : "Run transformation"}
                  </button>
                  {!state.approved && (
                    <p>
                      Review and approve the current mapping before running.
                    </p>
                  )}
                </section>
              </>
            )}
            {state.changes.length > 0 && (
              <details className="revision-history">
                <summary>Reviewed changes ({state.changes.length})</summary>
                {state.changes.map((change, index) => (
                  <section key={index}>
                    <h3>
                      {change.filename} · {change.kind} v{change.version}
                    </h3>
                    <p>Reason: {change.reason}</p>
                    <p>
                      Scope: this file. Earlier submitted inputs remain
                      unchanged; subsequent runs require a new mapping approval.
                    </p>
                    <div className="diff-grid">
                      <div>
                        <strong>Before</strong>
                        <pre>{change.before.slice(0, 10000)}</pre>
                      </div>
                      <div>
                        <strong>After</strong>
                        <pre>{change.after.slice(0, 10000)}</pre>
                      </div>
                    </div>
                  </section>
                ))}
              </details>
            )}
          </Panel>
          <aside className="guide" aria-label="Workflow guidance">
            <svg
              className="mascot"
              viewBox="0 0 150 110"
              role="img"
              aria-label="Open Referral guide"
            >
              <rect
                x="5"
                y="5"
                width="140"
                height="98"
                rx="27"
                fill="#f9f9f9"
                stroke="#5bc19f"
                strokeWidth="3"
              />
              <rect
                x="15"
                y="17"
                width="120"
                height="76"
                rx="16"
                fill="#dbfce5"
                stroke="#5bc19f"
                strokeWidth="2"
              />
              <path d="M16 32h118" stroke="#5bc19f" strokeWidth="2" />
              <ellipse cx="60" cy="54" rx="4" ry="7" fill="#32856b" />
              <ellipse cx="90" cy="54" rx="4" ry="7" fill="#32856b" />
              <path d="M70 71q5 12 10 0" fill="#32856b" />
            </svg>
            <div className="speech">
              {state.view === "intake"
                ? "Let’s see what’s in your source."
                : state.busy === "run"
                  ? "Waiting for the actual transformer."
                  : state.view === "mapping"
                    ? "Check the meaning before you approve."
                    : "Your source and earlier results stay intact."}
            </div>
            <span className="guide-caption">No model connected</span>
          </aside>
          <Panel
            title="Output file"
            meta={chosen ? `Attempt ${chosen.id}` : "Awaiting transformation"}
          >
            <OutputReview
              runs={state.runs}
              selected={state.selectedRun}
              onSelect={state.setSelectedRun}
            />
          </Panel>
        </div>
        {state.view === "mapping" && (
          <section className="action-dock" aria-label="Transformation actions">
            <div>
              <strong>
                {state.approved
                  ? "Reviewed and ready to transform"
                  : "Review before you run"}
              </strong>
              <p>
                Source v{state.sourceVersion} · mapping v{state.mappingVersion}{" "}
                · {reviewed}/{state.rows.length} reviewed
              </p>
            </div>
            <button
              className="button primary"
              disabled={!state.canRun}
              onClick={() => void state.run()}
            >
              {state.attempts
                ? "Run transformation again"
                : "Run transformation"}
            </button>
          </section>
        )}
        <details className="connection-details">
          <summary>Connection and session details</summary>
          <p>
            Configured transformer: <code>{API_URL}</code>
          </p>
          <p>
            {CONTRACT}. Requests use the existing multipart ZIP endpoint. No
            server approval, durable job, diagnostics or saved history is
            implied.
          </p>
          <p>
            120-second browser timeout; at most three explicit attempts per
            source/mapping version and five retained attempts per session. No
            automatic retry. Stopping does not acknowledge server cancellation.
            Reload clears source, review and artifacts.
          </p>
          {state.input?.provenance && <p>Source: {state.input.provenance}</p>}
          {state.runs.length >= 5 && (
            <p className="notice warning">
              Session limit reached. Download useful output before clearing the
              session to continue.
            </p>
          )}
        </details>
      </main>
      <dialog
        ref={dialog}
        aria-labelledby="reset-title"
        onCancel={(event) => {
          event.preventDefault();
          closeReset();
        }}
      >
        <h2 id="reset-title">Clear this session?</h2>
        <p>
          Source files, review decisions, earlier attempts and download links
          will be removed from this browser. Download anything you need first.
        </p>
        {state.busy === "run" && (
          <p>
            Clearing stops waiting, but the server may still be processing.
            Server cancellation is not acknowledged.
          </p>
        )}
        <div className="actions">
          <button className="button secondary" autoFocus onClick={closeReset}>
            Keep working
          </button>
          <button
            className="button danger"
            onClick={() => {
              state.reset();
              closeReset();
              picker.current?.focus();
            }}
          >
            Clear session and files
          </button>
        </div>
      </dialog>
    </>
  );
}
