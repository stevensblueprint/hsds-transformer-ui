import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, checkHealth, transformZip, TransformError } from "./adapter";
import { inspectZip, type ZipInspection } from "./zip";

type Phase =
  | "empty"
  | "inspecting"
  | "ready"
  | "requesting"
  | "complete"
  | "invalid-data"
  | "system-failure"
  | "unknown"
  | "expired";

/** Mount only after the user explicitly selects real ZIP integration. */
export default function RealZipFlow() {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<ZipInspection | null>(null);
  const [phase, setPhase] = useState<Phase>("empty");
  const [message, setMessage] = useState(
    "No file selected. Nothing has been uploaded.",
  );
  const [health, setHealth] = useState("Checking connection…");
  const [artifact, setArtifact] = useState<string | null>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [cancelRequested, setCancelRequested] = useState(false);
  const operation = useRef(0);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const artifactUrl = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const resultStatus = useRef<HTMLParagraphElement>(null);
  const mounted = useRef(true);
  const healthController = useRef<AbortController | null>(null);
  const healthGeneration = useRef(0);

  const reconnect = useCallback(async () => {
    const generation = ++healthGeneration.current;
    healthController.current?.abort();
    const abort = new AbortController();
    healthController.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 5000);
    try {
      const ok = await checkHealth(abort.signal);
      if (mounted.current && generation === healthGeneration.current)
        setHealth(ok ? "Connected (health endpoint only)" : "Disconnected");
    } catch {
      if (mounted.current && generation === healthGeneration.current)
        setHealth("Disconnected");
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    operation.current++;
    void reconnect();
    return () => {
      mounted.current = false;
      controller.current?.abort();
      healthController.current?.abort();
      if (artifactUrl.current) URL.revokeObjectURL(artifactUrl.current);
    };
  }, [reconnect]);

  useEffect(() => {
    if (attempts > 0 && phase !== "requesting" && phase !== "inspecting")
      resultStatus.current?.focus();
  }, [phase, attempts]);

  useEffect(() => {
    if (!artifact) return;
    const timeout = window.setTimeout(
      () => {
        URL.revokeObjectURL(artifact);
        artifactUrl.current = null;
        setArtifact(null);
        setPhase("expired");
        setMessage(
          "The local download link expired after 15 minutes. No server artifact retention or recovery is available.",
        );
      },
      15 * 60 * 1000,
    );
    return () => window.clearTimeout(timeout);
  }, [artifact]);

  function discardArtifact() {
    if (artifactUrl.current) URL.revokeObjectURL(artifactUrl.current);
    artifactUrl.current = null;
    setArtifact(null);
    setLogs(null);
  }

  async function selectFile(selected?: File) {
    if (busy.current || !selected) return;
    const id = ++operation.current;
    discardArtifact();
    setFile(null);
    setInspection(null);
    setPhase("inspecting");
    setMessage("Inspecting archive metadata locally. No upload has started.");
    setAttempts(0);
    setCancelRequested(false);
    try {
      const result = await inspectZip(selected);
      if (!mounted.current || id !== operation.current) return;
      setFile(selected);
      setInspection(result);
      setPhase("ready");
      setMessage(
        "Archive metadata inspected. File contents have not been parsed or validated; nothing has been uploaded.",
      );
    } catch (error) {
      if (!mounted.current || id !== operation.current) return;
      setPhase("invalid-data");
      setMessage(
        error instanceof Error
          ? error.message
          : "Archive inspection failed. Choose another file.",
      );
    }
  }

  function stopWaiting() {
    if (!busy.current) return;
    operation.current++;
    busy.current = false;
    controller.current?.abort();
    controller.current = null;
    setPhase("unknown");
    setMessage(
      "Request stopped or timed out. Server status unknown; it may still be processing. No reconciliation endpoint is available.",
    );
  }

  async function run() {
    if (busy.current || !file || attempts >= 3) return;
    busy.current = true;
    const id = ++operation.current;
    const abort = new AbortController();
    controller.current = abort;
    const timeout = window.setTimeout(() => {
      if (mounted.current && id === operation.current) stopWaiting();
    }, 120000);
    discardArtifact();
    setAttempts((n) => n + 1);
    setCancelRequested(false);
    setPhase("requesting");
    setMessage(
      "Request in flight: uploading and transforming. The API does not expose separate stage progress.",
    );
    try {
      const result = await transformZip(file, abort.signal);
      if (!mounted.current || id !== operation.current) return;
      if (abort.signal.aborted)
        throw new TransformError(
          "Request interrupted. Server status unknown.",
          "unknown",
        );
      const url = URL.createObjectURL(result.blob);
      artifactUrl.current = url;
      setArtifact(url);
      setLogs(result.logs);
      setPhase("complete");
      setMessage(
        "Transformation completed and ZIP received. Schema validation: not run. Semantic checks: unavailable. This is not proof of HSDS validity.",
      );
    } catch (error) {
      if (!mounted.current || id !== operation.current) return;
      setPhase(error instanceof TransformError ? error.kind : "unknown");
      setMessage(
        error instanceof TransformError
          ? error.message
          : "Request interrupted. Server status unknown; it may still be processing.",
      );
    } finally {
      window.clearTimeout(timeout);
      if (id === operation.current) {
        busy.current = false;
        controller.current = null;
      }
    }
  }

  function reset() {
    if (busy.current) return;
    operation.current++;
    discardArtifact();
    setFile(null);
    setInspection(null);
    setPhase("empty");
    setMessage("No file selected. Nothing has been uploaded.");
    setAttempts(0);
    setCancelRequested(false);
    if (input.current) {
      input.current.value = "";
      input.current.focus();
    }
  }

  return (
    <section className="zip-flow" aria-labelledby="zip-title">
      <div className="panel">
        <p className="eyebrow">Real backend integration · ZIP only</p>
        <h2 id="zip-title">Transform an existing archive</h2>
        <p>
          Configured backend: <code>{API_URL}</code>
        </p>
        <p>
          Use synthetic or explicitly permitted files only. The richer mapping,
          approval, reports and history are available in the simulated
          workspace.
        </p>
        <p role="status">{health}</p>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setHealth("Checking connection…");
            void reconnect();
          }}
        >
          Check connection
        </button>
      </div>
      <div
        className="panel"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy.current) void selectFile(e.dataTransfer.files[0]);
        }}
      >
        <h3>1. Choose and inspect locally</h3>
        <p id="zip-requirements">
          ZIP containing source CSVs and mapping CSVs named
          &lt;input_filename&gt;_&lt;object_type&gt;_mapping.csv. Provisional
          browser limits: 10 MiB compressed, 50 MiB expanded, 100 entries, 100:1
          expansion. No encrypted archives, links or unsafe paths. Server safety
          checks remain required.
        </p>
        <label htmlFor="real-zip">Browse ZIP or drop it in this section</label>
        <input
          ref={input}
          id="real-zip"
          type="file"
          accept=".zip,application/zip"
          aria-describedby="zip-requirements"
          disabled={phase === "requesting"}
          onChange={(e) => void selectFile(e.currentTarget.files?.[0])}
        />
        {file && (
          <p>
            Selected: <strong>{file.name}</strong> ·{" "}
            {Math.ceil(file.size / 1024)} KiB · session only
          </p>
        )}
        {inspection && (
          <details>
            <summary>
              Archive inventory ({inspection.entries.length} CSV files; names
              only)
            </summary>
            <ul>
              {inspection.entries.slice(0, 20).map((entry) => (
                <li key={entry.name}>
                  {entry.name} · {entry.expandedBytes} expanded bytes
                </li>
              ))}
            </ul>
            {inspection.entries.length > 20 && (
              <p>
                Preview bounded to 20 file names. No source rows are parsed.
              </p>
            )}
          </details>
        )}
      </div>
      <div className="panel">
        <h3>2. Send ZIP and receive output</h3>
        <p>
          One request; no durable job or recovery endpoint. Returned ZIP is
          capped at a provisional 100 MiB and checked for a readable archive
          envelope, not content validity. No automatic retries. A 120-second
          browser timeout does not stop server work. Reloading or leaving real
          mode loses the file and result, and may interrupt an active request.
        </p>
        <p ref={resultStatus} tabIndex={-1} role="status" aria-live="polite">
          <strong>{phase.replaceAll("-", " ")}:</strong> {message}
        </p>
        {cancelRequested && (
          <p className="notice">
            Cancellation requested by stopping the browser request. Server
            cancellation is not acknowledged; status remains unknown.
          </p>
        )}
        {phase === "unknown" && (
          <p className="notice">
            Check with the backend operator before retrying: the earlier request
            may still be running. Checking connection only checks health and
            cannot reconcile that request.
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            className="button primary"
            disabled={
              !file ||
              phase === "requesting" ||
              attempts >= 3 ||
              phase === "complete"
            }
            onClick={() => void run()}
          >
            {attempts ? "Retry transformation" : "Upload ZIP and transform"}
          </button>
          {phase === "requesting" && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setCancelRequested(true);
                stopWaiting();
              }}
            >
              Stop waiting (request cancellation)
            </button>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={phase === "requesting"}
            onClick={reset}
          >
            Clear selection
          </button>
        </div>
        {attempts >= 3 && (
          <p>
            Three explicit attempts reached. Review the failure with the backend
            operator before selecting the source again.
          </p>
        )}
        {artifact && (
          <div className="notice">
            <h3>Transformation artifact</h3>
            <p>
              Request-scoped result · {file?.name} · backend
              run/version/contract: unavailable. Schema: not run; interface
              validation: not run; semantic correctness: unavailable. Local
              download expires after 15 minutes or when this mode closes; server
              expiry is unknown.
            </p>
            <a
              className="button primary"
              href={artifact}
              download="transformed-output.zip"
            >
              Download transformed ZIP
            </a>
          </div>
        )}
        {phase === "complete" && (
          <details>
            <summary>Backend log output (untrusted text)</summary>
            <pre>
              {logs ||
                "No log output returned or exposed by CORS. No structured diagnostic evidence is available."}
            </pre>
          </details>
        )}
      </div>
    </section>
  );
}
