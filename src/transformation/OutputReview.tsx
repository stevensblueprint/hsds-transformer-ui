import { Badge } from "../ui";
import type { RunRecord } from "./model";

export default function OutputReview({
  runs,
  selected,
  onSelect,
}: {
  runs: RunRecord[];
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const run = runs.find((item) => item.id === selected) ?? runs.at(-1);
  const previous = run
    ? runs
        .filter((item) => item.id < run.id && item.phase === "complete")
        .at(-1)
    : undefined;
  return (
    <>
      {!run ? (
        <div className="empty-preview">
          <span aria-hidden="true">{"{ }"}</span>
          <h3>Your output will appear here</h3>
          <p>
            Review the source and mapping, then run the transformation to see
            the returned JSON.
          </p>
        </div>
      ) : (
        <>
          <label htmlFor="result-selection">Transformation result</label>
          <select
            id="result-selection"
            value={run.id}
            onChange={(event) => onSelect(Number(event.target.value))}
          >
            {runs.map((item) => (
              <option key={item.id} value={item.id}>
                Attempt {item.id} · source v{item.receipt.sourceVersion} /
                mapping v{item.receipt.mappingVersion} · {item.phase}
              </option>
            ))}
          </select>
          <div className="result-meta">
            <Badge
              tone={
                run.phase === "complete"
                  ? "approved"
                  : run.phase === "running"
                    ? "neutral"
                    : "warning"
              }
            >
              {run.phase === "complete"
                ? "Artifact received"
                : run.phase.replaceAll("-", " ")}
            </Badge>
            <span>Attempt {run.id}</span>
          </div>
          <p className={run.phase === "complete" ? "notice" : "notice warning"}>
            {run.message}
          </p>
          {run.phase === "running" && (
            <div
              className="waiting-indicator"
              aria-label="Waiting for transformer"
            >
              <span aria-hidden="true" /> Waiting for the transformer response
            </div>
          )}
          {run.preview.map((file) => (
            <section key={file.name}>
              <h3>{file.name}</h3>
              <pre
                className="code-preview"
                aria-label={`Returned JSON: ${file.name}`}
              >
                {file.text}
              </pre>
            </section>
          ))}
          {run.previewError && (
            <p className="notice warning">
              Preview unavailable: {run.previewError}. The original ZIP remains
              available until its local link expires.
            </p>
          )}
          {run.phase === "complete" &&
            !run.preview.length &&
            !run.previewError && (
              <p>
                No JSON files were available in the bounded preview. Inspect the
                original ZIP.
              </p>
            )}
          <section className="checks" aria-label="Checks and export context">
            <h3>What was checked</h3>
            <div className="check-row">
              Transformation response
              <Badge tone={run.phase === "complete" ? "passed" : "neutral"}>
                {run.phase === "complete"
                  ? "HTTP 201 ZIP"
                  : run.phase === "running"
                    ? "waiting"
                    : "not confirmed"}
              </Badge>
            </div>
            <div className="check-row">
              HSDS schema<Badge>not run</Badge>
            </div>
            <div className="check-row">
              Semantic correctness<Badge>unavailable</Badge>
            </div>
            <p>
              A completed transformation does not establish HSDS validity. No
              structured diagnostic report or model service is connected.
            </p>
          </section>
          <dl className="context-list">
            <div>
              <dt>Input</dt>
              <dd>{run.inputName}</dd>
            </div>
            <div>
              <dt>Reviewed versions</dt>
              <dd>
                Source v{run.receipt.sourceVersion} · mapping v
                {run.receipt.mappingVersion}
              </dd>
            </div>
            <div>
              <dt>Target contract</dt>
              <dd>{run.receipt.contractVersion}</dd>
            </div>
            <div>
              <dt>Server run ID / retention</dt>
              <dd>Unavailable; attempt IDs are local to this session</dd>
            </div>
          </dl>
          {run.url ? (
            <div className="export-actions">
              <a
                className="button primary"
                href={run.url}
                download={`transformation-${run.id}.zip`}
              >
                Download output ZIP
              </a>
              <p>
                Local link expires 15 minutes after receipt or when this session
                is cleared/reloaded.
              </p>
            </div>
          ) : (
            run.phase === "complete" && (
              <p className="notice warning">
                Download expired. Earlier response and preview remain recorded
                in this session.
              </p>
            )
          )}
          {run.logs && (
            <details>
              <summary>Backend response details</summary>
              <pre>{run.logs}</pre>
              <p>Unstructured response details; not a validation report.</p>
            </details>
          )}
          {previous && (
            <details className="comparison">
              <summary>Compare with attempt {previous.id}</summary>
              <p>
                Comparing bounded returned JSON previews only. Diagnostics,
                resolved/new finding counts and full-artifact equality are
                unavailable.
              </p>
              {previous.receipt.sourceVersion !== run.receipt.sourceVersion && (
                <p className="notice warning">
                  Source versions differ. Changed previews do not establish
                  resolved findings or equivalent records.
                </p>
              )}
              {!previous.preview.length || !run.preview.length ? (
                <p>
                  Comparison unavailable: both attempts need usable JSON
                  previews.
                </p>
              ) : (
                <ul>
                  {[
                    ...new Set([
                      ...previous.preview.map((file) => file.name),
                      ...run.preview.map((file) => file.name),
                    ]),
                  ].map((name) => {
                    const before = previous.preview.find(
                      (file) => file.name === name,
                    );
                    const after = run.preview.find(
                      (file) => file.name === name,
                    );
                    return (
                      <li key={name}>
                        <strong>{name}</strong>:{" "}
                        {!before
                          ? "new in preview"
                          : !after
                            ? "not present in current preview; full output not assessed"
                            : before.text === after.text
                              ? "same visible preview; full equality not established"
                              : "visible preview changed; record matching unverified"}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="diff-grid">
                <div>
                  <h3>Earlier attempt {previous.id}</h3>
                  <pre>
                    {previous.preview[0]?.text ?? "Preview unavailable"}
                  </pre>
                </div>
                <div>
                  <h3>Current attempt {run.id}</h3>
                  <pre>{run.preview[0]?.text ?? "Preview unavailable"}</pre>
                </div>
              </div>
            </details>
          )}
          <details>
            <summary>Submitted source and mapping</summary>
            <p>
              Immutable browser snapshot for attempt {run.id}.{" "}
              {run.inputSnapshot.provenance ?? "User-supplied files"}
            </p>
            {run.inputSnapshot.files.map((file) => (
              <details key={file.name}>
                <summary>{file.name}</summary>
                <pre>
                  {file.text?.slice(0, 10000) ??
                    "Text inspection unavailable; original bytes retained in memory."}
                </pre>
              </details>
            ))}
          </details>
        </>
      )}
    </>
  );
}
