import { useRef, useState } from "react";
import Workspace from "./transformation/Workspace";
import "@fontsource/poppins/600.css";
import "@fontsource/albert-sans/400.css";
import "@fontsource/albert-sans/500.css";
import "@fontsource/albert-sans/600.css";
import "./App.css";

export default function App() {
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
        <a
          className="wordmark"
          href="#workspace"
          aria-label="Open Referral home"
        >
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
            Add CSV or JSON source and mapping files, or a ZIP containing both.
            Inspect locally, review and edit the mapping, then approve this
            version before explicitly running. Returned JSON and earlier
            attempts stay in this session. Schema validation, saved
            approval/history and model assistance are not connected. Refresh
            clears files and results.
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
      <Workspace />
      <footer className="app-footer">
        <span>Blueprint · Open Referral</span>
        <span>
          Real transformation · schema and semantic checks reported separately
        </span>
      </footer>
    </div>
  );
}
