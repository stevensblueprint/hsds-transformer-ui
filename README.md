# Blueprint Open Referral UI

React 19 / strict TypeScript / Vite / Tailwind workspace for **Source → Mapping → Run → Review → Export**. The synthetic sample, simulated controls and fabricated reports are removed from the application. The default input is the backend repository's JSON test fixture; results come from an explicit real backend request.

## Setup

Use Node **22.23.5** (`.nvmrc`) and npm **11.19.0** (`packageManager`, `engines`):

```bash
nvm install
nvm use
npm install --global npm@11.19.0
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Open `http://localhost:5173`. Fonts are bundled. Browser state is memory only: reload or switching input modes loses selection, review and results. URL hashes contain step names only.

Start the backend separately using its pinned setup instructions:

```bash
uv run --locked --extra api uvicorn src.api.app:app --host 127.0.0.1 --port 8000
```

Development uses `http://localhost:8000` through `.env.development`; the existing production endpoint is preserved. Override only with a public endpoint, never credentials:

```bash
VITE_API_URL=http://localhost:8000 npm run dev -- --host localhost --port 5173 --strictPort
```

Backend CORS permits `http://localhost:5173`; `127.0.0.1:5173` is a different origin. `VITE_*` variables are public client values.

## Repository JSON walkthrough

1. **Use repository JSON**, then **Inspect source**. Neither action uploads anything. Download links provide the source, mapping and ready-to-upload ZIP.
2. **Mapping** shows the exact upstream source evidence, target paths and transformation instructions. **Approve supplied mapping** records only browser-local review of the pinned files. Rejection blocks another run; editing requires a revised ZIP through ZIP upload.
3. **Run JSON transformation** sends multipart `zip_file` plus `input_format=json` to `/transform`. No model, fake progress or invented job endpoint is used.
4. **Review** shows the actual returned JSON as bounded text and the received ZIP. **Export** downloads that original artifact. HTTP 201 is separate from HSDS schema validation (not run) and semantic correctness (unavailable).

Files under `src/assets/repository-json/` are copied unchanged from [hsds-transformer main at 6486294](https://github.com/stevensblueprint/hsds-transformer/tree/6486294a7aac8fbce1bb4e021fe6e810c1f335df/data/json_test). `orgs.json` contains one “Test Organization”; it is the upstream test fixture, not partner data. `orgs_organization_mapping.json` covers IDs, names, descriptions, languages, phones, attributes and tags. The ZIP packages these two files without modification. Updating them requires checking the upstream revision and regenerating the archive together.

## Other ZIP inputs

Select **ZIP upload**, choose **CSV** or **JSON** input format, then browse/drop a permitted ZIP containing source and matching mapping files. Metadata inspection is local; **Upload ZIP and transform** is explicit. JSON archives use the existing backend JSON input option. Direct unarchived CSV/JSON ingestion is unavailable.

Input inspection rejects malformed, oversized, unsupported and unsafe archive metadata. Returned ZIPs have bounded transfer and envelope checks; the repository workspace previews at most five JSON files with a 1 MiB expansion limit per file and 12,000 visible characters. Files render as text; no HTML/formula execution, source logs, analytics, URLs or browser storage. These browser limits do not replace backend archive/content validation.

Interrupted requests show **status unknown**. Stopping the wait does not acknowledge server cancellation. There are at most three explicit attempts per selection, a 120-second browser timeout, no automatic retry and no durable recovery. Local download links expire after 15 minutes or leaving the input mode; server expiry is unavailable.

## Checks and delivery

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Browser transport is mocked in automated checks; a separate real local backend round trip is documented in [verification](docs/verification.md). Earlier workflow models/fixtures remain unmounted test coverage and proposed integration concepts, not application functionality. No mock server is started by the app. See [design sources](docs/design-source.md) and [BLU-42 handoff](docs/integration-handoff.md).

Build CI checks frontend behavior. `deploy.yml` remains unchanged: main pushes/manual invocation can deploy independently. Branch and draft PR only; no merge, deployment, backend, infrastructure or auth/storage changes.
