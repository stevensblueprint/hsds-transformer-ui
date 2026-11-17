# Blueprint Open Referral UI

React 19 / strict TypeScript / Vite / Tailwind scaffold for **Source → Mapping → Run → Review → Export**, with the existing real ZIP integration preserved. See [design sources](docs/design-source.md), [BLU-42 handoff](docs/integration-handoff.md), and [verification](docs/verification.md).

## Setup

Use Node **22.23.5** (`.nvmrc`) and npm **11.19.0** (`packageManager`, `engines`). With nvm:

```bash
nvm install
nvm use
npm install --global npm@11.19.0
npm ci
npm run dev -- --host localhost --port 5173 --strictPort
```

Open `http://localhost:5173`. The default synthetic demo needs no backend/model. Fonts are bundled locally. State is memory only: refresh/reopen loses source, answers, approvals, runs and reports. URL hashes contain step names only.

## Synthetic walkthrough

1. Source: **Load synthetic sample**, then **Inspect source**. Selection and inspection are separate; nothing is uploaded. Three invented service rows include literal HTML/formula strings rendered as data. Browsing/dropping direct CSV/JSON does not read contents or pretend ingestion works.
2. Mapping: review full target paths and evidence. Approve organization/service; answer the phone clarification, then explicitly approve phone. Reject locations, revise its unsupported transform to the supported semicolon-list option, then approve. Notes stay intentionally unmapped. **Approve mapping version** separately.
3. Run: **Run transformation**, then **Advance simulated stage** four times. These are fixture events, not backend progress, jobs or percentages.
4. Review: select diagnostic evidence, including deliberately missing evidence. Reject/revise/approve the contact correction. Original source and report remain intact. Renew mapping approval, rerun, and compare resolved/remaining/new/uncertain findings.
5. Export: download an identified synthetic report and simulate expiry. Check layers independently show passed/failed/not run/unavailable. Transformation completion never proves HSDS validity.

**Demo controls** expose model timeout/malformed output, conflicts, partial/system failures, changed source/contract, reconnect/reset. Run controls expose disconnection and requested/acknowledged cancellation separately. Reconnect does not reconcile unknown status; refresh has no recovery promise. Synthetic outcomes and target paths are authored examples, not replacement mapping or validation engines.

## Real local ZIP integration

Start the separately installed backend using its own pinned instructions, for example from its checkout:

```bash
uv run --locked --extra api uvicorn src.api.app:app --host 127.0.0.1 --port 8000
```

Development defaults to localhost through `.env.development`; the existing tracked `.env` production endpoint is preserved. You can also start with an explicit public URL:

```bash
VITE_API_URL=http://localhost:8000 npm run dev -- --host localhost --port 5173 --strictPort
```

Create an invented input with `python3 scripts/make-synthetic-zip.py /tmp/open-referral-demo.zip` (choose a new output path). Select **Real ZIP integration**, verify the displayed endpoint, browse/drop a synthetic or permitted ZIP, inspect metadata, then explicitly upload. Backend CORS permits `http://localhost:5173`; `127.0.0.1:5173` is a different origin. Do not change backend CORS to bypass this distinction. HTTP 201 ZIP enables download; schema/semantic checks are not established. Rich mapping/reports/history remain simulated.

`VITE_*` variables are public client values, never secrets. No source contents go into URLs, console/analytics, localStorage or sessionStorage. Real files and results remain temporary browser memory; leaving real mode revokes links. [Handoff](docs/integration-handoff.md) describes provisional limits, bounded retries, unknown interrupted status and expiry.

## Checks and delivery boundary

```bash
npm run lint
npm run format:check
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Vitest covers state, lifecycle and contracts; MSW intercepts contract traffic. Playwright runs desktop/mobile Chromium, 320px reflow, keyboard/focus and axe, with backend traffic mocked. These are responsive web checks, not native iOS or all-browser assurance. The separately observed local ZIP round trip has its own backend revision/evidence.

Build CI uses pinned Node/npm and bounded frontend checks. `deploy.yml` remains unchanged: main pushes/manual invocation can deploy independently to S3/CloudFront. This task authorizes a branch and draft PR only; no merge, deployment or infrastructure changes.
