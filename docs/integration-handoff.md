# BLU-42 integration handoff

The current app uses the existing transformer HTTP interface. Workflow approvals, structured reports, corrections, durable jobs and history have **no agreed backend contract**. This work supplies shell/components/seams, not replacement mapping or validation engines. [BLU-42](https://linear.app/stevensblueprint/issue/BLU-42) decisions remain with the owning team.

## Current application

- `App.tsx`: input modes, header/help, shared shell. No synthetic workspace or scenario controls.
- `RepositoryWorkspace.tsx`: upstream JSON source/mapping inspection, browser-only review, explicit real request and actual output preview/download. Review applies only to the fixed source/mapping bytes at the pinned revision. No saved or server-enforced approval is claimed; target HSDS profile remains unverified.
- `integration/RealZipFlow.tsx`: generic CSV/JSON ZIP selection, metadata inspection, explicit transport and download.
- `integration/adapter.ts`: multipart and error boundary, bounded untrusted errors/logs and output envelope. `integration/jsonOutput.ts`: bounded streaming JSON text preview, no disk extraction or HTML execution.
- `workflow/` and remaining `screens.tsx`: earlier typed workflow concepts and reducer tests. They are unmounted and tree-shaken from the shipped app. Their fixture outcomes are not backend capabilities or active UI samples.

## Verified existing HTTP boundary

Backend main source inspected at **6486294a7aac8fbce1bb4e021fe6e810c1f335df**:

| Request         | Existing contract                                                      | UI behavior                                       |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| GET /health     | Health response                                                        | Connection only; cannot reconcile prior requests  |
| POST /transform | Multipart `zip_file`; default CSV or `input_format=json`; HTTP 201 ZIP | Explicit upload, bounded response, local download |

The copied JSON/mapping fixture and actual output are recorded in [verification](verification.md). JSON support was already present in main; no backend changes were made. CSV requests retain the original field behavior (no extra format field). JSON requests add `input_format=json`. No workflow/approval/history/report/job endpoints or `/transform/stream` calls are invented.

Input metadata bounds: 10 MiB compressed, 50 MiB advertised expanded total, 100 entries, 100:1 ratio. Unsafe paths/links/duplicates, malformed headers, encryption, ZIP64/multi-volume/non-UTF-8 variants and wrong-format files are rejected. Preflight does not replace server CRC/actual-expansion/content validation.

Responses have a 100 MiB streaming cap and ZIP-envelope check, not full CRC/HSDS validation. JSON preview allows five files, at most 1 MiB expanded each, 12,000 displayed characters each. Unsupported/malformed/unsafe previews preserve the original downloadable ZIP with a warning. A separately verified local fixture ZIP passed CRC checks; the browser does not claim that check generally.

HTTP 400/413/415/422 are input failures; other HTTP failures are system/service failures. Interrupted or stopped transfer means status unknown. There is no cancellation acknowledgement or reconciliation endpoint. At most three explicit attempts per selection; no automatic retry. Links expire locally after 15 minutes or input-mode change/reload; successful response history remains distinct from artifact availability. No persistent storage, source logging, model calls or account flows exist.

## Proposed concepts requiring agreement

| Concept    | Owner decisions needed                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| Source     | Immutable identity/version, format/limits, permission/tenant boundary, retention and parser safety           |
| Mapping    | Evidence, entity/full paths, supported transforms, unresolved/unsupported/unmapped; proposal versus approval |
| Approval   | Source/mapping/target-contract version binding; server conflict/idempotency/authorization enforcement        |
| Run        | Opaque/parent IDs, frozen inputs, actual stages/outcomes; reconciliation/cancellation if supported           |
| Diagnostic | Layer/code/severity/stage/rule/entity, source file/row/field/target/evidence, stable identity                |
| Correction | Before/after/reason/scope/version/base run/receipt; retained reports, renewed approval, fresh run            |
| Artifact   | Identity/run/input/contract/check context, expiry/retrieval, invalid-output policy                           |

Open: HSDS release/profile BLU-13, corpus expectations BLU-14/25, validator/report BLU-19/24/26, model/API schemas, auth/isolation/retention, idempotency/retry/cancellation. No production readiness or account-isolation assurance is inferred. Reverting the followup commit restores the earlier synthetic UI; reverting the branch restores baseline. No backend, infrastructure, deployment, merge or release changes.
