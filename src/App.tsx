import { useRef, useState } from "react";
import RepositoryWorkspace from "./RepositoryWorkspace";
import RealZipFlow from "./integration/RealZipFlow";
import "@fontsource/poppins/600.css";
import "@fontsource/albert-sans/400.css";
import "@fontsource/albert-sans/500.css";
import "@fontsource/albert-sans/600.css";
import "./App.css";

export default function App() {
  const [mode, setMode] = useState<"repository" | "zip">("repository");
  const [help, setHelp] = useState(false);
  const helpButton = useRef<HTMLButtonElement>(null);
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
          <h2>Inspect, review, then transform</h2>
          <p>
            The repository JSON option uses the actual JSON and mapping from
            hsds-transformer main. Uploads go only to the displayed configured
            backend. Mapping review stays in this browser; structured
            validation, saved approval/history and model assistance are not
            connected. Refresh clears selection and results.
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
        <span className="eyebrow">Choose your input</span>
        <fieldset className="mode-switch">
          <legend className="visually-hidden">Input mode</legend>
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === "repository"}
              onChange={() => setMode("repository")}
            />{" "}
            Repository JSON
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === "zip"}
              onChange={() => setMode("zip")}
            />{" "}
            ZIP upload
          </label>
        </fieldset>
      </div>
      {mode === "repository" ? (
        <RepositoryWorkspace />
      ) : (
        <main id="workspace" tabIndex={-1}>
          <div className="page-heading">
            <h1>Transform a ZIP archive</h1>
          </div>
          <RealZipFlow />
        </main>
      )}
      <footer className="app-footer">
        <span>Blueprint · Open Referral</span>
        <span>
          Real transformation · schema and semantic checks reported separately
        </span>
      </footer>
    </div>
  );
}
