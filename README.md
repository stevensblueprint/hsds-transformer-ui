# Blueprint Open Referral UI

A continuous React 19 / TypeScript workspace for inspecting data, reviewing its mapping, running the transformer and exporting actual returned output. There are no numbered workflow pages, separate ZIP mode, synthetic scenario controls or fabricated results.

## Setup

Use Node **22.23.5** and npm **11.19.0**:

```bash
nvm install
nvm use
npm install --global npm@11.19.0
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Open `http://localhost:5173`. Start the separately installed backend using its own pinned dependency setup:

```bash
uv run --locked --extra api uvicorn src.api.app:app --host 127.0.0.1 --port 8000
```

`.env.development` points to `http://localhost:8000`; production configuration is unchanged. To override a public endpoint:

```bash
VITE_API_URL=http://localhost:8000 npm run dev -- --host localhost --port 5173 --strictPort
```

Backend CORS permits `http://localhost:5173`; `127.0.0.1:5173` is a different origin. `VITE_*` variables are public client values, never secrets. Fonts are bundled locally.

## Transformation journey

1. **Browse files** or drop CSV/JSON source plus matching mapping files, or one ZIP containing both. Formats are detected automatically. Files stay local until an explicit run. Missing mappings are actionable errors; mapping generation is not connected.
2. **Inspect files** checks names, structure and bounded contents. Source inspection shows literal values. Mapping rows show source evidence, full destination path and supplied transformations. Open a row to approve, reject, edit, or record a human review question. Answering a question returns the row to pending; it never approves the mapping.
3. Review pending rows individually or **Mark pending rows reviewed**; rejected and unresolved rows remain blocked. **Approve mapping** binds a browser-local receipt to current source, mapping and contract context. **Run transformation** is separate.
4. Inspect actual returned JSON, checks and export context in the adjacent output pane. A received ZIP establishes transformation response only: HSDS schema is **not run**, semantics **unavailable**. Download the original output ZIP. Earlier attempts remain selectable in this session.
5. **Review current mapping** to revise a mapping or **Inspect source values → Correct source values** to propose a manual source correction. Changes show before/after, reason and affected scope. Approving a source correction creates a new source version. Saved mapping changes create a mapping version. Both invalidate mapping approval and retain earlier submitted source/mapping snapshots and output.
6. Reapprove and rerun. Compare bounded returned previews; changed previews never imply resolved diagnostics, stable record matching or full-artifact equality. **Download current inputs** packages source and edited mappings for reuse; browser approval is not a server-enforced or saved approval contract.

Use **Need a working repository input? → Use repository JSON** for unchanged `orgs.json` and its mapping from [backend main 6486294](https://github.com/stevensblueprint/hsds-transformer/tree/6486294a7aac8fbce1bb4e021fe6e810c1f335df/data/json_test). It contains one “Test Organization”: an upstream test fixture, not partner data. No invented sample is added to the app.

## Supported boundary and limits

The backend still receives ZIP multipart `zip_file` through `/transform`; JSON adds `input_format=json`. Direct files are archived in browser memory, not transformed by frontend code. CSV retains the existing default request field behavior. No backend changes or new workflow/model/report endpoints are introduced.

- Input: 10 MiB compressed ZIP or total direct files; 100 entries; 50 MiB actual archive expansion; 100:1 advertised ratio. ZIPs must have one dataset root. Unsafe paths, links, duplicate names, unsupported compression/encryption, invalid CRC/size or malformed files are rejected.
- Text inspection/editing: 1 MiB per file; large source bytes are retained with a visible unavailable-preview warning. Mappings above the bound or over 200 rows per document cannot be reviewed here. Browser mapping edits preserve unknown backend options. Repacking a large compressed input as a stored ZIP may exceed 10 MiB; recompress externally if instructed.
- Returned ZIP: 100 MiB transfer bound and envelope check. JSON preview: five files, 1 MiB expansion each, 12,000 visible characters each. Preview failure preserves the original ZIP with a warning. Frontend checks do not replace backend validation or establish HSDS validity.
- Requests: 120-second browser timeout, three explicit attempts per source/mapping version, five retained attempts per session, no automatic retry. Interrupted or stopped requests show **server status unknown**; cancellation is not acknowledged and recovery/reconciliation is unavailable.
- State: memory only. Reload/reopen clears files, review and attempts. **Clear session** confirms destructive local clearing and revokes downloads. Local output links expire after 15 minutes, while response history stays distinct from link availability. Server retention/expiry is unknown.

Source data is rendered as text, never HTML/formulas. No uploaded contents in URLs, logs, analytics, localStorage or sessionStorage. No authentication, cloud/model/storage infrastructure, partner ingestion or deployment was added. Earlier workflow concepts remain test-only; the active UI uses real transformer output.

## Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Automated browser tests mock HTTP. With the frontend and backend both running locally, separately verify the actual repository-input/correction/rerun journey:

```bash
node scripts/verify-local-transform.mjs
```

That script refuses a non-local configured transformer and records actual returned JSON/screenshots under `docs/evidence/interactions/`. See [current verification](docs/verification.md), [Figma design record](docs/design-source.md) and [BLU-42 handoff](docs/integration-handoff.md).

Build checks run for all pull-request bases, including stacked PRs. Draft PR stacked on #10; no merge or deployment authorized. `deploy.yml` remains unchanged and can deploy main independently of build checks.
