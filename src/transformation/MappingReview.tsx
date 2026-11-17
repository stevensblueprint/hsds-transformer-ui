import { useEffect, useRef, useState } from "react";
import { Badge } from "../ui";
import type { Decision, InputFile, MappingDocument, MappingRow } from "./model";
import {
  reviseMapping,
  sourceEvidence,
  transformationDescription,
  validateMappingText,
} from "./mapping";

type Save = (
  filename: string,
  text: string,
  reason?: string,
) => boolean | void | Promise<boolean | void>;
interface Props {
  documents: MappingDocument[];
  sources: InputFile[];
  decisions: Record<string, Decision>;
  disabled: boolean;
  onDecision: (id: string, decision: Decision) => void;
  onSave: Save;
}
const decisionLabel = {
  pending: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
  unresolved: "Needs attention",
};

function ReviewRow({
  document,
  row,
  sources,
  decision,
  disabled,
  onDecision,
  onSave,
}: {
  document: MappingDocument;
  row: MappingRow;
  sources: InputFile[];
  decision: Decision;
  disabled: boolean;
  onDecision: Props["onDecision"];
  onSave: Save;
}) {
  const [mode, setMode] = useState<"edit" | "question" | "answer" | null>(null);
  const [draft, setDraft] = useState(row);
  const [reason, setReason] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [entry, setEntry] = useState("");
  const [error, setError] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const questionButton = useRef<HTMLButtonElement>(null);
  const previous = useRef<Decision>("pending");
  const saving = useRef(false);
  const restoreFocus = useRef<"edit" | "question" | null>(null);
  useEffect(() => {
    if (mode !== null || !restoreFocus.current) return;
    (restoreFocus.current === "edit"
      ? editButton
      : questionButton
    ).current?.focus();
    restoreFocus.current = null;
  }, [mode]);
  const label = `${row.inputPath} in ${document.filename}, row ${Number(row.id.slice(row.id.lastIndexOf("#") + 1)) + 1}`;
  const target = `${document.entity}.${row.outputPath}`;
  function begin(next: "edit" | "question" | "answer") {
    previous.current = decision;
    setMode(next);
    setDraft(row);
    setReason("");
    setEntry(next === "question" ? question : answer);
    setError("");
    onDecision(row.id, "unresolved");
  }
  function close(restore = false) {
    if (restore) onDecision(row.id, previous.current);
    restoreFocus.current = mode === "edit" ? "edit" : "question";
    setMode(null);
    setError("");
  }
  async function save() {
    if (saving.current) return;
    if (!reason.trim()) {
      setError("Add a reason for this mapping change.");
      return;
    }
    try {
      const text = reviseMapping(document, row, draft);
      if (
        text === document.text ||
        (draft.inputPath === row.inputPath &&
          draft.outputPath === row.outputPath &&
          (draft.split ?? "") === (row.split ?? "") &&
          (draft.strip ?? "") === (row.strip ?? ""))
      ) {
        setError(
          "Change a mapping instruction before saving, or cancel editing.",
        );
        return;
      }
      saving.current = true;
      const saved = await onSave(document.filename, text, reason.trim());
      if (saved === false) {
        setError(
          "Mapping could not be saved. Check the workspace status and revise the draft.",
        );
        return;
      }
      close();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Mapping change could not be saved.",
      );
    } finally {
      saving.current = false;
    }
  }
  return (
    <article className="mapping-card" aria-label={`Review ${label} mapping`}>
      <details>
        <summary className="mapping-summary">
          <strong>{row.inputPath}</strong>
          {" → "}
          <code>{target}</code>{" "}
          <Badge tone={decision === "pending" ? "neutral" : decision}>
            {decisionLabel[decision]}
          </Badge>
        </summary>
        <div className="mapping-detail">
          <p className="source-evidence">
            <strong>Source evidence · first record</strong>
            <br />
            <code>{sourceEvidence(document, row, sources)}</code>
          </p>
          <dl className="mapping-definition">
            <dt>Source file</dt>
            <dd>{document.sourceFile}</dd>
            <dt>Target entity</dt>
            <dd>{document.entity}</dd>
            <dt>Full target path</dt>
            <dd>
              <code>{target}</code>
            </dd>
            <dt>Transformation</dt>
            <dd>{transformationDescription(document, row)}</dd>
          </dl>
          {question && (
            <div className="notice">
              <strong>Review question</strong>
              <p>{question}</p>
              <strong>Answer</strong>
              <p>{answer || "Unanswered — mapping approval is blocked."}</p>
              <p className="muted">
                Local review notes only. No model or message is sent. An answer
                still requires explicit approval.
              </p>
            </div>
          )}
          {!mode && (
            <div className="actions">
              <button
                className="button small primary"
                disabled={
                  disabled || decision === "approved" || (!!question && !answer)
                }
                aria-label={`Approve ${label} mapping`}
                onClick={() => onDecision(row.id, "approved")}
              >
                Approve
              </button>
              <button
                className="button small secondary"
                disabled={disabled || decision === "rejected"}
                aria-label={`Reject ${label} mapping`}
                onClick={() => onDecision(row.id, "rejected")}
              >
                Reject
              </button>
              <button
                ref={editButton}
                className="button small secondary"
                disabled={disabled}
                aria-label={`Edit ${label} mapping`}
                onClick={() => begin("edit")}
              >
                Edit
              </button>
              <button
                ref={questionButton}
                className="text-button"
                disabled={disabled}
                aria-label={`${question ? "Answer question about" : "Question about"} ${label}`}
                onClick={() => begin(question ? "answer" : "question")}
              >
                {question ? "Answer question" : "Ask a review question"}
              </button>
            </div>
          )}
          {mode === "edit" && (
            <form
              className="mapping-editor"
              aria-label={`Edit ${label}`}
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <p className="notice warning">
                Saving creates a mapping version and requires renewed review.
                The original source and earlier run stay unchanged.
              </p>
              <label>
                Source field(s)
                <input
                  autoFocus
                  value={draft.inputPath}
                  disabled={disabled}
                  onChange={(event) =>
                    setDraft({ ...draft, inputPath: event.target.value })
                  }
                  required
                />
              </label>
              <p className="muted">
                Use semicolons for multiple source fields, as in the supplied
                mapping.
              </p>
              <label>
                Target path within {document.entity}
                <input
                  value={draft.outputPath}
                  disabled={disabled}
                  onChange={(event) =>
                    setDraft({ ...draft, outputPath: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Split separator (optional)
                <input
                  value={draft.split ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    setDraft({ ...draft, split: event.target.value })
                  }
                />
              </label>
              <label>
                Strip characters (optional)
                <input
                  value={draft.strip ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    setDraft({ ...draft, strip: event.target.value })
                  }
                />
              </label>
              <dl className="mapping-definition">
                <dt>Before</dt>
                <dd>
                  <code>
                    {row.inputPath} → {target}
                  </code>
                </dd>
                <dt>After</dt>
                <dd>
                  <code>
                    {draft.inputPath} → {document.entity}.{draft.outputPath}
                  </code>
                </dd>
                <dt>Affected scope</dt>
                <dd>
                  This instruction in {document.filename}; all source records
                  using it.
                </dd>
              </dl>
              <label>
                Reason for change
                <textarea
                  value={reason}
                  disabled={disabled}
                  onChange={(event) => setReason(event.target.value)}
                  required
                />
              </label>
              {error && (
                <p role="alert" className="notice warning">
                  {error}
                </p>
              )}
              <div className="actions">
                <button
                  className="button primary"
                  disabled={disabled}
                  type="submit"
                >
                  Save mapping change
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={disabled}
                  onClick={() => close(true)}
                >
                  Cancel editing
                </button>
              </div>
            </form>
          )}
          {(mode === "question" || mode === "answer") && (
            <form
              aria-label={
                mode === "question" ? "Review question" : "Review answer"
              }
              onSubmit={(event) => {
                event.preventDefault();
                if (!entry.trim()) return;
                if (mode === "question") {
                  setQuestion(entry.trim());
                  setAnswer("");
                  onDecision(row.id, "unresolved");
                } else {
                  setAnswer(entry.trim());
                  onDecision(row.id, "pending");
                }
                close();
              }}
            >
              <p className="muted">
                Record a question or an answer from your source owner. These
                notes stay in this browser; no message is sent.
              </p>
              <label>
                {mode === "question"
                  ? "Question for review"
                  : "Answer from review"}
                <textarea
                  autoFocus
                  value={entry}
                  disabled={disabled}
                  onChange={(event) => setEntry(event.target.value)}
                  required
                />
              </label>
              <div className="actions">
                <button
                  className="button primary"
                  disabled={disabled}
                  type="submit"
                >
                  {mode === "question"
                    ? "Save review question"
                    : "Save review answer"}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={disabled}
                  onClick={() => close(true)}
                >
                  Cancel question
                </button>
              </div>
            </form>
          )}
        </div>
      </details>
    </article>
  );
}

function DocumentReview({
  document,
  sources,
  decisions,
  disabled,
  onDecision,
  onSave,
}: Omit<Props, "documents"> & { document: MappingDocument }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(document.text);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const previous = useRef<Record<string, Decision>>({});
  const saving = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!editing && restoreFocus.current) {
      button.current?.focus();
      restoreFocus.current = false;
    }
  }, [editing]);
  function close(restore = false) {
    if (restore)
      for (const row of document.rows)
        onDecision(row.id, previous.current[row.id] ?? "pending");
    restoreFocus.current = true;
    setEditing(false);
  }
  return (
    <section
      className="mapping-document"
      aria-label={`Mapping file ${document.filename}`}
    >
      <h3>{document.filename}</h3>
      <p className="muted">
        {document.sourceFile} → {document.entity} · {document.rows.length}{" "}
        supplied instructions
        {document.filter ? ` · Filter: ${document.filter}` : ""}
      </p>
      {document.error && (
        <p role="alert" className="notice warning">
          Mapping unavailable: {document.error} Correct the supplied mapping
          before review.
        </p>
      )}
      <div className="mapping-list">
        {document.rows.map((row) => (
          <ReviewRow
            key={`${row.id}:${row.inputPath}:${row.outputPath}:${row.split}:${row.strip}`}
            document={document}
            row={row}
            sources={sources}
            decision={decisions[row.id] ?? "pending"}
            disabled={disabled || editing}
            onDecision={onDecision}
            onSave={onSave}
          />
        ))}
      </div>
      <details className="details">
        <summary>Advanced mapping file</summary>
        <p className="muted">
          Edit the actual instructions, including filter or custom-transform
          settings. Changes are sent to the backend after renewed approval. This
          editor does not validate HSDS paths or implement a mapping engine.
        </p>
        {!editing ? (
          <>
            <pre aria-label={`Supplied mapping ${document.filename}`}>
              {document.text}
            </pre>
            <button
              ref={button}
              className="button secondary"
              disabled={disabled}
              onClick={() => {
                previous.current = { ...decisions };
                for (const row of document.rows)
                  onDecision(row.id, "unresolved");
                setText(document.text);
                setReason("");
                setError("");
                setEditing(true);
              }}
            >
              Edit mapping file
            </button>
          </>
        ) : (
          <form
            aria-label={`Edit mapping file ${document.filename}`}
            onSubmit={async (event) => {
              event.preventDefault();
              if (saving.current) return;
              try {
                if (!reason.trim())
                  throw new Error("Add a reason for this mapping change.");
                if (text === document.text)
                  throw new Error(
                    "Change the mapping file before saving, or cancel editing.",
                  );
                validateMappingText(document, text);
                saving.current = true;
                const saved = await onSave(
                  document.filename,
                  text,
                  reason.trim(),
                );
                if (saved === false) {
                  setError(
                    "Mapping could not be saved. Check the workspace status and revise the draft.",
                  );
                  return;
                }
                close();
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Mapping file could not be saved.",
                );
              } finally {
                saving.current = false;
              }
            }}
          >
            <label>
              Mapping file contents
              <textarea
                autoFocus
                spellCheck={false}
                value={text}
                disabled={disabled}
                onChange={(event) => setText(event.target.value)}
                required
              />
            </label>
            <p className="notice warning">
              Affects every instruction in this file. Original source and
              earlier results remain unchanged; review and approval must be
              renewed.
            </p>
            <label>
              Reason for file change
              <textarea
                value={reason}
                disabled={disabled}
                onChange={(event) => setReason(event.target.value)}
                required
              />
            </label>
            {error && (
              <p role="alert" className="notice warning">
                {error}
              </p>
            )}
            <div className="actions">
              <button
                className="button primary"
                disabled={disabled}
                type="submit"
              >
                Save mapping file
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={disabled}
                onClick={() => close(true)}
              >
                Cancel file editing
              </button>
            </div>
          </form>
        )}
      </details>
    </section>
  );
}

export default function MappingReview({ documents, ...props }: Props) {
  if (!documents.length)
    return (
      <p className="notice warning">
        No supplied mapping could be inspected. Add a mapping file matching the
        source name.
      </p>
    );
  return (
    <div className="mapping-documents">
      {documents.map((document) => (
        <DocumentReview
          key={document.filename}
          document={document}
          {...props}
        />
      ))}
    </div>
  );
}
