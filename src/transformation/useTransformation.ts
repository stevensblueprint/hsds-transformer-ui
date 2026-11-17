import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { transformZip, TransformError } from "../integration/adapter";
import { previewJsonOutput } from "../integration/jsonOutput";
import { prepareInput, rebuildInput } from "./input";
import { parseMappings } from "./mapping";
import type {
  Decision,
  PreparedInput,
  ReviewReceipt,
  RunRecord,
} from "./model";

export const CONTRACT =
  "Backend mapping syntax @6486294 · HSDS profile unverified";
const receiptMatches = (a: ReviewReceipt | null, b: ReviewReceipt) =>
  a?.sourceVersion === b.sourceVersion &&
  a.mappingVersion === b.mappingVersion &&
  a.contractVersion === b.contractVersion;
export interface MappingChange {
  kind: "source" | "mapping";
  filename: string;
  before: string;
  after: string;
  reason: string;
  version: number;
}

export function useTransformation() {
  const [input, setInput] = useState<PreparedInput | null>(null);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [sourceVersion, setSourceVersion] = useState(0);
  const [mappingVersion, setMappingVersion] = useState(1);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [sourceEditing, setSourceEditing] = useState(false);
  const [receipt, setReceipt] = useState<ReviewReceipt | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [changes, setChanges] = useState<MappingChange[]>([]);
  const [view, setView] = useState<"intake" | "mapping" | "output">("intake");
  const [busy, setBusy] = useState<"inspect" | "save" | "run" | null>(null);
  const [notice, setNotice] = useState(
    "Add your source and mapping files, or choose a ZIP containing both.",
  );
  const [error, setError] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const urls = useRef(new Set<string>());
  const runCounter = useRef(0);
  const activeRun = useRef<number | null>(null);
  useEffect(() => {
    mounted.current = true;
    generation.current++;
    const artifacts = urls.current;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      for (const url of artifacts) URL.revokeObjectURL(url);
      artifacts.clear();
    };
  }, []);
  useEffect(() => {
    const live = runs.filter((run) => run.url && run.expiresAt);
    if (!live.length) return;
    const timer = setTimeout(
      () => {
        setRuns((current) =>
          current.map((run) => {
            if (!run.url || !run.expiresAt || run.expiresAt > Date.now())
              return run;
            URL.revokeObjectURL(run.url);
            urls.current.delete(run.url);
            return {
              ...run,
              url: undefined,
              message: `${run.message} Local download expired; server retention is unavailable.`,
            };
          }),
        );
      },
      Math.max(0, Math.min(...live.map((run) => run.expiresAt!)) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [runs]);
  const documents = useMemo(
    () => (input ? parseMappings(input.files, input.format) : []),
    [input],
  );
  const rows = documents.flatMap((doc) => doc.rows);
  const blocked =
    sourceEditing ||
    !input ||
    !rows.length ||
    documents.some((doc) => doc.error) ||
    rows.some((row) => (decisions[row.id] ?? "pending") !== "approved");
  const currentScope: ReviewReceipt = {
    sourceVersion,
    mappingVersion,
    contractVersion: CONTRACT,
  };
  const approved = !blocked && receiptMatches(receipt, currentScope);
  const attempts = runs.filter(
    (run) =>
      run.receipt.sourceVersion === sourceVersion &&
      run.receipt.mappingVersion === mappingVersion,
  ).length;
  const canRun = approved && !busy && attempts < 3 && runs.length < 5;

  function addFiles(files: File[]) {
    if (busyRef.current) return;
    if (!files.length) return;
    if (
      files.length +
        (files.some((file) => file.name.toLowerCase().endsWith(".zip"))
          ? 0
          : draftFiles.length) >
      100
    ) {
      setError(true);
      setNotice(
        "Choose no more than 100 files. The earlier selection is unchanged.",
      );
      return;
    }
    setInput(null);
    setSourceEditing(false);
    setReceipt(null);
    setDecisions({});
    setChanges([]);
    setDraftFiles((current) =>
      files.some((file) => file.name.toLowerCase().endsWith(".zip"))
        ? files
        : [
            ...current.filter(
              (file) => !file.name.toLowerCase().endsWith(".zip"),
            ),
            ...files,
          ],
    );
    setView("intake");
    setError(false);
    setNotice(
      "Files selected in this browser. Inspect them before reviewing the mapping; nothing has been uploaded.",
    );
  }
  function removeFile(index: number) {
    if (busyRef.current) return;
    setDraftFiles((files) => files.filter((_, i) => i !== index));
    setInput(null);
    setDecisions({});
    setChanges([]);
    setSourceEditing(false);
    setReceipt(null);
    setError(false);
  }
  async function inspect(files = draftFiles, provenance?: string) {
    if (busyRef.current || !files.length) return;
    busyRef.current = true;
    const id = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy("inspect");
    setError(false);
    setReceipt(null);
    setNotice(
      "Inspecting files locally. No transformation request has started.",
    );
    try {
      const prepared = await prepareInput(files, abort.signal);
      if (!mounted.current || id !== generation.current) return;
      setInput({ ...prepared, provenance });
      setDraftFiles(files);
      setSourceVersion((version) => version + 1);
      setMappingVersion(1);
      setSourceEditing(false);
      setDecisions({});
      setChanges([]);
      setView("mapping");
      setNotice(
        "Source inspected. Review the supplied mapping and resolve questions before approving this version.",
      );
    } catch (cause) {
      if (mounted.current && id === generation.current) {
        setError(true);
        setNotice(
          cause instanceof Error
            ? cause.message
            : "Unable to inspect these files.",
        );
      }
    } finally {
      if (id === generation.current) {
        busyRef.current = false;
        controller.current = null;
        setBusy(null);
      }
    }
  }
  function decide(id: string, decision: Decision) {
    if (busyRef.current || !rows.some((row) => row.id === id)) return;
    setDecisions((current) => ({ ...current, [id]: decision }));
    setReceipt(null);
    setError(false);
    setNotice(
      decision === "unresolved"
        ? "Question recorded for human review. Answering it will not approve the mapping."
        : "Review decision updated. Approve the complete current mapping separately before running.",
    );
  }
  function approvePending() {
    if (busyRef.current) return;
    setDecisions((current) =>
      Object.fromEntries(
        rows.map((row) => [
          row.id,
          !current[row.id] || current[row.id] === "pending"
            ? "approved"
            : current[row.id],
        ]),
      ),
    );
    setReceipt(null);
    setNotice(
      "Pending supplied rows marked reviewed. Rejected or unanswered rows still need attention. Approve this mapping version separately.",
    );
  }
  function approve() {
    if (busyRef.current || blocked) return;
    setReceipt(currentScope);
    setError(false);
    setNotice(
      `Source v${sourceVersion} and mapping v${mappingVersion} approved in this browser. Run transformation is a separate action.`,
    );
  }
  async function saveMapping(
    filename: string,
    text: string,
    reason = "User-reviewed mapping revision",
  ) {
    if (busyRef.current || !input) return false;
    const original = input.files.find((file) => file.name === filename);
    if (!original || original.text === text) return false;
    busyRef.current = true;
    const id = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy("save");
    setReceipt(null);
    setError(false);
    setNotice(
      "Preparing the revised mapping locally. The original source and earlier results are retained.",
    );
    try {
      const revised = await rebuildInput(
        input,
        { [filename]: text },
        abort.signal,
      );
      const parsed = parseMappings(revised.files, revised.format);
      if (parsed.some((doc) => doc.error))
        throw new Error(parsed.find((doc) => doc.error)!.error);
      if (!mounted.current || id !== generation.current) return false;
      setInput(revised);
      setDraftFiles(revised.files.map((file) => file.file));
      setMappingVersion((version) => version + 1);
      setChanges((current) => [
        ...current,
        {
          kind: "mapping",
          filename,
          before: original.text ?? "Unavailable",
          after: text,
          reason,
          version: mappingVersion + 1,
        },
      ]);
      setDecisions({});
      setNotice(
        "Mapping revised. Earlier approval is stale; review all current rows and approve again before a new run.",
      );
      return true;
    } catch (cause) {
      if (mounted.current && id === generation.current) {
        setError(true);
        setNotice(
          cause instanceof Error
            ? cause.message
            : "Unable to save this mapping.",
        );
      }
      return false;
    } finally {
      if (id === generation.current) {
        busyRef.current = false;
        controller.current = null;
        setBusy(null);
      }
    }
  }
  async function saveSource(filename: string, text: string, reason: string) {
    if (busyRef.current || !input || !reason.trim()) return false;
    const original = input.files.find((file) => file.name === filename);
    if (
      !original ||
      original.text === text ||
      /_mapping\.(csv|json)$/i.test(filename)
    )
      return false;
    busyRef.current = true;
    const id = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy("save");
    setReceipt(null);
    setError(false);
    setNotice(
      "Preparing the approved source correction locally. Earlier inputs and output stay unchanged.",
    );
    try {
      const files = input.files.map((file) =>
        file.name === filename
          ? new File([text], filename, { type: "application/octet-stream" })
          : file.file,
      );
      const revised = await prepareInput(files, abort.signal);
      if (!mounted.current || id !== generation.current) return false;
      setInput({ ...revised, provenance: input.provenance });
      setDraftFiles(revised.files.map((file) => file.file));
      setSourceVersion((version) => version + 1);
      setSourceEditing(false);
      setDecisions({});
      setChanges((current) => [
        ...current,
        {
          kind: "source",
          filename,
          before: original.text ?? "Unavailable",
          after: text,
          reason,
          version: sourceVersion + 1,
        },
      ]);
      setNotice(
        "Source correction saved as a new local version. Original source is retained in the change review and earlier runs. Review and approve the mapping again.",
      );
      return true;
    } catch (cause) {
      if (mounted.current && id === generation.current) {
        setError(true);
        setNotice(
          cause instanceof Error
            ? cause.message
            : "Unable to save this source correction.",
        );
      }
      return false;
    } finally {
      if (id === generation.current) {
        busyRef.current = false;
        controller.current = null;
        setBusy(null);
      }
    }
  }
  const stop = useCallback(() => {
    if (!busyRef.current || activeRun.current === null) return;
    ++generation.current;
    controller.current?.abort();
    controller.current = null;
    busyRef.current = false;
    const id = activeRun.current;
    activeRun.current = null;
    setBusy(null);
    setRuns((current) =>
      current.map((run) =>
        run.id === id
          ? {
              ...run,
              phase: "unknown",
              message:
                "Stopped waiting or timed out. Server status unknown; cancellation is not acknowledged. Check with the backend operator before retrying.",
            }
          : run,
      ),
    );
    setNotice(
      "Server status unknown. Stopping the browser request does not acknowledge cancellation.",
    );
    setError(true);
  }, []);
  async function run() {
    if (busyRef.current || !canRun || !input || !receipt) return;
    busyRef.current = true;
    const id = ++generation.current;
    const runId = ++runCounter.current;
    const abort = new AbortController();
    controller.current = abort;
    activeRun.current = runId;
    const timer = setTimeout(() => {
      if (mounted.current && id === generation.current) stop();
    }, 120000);
    const record: RunRecord = {
      id: runId,
      inputSnapshot: input,
      receipt: { ...receipt },
      inputName: input.name,
      format: input.format,
      phase: "running",
      message:
        "Request in flight. The backend does not expose separate stages or percentage progress.",
      preview: [],
    };
    setRuns((current) => [...current, record]);
    setSelectedRun(runId);
    setView("output");
    setBusy("run");
    setError(false);
    setNotice(
      "Sending the reviewed source and mapping to the displayed transformer.",
    );
    try {
      const result = await transformZip(
        input.archive,
        abort.signal,
        input.format,
      );
      let preview: RunRecord["preview"] = [];
      let previewError: string | undefined;
      try {
        preview = await previewJsonOutput(result.blob, abort.signal);
      } catch (cause) {
        if (abort.signal.aborted) throw cause;
        previewError =
          cause instanceof Error ? cause.message : "JSON preview unavailable.";
      }
      if (!mounted.current || id !== generation.current || abort.signal.aborted)
        return;
      const url = URL.createObjectURL(result.blob);
      urls.current.add(url);
      setRuns((current) =>
        current.map((run) =>
          run.id === runId
            ? {
                ...run,
                phase: "complete",
                message:
                  "HTTP 201 ZIP received. HSDS schema checks have not run; semantic correctness is unavailable.",
                url,
                expiresAt: Date.now() + 15 * 60 * 1000,
                preview,
                previewError,
                logs: result.logs,
              }
            : run,
        ),
      );
      setNotice(
        "Transformation returned an artifact. Review the actual output and check context before downloading.",
      );
    } catch (cause) {
      if (mounted.current && id === generation.current) {
        const phase = cause instanceof TransformError ? cause.kind : "unknown";
        const message =
          cause instanceof TransformError
            ? cause.message
            : "Request interrupted; server status unknown.";
        setRuns((current) =>
          current.map((run) =>
            run.id === runId ? { ...run, phase, message } : run,
          ),
        );
        setNotice(message);
        setError(true);
      }
    } finally {
      clearTimeout(timer);
      if (id === generation.current) {
        busyRef.current = false;
        controller.current = null;
        activeRun.current = null;
        setBusy(null);
      }
    }
  }
  function downloadInputs() {
    if (!input || busyRef.current) return;
    const url = URL.createObjectURL(input.archive);
    urls.current.add(url);
    const link = document.createElement("a");
    link.href = url;
    link.download = `source-v${sourceVersion}-mapping-v${mappingVersion}-inputs.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
    }, 1000);
  }
  function reset() {
    ++generation.current;
    controller.current?.abort();
    controller.current = null;
    activeRun.current = null;
    busyRef.current = false;
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
    setInput(null);
    setSourceEditing(false);
    setDraftFiles([]);
    setReceipt(null);
    setDecisions({});
    setRuns([]);
    setSelectedRun(null);
    setChanges([]);
    setBusy(null);
    setView("intake");
    setError(false);
    setNotice("Session cleared. Add your source and mapping files to begin.");
  }
  return {
    input,
    sourceEditing,
    setSourceEditing: (value: boolean) => {
      setSourceEditing(value);
      if (value) setReceipt(null);
    },
    draftFiles,
    sourceVersion,
    mappingVersion,
    decisions,
    receipt,
    runs,
    selectedRun,
    changes,
    view,
    busy,
    notice,
    error,
    documents,
    rows,
    blocked,
    approved,
    canRun,
    attempts,
    currentScope,
    addFiles,
    removeFile,
    inspect,
    decide,
    approvePending,
    approve,
    saveMapping,
    saveSource,
    stop,
    run,
    reset,
    downloadInputs,
    setView,
    setSelectedRun,
  };
}
export type Transformation = ReturnType<typeof useTransformation>;
