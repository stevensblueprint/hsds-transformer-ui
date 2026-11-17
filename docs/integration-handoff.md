# Proposed BLU-42 integration handoff

TypeScript shapes here are **frontend demo concepts, not agreed APIs**. [BLU-42](https://linear.app/stevensblueprint/issue/BLU-42) had no approved schemas/payloads attached when inspected. This task supplies shared UI/seams, not replacement mapping/validation engines.

## Modules and ownership

- `src/workflow/model.ts`: typed source/version, per-row decisions, approvals, diagnostics, run snapshots, check layers, reviewed patches/artifacts.
- `reducer.ts`: pure memory transitions; no network/accounts/storage/models. Source/mapping/contract changes invalidate approval. Patches have their own version receipt. Runs freeze mappings/reports. Repeated actions deduplicate.
- `fixtures.ts`: invented services, malformed phone, shared location, literal HTML/formula text, missing provenance and stable/unstable finding identities. Digit-length and rerun outcomes are authored demo rules, not schema/general mapping engines. Workstream/domain review of fixture expectations remains pending.
- `screens.tsx` / `ui.tsx`: shared review/evidence/diff/check/artifact patterns. BLU-40 and BLU-41 retain domain/vertical-slice ownership.
- `integration/adapter.ts` and `RealZipFlow`: real HTTP boundary mounted only after opt-in. MSW runs in tests only; synthetic UI performs no service/model calls.

## Verified existing HTTP boundary

Backend inspected at38fa7d0865f4bdfb63d9a366ec14c37f9626ee05, unchanged:

| Request         | Observed contract                                         | UI implication                                    |
| --------------- | --------------------------------------------------------- | ------------------------------------------------- |
| GET /health     | Health response                                           | Connection only, not run success                  |
| POST /transform | Multipart zip_file, default CSV input;201 application/zip | Explicit upload, bounded transfer, local download |

No workflow/approval/history/report/job endpoints are called. `/transform/stream` is unused. Optional response logs are bounded untrusted text; CORS may prevent visibility. Missing run/version/contract/request-ID/provenance remains unavailable.

Provisional browser input bounds:10MiB compressed,50MiB advertised expanded total,100 entries,100:1 ratio. Reject unsafe paths/links/duplicates, malformed local/central metadata, encryption, ZIP64/multi-volume/non-UTF-8 variants and non-CSV entries without extracting source contents. Metadata preflight cannot replace server CRC/actual-expansion/content/path safety.

Returned artifacts have a100MiB streaming cap and ZIP-envelope checks, not full CRC/content/HSDS validation. Local links expire after15minutes or leaving real mode; server retention/expiry is unknown. HTTP400/413/415/422 are input failures; other HTTP failures are system/service failures. Timeout, disconnection or aborted transfer means **status unknown**, no automatic retry. At most3 explicit attempts per selection; health cannot reconcile prior work. Stopping the browser request is not server cancellation acknowledgement.

## Concepts needing agreement

| Concept    | Required owner decisions                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Source     | Identity/immutable version, format/limits/shape, bounded samples; tenant boundary, retention/deletion and parser safety                      |
| Mapping    | Evidence, entity/full paths including one-to-many, supported transforms, unresolved/unsupported/intentionally unmapped; proposal vs approval |
| Approval   | Source ID/version + mapping version + target-contract version; eventual server conflict/idempotency/authorization enforcement                |
| Run        | Opaque/parent IDs, frozen approved inputs, observed stages/outcomes, source vs output counts; reconciliation/cancellation if supported       |
| Diagnostic | Layer/code/severity/stage/rule/entity, file/row/field/target/evidence; absent values unavailable; stable unique identity for comparison      |
| Correction | Before/after/reason/scope/version/base run/receipt; retain source/report, renew approval, fresh run; no inferred service facts               |
| Artifact   | Identity/type/run/input/contract/check layers, permission/expiry/retrieval; invalid-output policy still open                                 |

Only complete, comparable same-source/contract reports establish resolved findings. Failed/partial reports are inconclusive. Unknown or duplicate diagnostic identities never silently clear findings. The demo downloads only a labeled synthetic report; legacy ZIP output keeps its existing real download with validation limitations shown.

Open: HSDS release/profile BLU-13; corpus permission/expectations BLU-14/25; validator/report BLU-19/24/26; exact model/API schemas; retention/auth/isolation; idempotency/cancellation/retry; receiving interface and invalid-output policy. No real account flow exists; account-isolation assurance is unavailable, not passed.

## Release and rollback

No backend, infrastructure, auth/storage/model provider or deployment changes. `deploy.yml` is unchanged and still deploys main independently of checks. Do not merge to test deployment. Discarding this branch restores baseline; any eventual rollout needs separate release/rollback approval. Build CI performs deterministic frontend checks only, without production data/credentials.
