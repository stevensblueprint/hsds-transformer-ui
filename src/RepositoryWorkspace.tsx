import { useEffect, useRef, useState } from "react";
import { Badge, Panel } from "./ui";
import { API_URL, transformZip, TransformError } from "./integration/adapter";
import { inspectZip } from "./integration/zip";
import { previewJsonOutput } from "./integration/jsonOutput";
import sourceText from "./assets/repository-json/orgs.json?raw";
import mappingText from "./assets/repository-json/orgs_organization_mapping.json?raw";
import sourceUrl from "./assets/repository-json/orgs.json?url&no-inline";
import mappingUrl from "./assets/repository-json/orgs_organization_mapping.json?url&no-inline";
import archiveUrl from "./assets/repository-json/repository-json.zip?url&no-inline";

const revision = "6486294a7aac8fbce1bb4e021fe6e810c1f335df";
const steps = ["source", "mapping", "run", "review", "export"] as const;
type Step = (typeof steps)[number];
const titles: Record<Step, string> = {
  source: "Bring your data into focus",
  mapping: "Review & approve",
  run: "Run your transformation",
  review: "Review the returned output",
  export: "Export with context",
};
const getStep = () =>
  steps.find((step) => `#${step}` === window.location.hash) ?? "source";
const source = JSON.parse(sourceText) as Record<string, unknown>[];
const mapping = JSON.parse(mappingText) as {
  filter: { column: string; value: string };
  mappings: {
    output_path: string;
    input_path: string;
    split?: string;
    strip?: string;
  }[];
};

export default function RepositoryWorkspace() {
  const [step, setStep] = useState<Step>(getStep);
  const [file, setFile] = useState<File | null>(null);
  const [inspected, setInspected] = useState(false);
  const [approved, setApproved] = useState(false);
  const [phase, setPhase] = useState("empty");
  const [notice, setNotice] = useState(
    "Choose the JSON and mapping from the transformer repository. Nothing has been sent.",
  );
  const [artifact, setArtifact] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; text: string }[]>([]);
  const [previewError, setPreviewError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [received, setReceived] = useState(false);
  const busy = useRef(false);
  const operation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const artifactRef = useRef<string | null>(null);
  const mounted = useRef(true);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const navigate = () => {
      if (steps.some((value) => `#${value}` === window.location.hash))
        setStep(getStep());
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  useEffect(() => {
    title.current?.focus();
  }, [step]);
  useEffect(() => {
    mounted.current = true;
    operation.current++;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      if (artifactRef.current) URL.revokeObjectURL(artifactRef.current);
    };
  }, []);
  useEffect(() => {
    if (!artifact) return;
    const timer = setTimeout(
      () => {
        URL.revokeObjectURL(artifact);
        artifactRef.current = null;
        setArtifact(null);
        setPhase("expired");
        setNotice(
          "Local download expired after 15 minutes. No server retention or recovery is implied.",
        );
      },
      15 * 60 * 1000,
    );
    return () => clearTimeout(timer);
  }, [artifact]);
  function navigate(value: Step) {
    window.location.hash = value;
    setStep(value);
  }
  async function choose() {
    if (busy.current) return;
    busy.current = true;
    const id = ++operation.current;
    const abort = new AbortController();
    controller.current = abort;
    setPhase("loading");
    setNotice(
      "Loading the repository archive locally. No backend upload has started.",
    );
    try {
      const response = await fetch(archiveUrl, { signal: abort.signal });
      if (!response.ok)
        throw new Error("Repository archive could not be loaded.");
      const selected = new File(
        [await response.blob()],
        "repository-json.zip",
        { type: "application/zip" },
      );
      await inspectZip(selected, "json");
      if (!mounted.current || id !== operation.current) return;
      setFile(selected);
      setPhase("selected");
      setNotice(
        "Repository JSON selected. Inspect it before approving the supplied mapping; nothing has been uploaded.",
      );
    } catch (error) {
      if (mounted.current && id === operation.current) {
        setPhase("failed");
        setNotice(
          error instanceof Error
            ? error.message
            : "Unable to select repository JSON.",
        );
      }
    } finally {
      if (id === operation.current) {
        busy.current = false;
        controller.current = null;
      }
    }
  }
  function stop() {
    if (!busy.current) return;
    operation.current++;
    busy.current = false;
    controller.current?.abort();
    controller.current = null;
    setPhase("unknown");
    setNotice(
      "Request stopped or timed out. Server status unknown; cancellation is not acknowledged. Check with the backend operator before retrying.",
    );
  }
  async function run() {
    if (busy.current || !file || !approved || attempts >= 3) return;
    busy.current = true;
    const id = ++operation.current;
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => {
      if (mounted.current && id === operation.current) stop();
    }, 120000);
    if (artifactRef.current) URL.revokeObjectURL(artifactRef.current);
    artifactRef.current = null;
    setArtifact(null);
    setPreview([]);
    setReceived(false);
    setPreviewError("");
    setAttempts((value) => value + 1);
    setPhase("running");
    setNotice(
      "Sending JSON ZIP and waiting for the transformer. Separate server stages and percentages are unavailable.",
    );
    navigate("run");
    try {
      const result = await transformZip(file, abort.signal, "json");
      let files: { name: string; text: string }[] = [];
      try {
        files = await previewJsonOutput(result.blob, abort.signal);
      } catch (error) {
        if (abort.signal.aborted) throw error;
        if (mounted.current && id === operation.current)
          setPreviewError(
            error instanceof Error
              ? error.message
              : "Output preview unavailable.",
          );
      }
      if (!mounted.current || id !== operation.current || abort.signal.aborted)
        return;
      const url = URL.createObjectURL(result.blob);
      artifactRef.current = url;
      setArtifact(url);
      setPreview(files);
      setPhase("complete");
      setReceived(true);
      setNotice(
        "HTTP 201 ZIP received from the transformer. Output is available; schema and semantic validation have not run.",
      );
      navigate("review");
    } catch (error) {
      if (mounted.current && id === operation.current) {
        setPhase(error instanceof TransformError ? error.kind : "unknown");
        setNotice(
          error instanceof TransformError
            ? error.message
            : "Request interrupted; server status unknown.",
        );
      }
    } finally {
      clearTimeout(timer);
      if (id === operation.current) {
        busy.current = false;
        controller.current = null;
      }
    }
  }
  const scope = (
    <dl className="context-list">
      <div>
        <dt>Source</dt>
        <dd>orgs.json · 1 organization</dd>
      </div>
      <div>
        <dt>Mapping</dt>
        <dd>orgs_organization_mapping.json</dd>
      </div>
      <div>
        <dt>Repository revision</dt>
        <dd>
          <code>{revision}</code>
        </dd>
      </div>
      <div>
        <dt>Target contract</dt>
        <dd>Existing repository mapping; HSDS profile unverified</dd>
      </div>
    </dl>
  );
  const download = (
    <div className="artifact-card">
      <h3>Transformer output ZIP</h3>
      <p>
        Request attempt {attempts || "—"} · source/mapping revision{" "}
        {revision.slice(0, 7)} · local link expires after 15 minutes or reload.
        Server expiry and run ID unavailable.
      </p>
      {artifact ? (
        <a
          className="button primary"
          href={artifact}
          download="repository-json-output.zip"
        >
          Download transformed ZIP
        </a>
      ) : (
        <p>Download unavailable until a complete ZIP is received.</p>
      )}
    </div>
  );
  return (
    <>
      <div className="workspace-toolbar">
        <div>
          <span className="eyebrow">Dataset workspace</span>
          <strong>{file ? "orgs.json" : "New JSON source"}</strong>
        </div>
        <Badge>Repository JSON · real transformer</Badge>
      </div>
      <div className="mode-banner">
        <span>
          hsds-transformer / data/json_test · repository test fixture · memory
          only; reload clears selection and results.
        </span>
      </div>
      <nav className="workflow-nav" aria-label="Transformation workflow">
        <ol>
          {steps.map((value, index) => (
            <li key={value}>
              <a
                href={`#${value}`}
                aria-label={value.charAt(0).toUpperCase() + value.slice(1)}
                aria-current={step === value ? "step" : undefined}
              >
                <span className="step-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <main id="workspace" tabIndex={-1}>
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              {steps.indexOf(step) + 1} / 5 · {step}
            </p>
            <h1 ref={title} tabIndex={-1}>
              {titles[step]}
            </h1>
          </div>
          <Badge tone={approved ? "approved" : "neutral"}>
            {approved
              ? "Inputs reviewed in this browser"
              : "Input review required"}
          </Badge>
        </div>
        <p role="status" className="session-status" aria-live="polite">
          {notice}
        </p>
        <div className="workspace-grid">
          <Panel
            title={
              step === "source"
                ? "Your file"
                : step === "mapping"
                  ? "Supplied mapping"
                  : step === "run"
                    ? "Transformation"
                    : step === "review"
                      ? "Returned artifacts"
                      : "Export"
            }
            meta={phase}
          >
            {step === "source" && (
              <>
                <h3>Use the JSON from the main repository</h3>
                <p>
                  <code>orgs.json</code> contains the upstream “Test
                  Organization” record. Its mapping covers IDs, name,
                  description, languages, phones, attributes and tags.
                </p>
                <div className="actions">
                  <button
                    className="button primary"
                    disabled={!!file || phase === "loading"}
                    onClick={() => void choose()}
                  >
                    {file ? "Repository JSON selected" : "Use repository JSON"}
                  </button>
                  <a
                    className="button secondary"
                    href={sourceUrl}
                    download="orgs.json"
                  >
                    Download source JSON
                  </a>
                  <a
                    className="button secondary"
                    href={mappingUrl}
                    download="orgs_organization_mapping.json"
                  >
                    Download mapping JSON
                  </a>
                  <a
                    className="text-button"
                    href={archiveUrl}
                    download="repository-json.zip"
                  >
                    Download JSON + mapping ZIP
                  </a>
                </div>
                {file && (
                  <>
                    <p className="notice">
                      {attempts
                        ? "Selected in memory. See Run for the latest request outcome."
                        : "Selected in memory. Upload has not started."}
                    </p>
                    <button
                      className="button secondary"
                      disabled={inspected}
                      onClick={() => {
                        setInspected(true);
                        setNotice(
                          "Source JSON inspected locally. The description is rendered as text, not HTML.",
                        );
                      }}
                    >
                      Inspect source
                    </button>
                    {inspected && (
                      <>
                        <h3 className="section-title">Source JSON</h3>
                        <pre aria-label="Source JSON preview">{sourceText}</pre>
                        <a className="button primary" href="#mapping">
                          Review supplied mapping →
                        </a>
                      </>
                    )}
                  </>
                )}
                <details className="details">
                  <summary>Repository provenance</summary>
                  <a
                    href={`https://github.com/stevensblueprint/hsds-transformer/tree/${revision}/data/json_test`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View original files at the pinned main revision
                  </a>
                  <p>
                    Files are copied unchanged from the repository. This is its
                    test fixture, not partner data.
                  </p>
                </details>
              </>
            )}
            {step === "mapping" && (
              <>
                {!inspected ? (
                  <p className="notice">
                    Select and inspect the repository JSON first.{" "}
                    <a href="#source">Return to Source</a>.
                  </p>
                ) : (
                  <>
                    <p>
                      These are the actual mapping instructions sent to the
                      backend. Filter:{" "}
                      <code>
                        {mapping.filter.column} = {mapping.filter.value}
                      </code>
                      .
                    </p>
                    {mapping.mappings.map((row, index) => (
                      <article className="mapping-card" key={index}>
                        <h3>{row.input_path}</h3>
                        <p className="source-evidence">
                          Source evidence{" "}
                          <code>
                            {row.input_path
                              .split(";")
                              .map((key) =>
                                String(source[0][key] ?? "Unavailable"),
                              )
                              .join("; ")}
                          </code>
                        </p>
                        <dl className="mapping-definition">
                          <dt>Target entity</dt>
                          <dd>organization</dd>
                          <dt>Full target path</dt>
                          <dd>
                            <code>organization.{row.output_path}</code>
                          </dd>
                          <dt>Transformation</dt>
                          <dd>
                            {row.split
                              ? `Split on ${row.split}`
                              : row.strip
                                ? `Strip ${row.strip}`
                                : "Copy supplied values"}
                          </dd>
                        </dl>
                      </article>
                    ))}
                    <p className="notice">
                      Review applies only to these source/mapping bytes at{" "}
                      {revision.slice(0, 7)} in this browser. No backend
                      approval or saved history is implied.
                    </p>
                    <div className="actions">
                      <button
                        className="button primary"
                        disabled={approved || phase === "running"}
                        onClick={() => {
                          setApproved(true);
                          setNotice(
                            "Repository source and mapping reviewed in this browser. Running is a separate action.",
                          );
                        }}
                      >
                        Approve supplied mapping
                      </button>
                      <button
                        className="button secondary"
                        disabled={phase === "running"}
                        onClick={() => {
                          setApproved(false);
                          setNotice(
                            "Mapping rejected for another run. Earlier results, if any, remain from the previously reviewed inputs. Download and revise the mapping for a separate ZIP upload.",
                          );
                        }}
                      >
                        Reject supplied mapping
                      </button>
                      <a className="button secondary" href="#run">
                        Continue to Run →
                      </a>
                    </div>
                  </>
                )}
              </>
            )}
            {step === "run" && (
              <>
                {scope}
                <p>
                  Configured backend: <code>{API_URL}</code>. One request sends{" "}
                  <code>zip_file</code> with <code>input_format=json</code>. No
                  model, durable job or cancellation endpoint is involved.
                </p>
                <ol className="stage-list">
                  <li>
                    Input review:{" "}
                    {approved ? "approved in this browser" : "not approved"}
                  </li>
                  <li>
                    Request:{" "}
                    {phase === "running"
                      ? "in flight; server stage unavailable"
                      : phase}
                  </li>
                  <li>
                    Artifact:{" "}
                    {artifact ? "HTTP 201 ZIP received" : "not available"}
                  </li>
                </ol>
                <button
                  className="button primary"
                  disabled={!approved || phase === "running" || attempts >= 3}
                  onClick={() => void run()}
                >
                  {attempts
                    ? "Retry JSON transformation"
                    : "Run JSON transformation"}
                </button>
                {phase === "running" && (
                  <button className="button secondary" onClick={stop}>
                    Stop waiting
                  </button>
                )}
                <p>
                  120-second browser timeout; stopping the request does not
                  acknowledge server cancellation. Up to three explicit
                  attempts, no automatic retry.
                </p>
              </>
            )}
            {(step === "review" || step === "export") && (
              <>
                {scope}
                <section className="checks" aria-label="Check layers">
                  <h3>What is known</h3>
                  <div className="check-row">
                    Transformation response
                    <Badge tone={received ? "passed" : "neutral"}>
                      {received ? "HTTP 201 ZIP" : "not complete"}
                    </Badge>
                  </div>
                  <div className="check-row">
                    HSDS schema<Badge>not run</Badge>
                  </div>
                  <div className="check-row">
                    Semantic correctness<Badge>unavailable</Badge>
                  </div>
                  <p>
                    No structured validation report or correction service is
                    connected. A completed transformation is not proof of HSDS
                    validity.
                  </p>
                </section>
                {download}
                {step === "review" && (
                  <a className="button secondary" href="#export">
                    Continue to Export →
                  </a>
                )}
              </>
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
              {step === "source"
                ? "Inspect the repository JSON before sending it."
                : step === "mapping"
                  ? "Review the exact source and full target paths."
                  : step === "run"
                    ? "The actual transformer handles this request."
                    : "Inspect the returned JSON. Transformation and validation are different."}
            </div>
            <span className="guide-caption">No model connected</span>
          </aside>
          <Panel
            title="Output file"
            meta={received ? "Backend response" : "No output yet"}
          >
            {preview.length ? (
              preview.map((item) => (
                <section key={item.name}>
                  <h3>{item.name}</h3>
                  <pre
                    className="code-preview"
                    aria-label="Returned JSON preview"
                  >
                    {item.text}
                  </pre>
                </section>
              ))
            ) : (
              <div className="empty-preview">
                <span aria-hidden="true">{"{ }"}</span>
                <h3>Your output will appear here</h3>
                <p>Returned JSON appears after a completed backend response.</p>
              </div>
            )}
            {previewError && (
              <p className="notice warning">
                Preview unavailable: {previewError}. The original ZIP remains
                downloadable.
              </p>
            )}
            {scope}
          </Panel>
        </div>
      </main>
    </>
  );
}
