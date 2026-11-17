import type { ReactNode } from "react";
import type { Finding, Run, WorkflowState } from "./workflow/model";
import { isApprovalCurrent } from "./workflow/reducer";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span aria-hidden="true">
        {["approved", "passed"].includes(tone)
          ? "✓"
          : ["error", "failed", "unsupported"].includes(tone)
            ? "!"
            : "·"}
      </span>{" "}
      {children}
    </span>
  );
}
export function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {meta && <span>{meta}</span>}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}
export function Guide({ state }: { state: WorkflowState }) {
  const messages = {
    source: "Start with a small sample. Inspection comes before approval.",
    mapping:
      "A clarification helps explain a field. It does not approve the mapping.",
    run: "You decide when to run. Approval and processing are separate.",
    review:
      "Look at the evidence before changing a value. Your original stays intact.",
    export: "A completed transformation alone does not prove validity.",
  };
  return (
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
        <path
          d="M16 32h118M111 24h6m5-3 6 6m0-6-6 6"
          stroke="#5bc19f"
          strokeWidth="2"
        />
        <ellipse cx="60" cy="54" rx="4" ry="7" fill="#32856b" />
        <ellipse cx="90" cy="54" rx="4" ry="7" fill="#32856b" />
        <path d="M70 71q5 12 10 0" fill="#32856b" />
      </svg>
      <div className="speech">{messages[state.step]}</div>
      <span className="guide-caption">
        Scripted demo guide
        <br />
        No AI or model calls
      </span>
    </aside>
  );
}
export function Context({ state, run }: { state: WorkflowState; run?: Run }) {
  return (
    <dl className="context-list">
      <div>
        <dt>Source</dt>
        <dd>
          {run
            ? `v${run.sourceVersion}`
            : state.source
              ? `v${state.source.version}`
              : "Not selected"}
        </dd>
      </div>
      <div>
        <dt>Mapping</dt>
        <dd>v{run?.mappingVersion ?? state.mappingVersion}</dd>
      </div>
      <div>
        <dt>Target contract</dt>
        <dd>{run?.contractVersion ?? state.contractVersion}</dd>
      </div>
      <div>
        <dt>Run</dt>
        <dd>{run?.id ?? "Not run"}</dd>
      </div>
    </dl>
  );
}
export function Output({ state, run }: { state: WorkflowState; run?: Run }) {
  return (
    <Panel title="Output file" meta={run?.id ?? "Sample preview"}>
      <Badge tone={isApprovalCurrent(state) ? "approved" : "neutral"}>
        {isApprovalCurrent(state)
          ? "Current mapping approved"
          : state.approval
            ? "Approval stale"
            : "Not approved"}
      </Badge>
      <p className="muted">
        Destination preview from current proposals or frozen run mappings. Demo
        paths are not an agreed HSDS profile. A preview does not establish
        full-dataset correctness.
      </p>
      {run || state.source?.inspected ? (
        <pre className="code-preview" aria-label="Synthetic output sample">
          {JSON.stringify(
            {
              simulated: true,
              kind: "Reviewed destination preview, not transformed HSDS",
              mappings: (run?.mappings ?? state.mappings)
                .filter(
                  (row) =>
                    row.decision === "approved" || row.decision === "proposed",
                )
                .map((row) => ({
                  source: row.sourceField,
                  targetPaths: row.targetPaths,
                  transformation: row.transformation,
                  sample:
                    row.id === "phone"
                      ? (run?.correctionAfter ?? row.evidence)
                      : row.evidence,
                })),
            },
            null,
            2,
          )}
        </pre>
      ) : (
        <div className="empty-preview">
          <span aria-hidden="true">{"{ }"}</span>
          <h3>Your output will appear here</h3>
          <p>
            Inspect the synthetic source to explore the sample. Nothing is
            uploaded.
          </p>
        </div>
      )}
      <Context state={state} run={run} />
    </Panel>
  );
}
export function Evidence({ finding }: { finding: Finding }) {
  const values = [
    ["Check layer", finding.layer],
    ["Code", finding.code],
    ["Severity", finding.severity],
    ["Stage", finding.stage],
    ["Rule", finding.rule],
    ["Entity / record", finding.entity],
    ["Source file", finding.sourceFile],
    ["Source row", finding.sourceRow?.toString()],
    ["Source field", finding.sourceField],
    ["Target path", finding.targetPath],
    ["Evidence", finding.evidence],
  ];
  return (
    <dl className="evidence-list">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? "Unavailable — not supplied"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Checks({ run }: { run: Run }) {
  return (
    <section className="checks" aria-label="Check layers">
      <h3>What was checked</h3>
      {run.checks.map((check) => (
        <div key={check.name} className="check-row">
          <div>
            <strong>{check.name}</strong>
            <p>{check.detail}</p>
          </div>
          <Badge tone={check.status}>{check.status}</Badge>
        </div>
      ))}
    </section>
  );
}
