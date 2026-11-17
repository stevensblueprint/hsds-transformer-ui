import { useEffect, useRef, useState } from "react";
import type { InputFile } from "./model";

export default function SourceInspector({
  files,
  disabled,
  onSave,
  onEditingChange,
}: {
  files: InputFile[];
  disabled: boolean;
  onEditingChange: (editing: boolean) => void;
  onSave: (filename: string, text: string, reason: string) => Promise<boolean>;
}) {
  const sources = files.filter(
    (file) => !/_mapping\.(csv|json)$/i.test(file.name),
  );
  const [name, setName] = useState(sources[0]?.name ?? "");
  const selected = sources.find((file) => file.name === name) ?? sources[0];
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (editing) editor.current?.focus();
  }, [editing]);
  if (!selected) return <p>Source preview unavailable.</p>;
  const text = selected.text;
  function cancel() {
    setEditing(false);
    onEditingChange(false);
    setReviewing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  }
  return (
    <section aria-label="Source inspection" className="source-inspector">
      <div className="section-heading">
        <h3>Source evidence</h3>
        <span className="muted">Original values are rendered as text</span>
      </div>
      <label htmlFor="source-preview-file">Source file</label>
      <select
        id="source-preview-file"
        value={selected.name}
        disabled={disabled || editing}
        onChange={(event) => setName(event.target.value)}
      >
        {sources.map((file) => (
          <option key={file.name}>{file.name}</option>
        ))}
      </select>
      {text === null ? (
        <p className="notice">
          This source exceeds the 1 MiB text-inspection limit. Its bytes are
          retained for the transformer; preview and browser editing are
          unavailable.
        </p>
      ) : (
        <pre aria-label="Source preview" className="code-preview compact-code">
          {text.slice(0, 10000)}
          {text.length > 10000
            ? "\n… Preview truncated. Original file is retained."
            : ""}
        </pre>
      )}
      {!editing && text !== null && (
        <button
          ref={editButton}
          className="text-button"
          disabled={disabled}
          onClick={() => {
            setDraft(text);
            setReason("");
            setEditing(true);
            onEditingChange(true);
          }}
        >
          Correct source values
        </button>
      )}
      {editing && (
        <div className="edit-surface">
          <h3>Propose a source correction</h3>
          <p>
            Changes affect only {selected.name}. Saving creates a new source
            version and invalidates mapping approval. Earlier run inputs and
            output stay unchanged.
          </p>
          <label htmlFor="source-correction">Revised source</label>
          <textarea
            id="source-correction"
            ref={editor}
            value={draft}
            readOnly={reviewing}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            rows={10}
          />
          <label htmlFor="source-reason">Reason for correction</label>
          <input
            id="source-reason"
            value={reason}
            readOnly={reviewing}
            disabled={disabled}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
          />
          {reviewing && (
            <section aria-label="Source correction review">
              <h3>Review before applying</h3>
              <div className="diff-grid">
                <div>
                  <strong>Before</strong>
                  <pre>{text?.slice(0, 10000)}</pre>
                </div>
                <div>
                  <strong>After</strong>
                  <pre>{draft.slice(0, 10000)}</pre>
                </div>
              </div>
              <p>Reason: {reason}</p>
              <p>
                Scope: this source file; mapping must be reviewed again.
                Previews show at most 10,000 characters.
              </p>
            </section>
          )}
          <div className="actions">
            {!reviewing ? (
              <button
                className="button secondary"
                disabled={disabled || !reason.trim() || draft === text}
                onClick={() => setReviewing(true)}
              >
                Review source change
              </button>
            ) : (
              <>
                <button
                  className="button primary"
                  disabled={disabled}
                  onClick={async () => {
                    if (await onSave(selected.name, draft, reason)) cancel();
                  }}
                >
                  Approve source change
                </button>
                <button
                  className="button secondary"
                  disabled={disabled}
                  onClick={() => setReviewing(false)}
                >
                  Revise source change
                </button>
              </>
            )}
            <button
              className="text-button"
              disabled={disabled}
              onClick={cancel}
            >
              Reject source change
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
