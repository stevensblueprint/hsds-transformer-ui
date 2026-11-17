# BLU-42: continuous transformation interaction handoff

Current implementation is a shared frontend shell and interaction layer over the **existing** transformer. It supplies no replacement parser/mapping/validation engine, model, durable job, storage or server approval contract. Team ownership of BLU-40/41/42 remains unchanged.

## Stack and sources

This change is stacked on PR #10, pinned parent **25beaa34baf25a201f3e3e537f14b1ff56c663d6**. Luke's followup explicitly replaces numbered workflow navigation and separate ZIP mode with contextual interactions and unified intake. This supersedes those older PRD layout choices; it does not authorize backend engines or deployment. [Design record](design-source.md) retains the actual inspected Figma frames and adaptations.

## Module seams

| Module                                                       | Responsibility                                                                                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transformation/model.ts`                                    | Browser input, mapping row, local receipt and immutable submitted-run snapshot concepts                                                             |
| `input.ts` / `archive.ts`                                    | CSV/JSON/ZIP intake, mapping/source pairing, bounded text, safe ZIP read/write, CRC/size checks, preservation of originals                          |
| `mapping.ts`                                                 | Read/display/edit supplied backend JSON/CSV mapping instructions; preserve filters, custom transforms and unknown options; no transformation engine |
| `MappingReview.tsx`                                          | Row evidence, decisions, manual question/answer, before/after/reason/scope edits; questions do not approve                                          |
| `useTransformation.ts`                                       | Source/mapping versions, local approval binding, synchronous request guard, interruption/expiry, retained actual attempts and snapshots             |
| `Workspace.tsx` / `SourceInspector.tsx` / `OutputReview.tsx` | Contextual intake/review/run/output states, manual correction review, safe returned JSON, artifact context and bounded preview comparison           |
| `integration/adapter.ts` / `jsonOutput.ts`                   | Existing real HTTP boundary, bounded untrusted error/log handling and returned JSON preview                                                         |

Old numbered `RepositoryWorkspace` and separate `RealZipFlow` are removed. Earlier `workflow/` reducer concepts remain unmounted tests, not active synthetic UI or backend promises.

## Existing HTTP, unchanged

Backend source inspected at **6486294a7aac8fbce1bb4e021fe6e810c1f335df**:

| Request           | Verified boundary                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| POST `/transform` | Multipart `zip_file`; CSV default or `input_format=json`; HTTP 201 ZIP                                       |
| GET `/health`     | Available but not a run-reconciliation endpoint; the new workspace does not use it to clear unknown outcomes |

Loose CSV/JSON files are locally packaged into the ZIP this endpoint already accepts. Imported ZIP is initially sent unchanged. A revision creates a new local archive; original files remain in earlier run snapshots and before/after review. No workflow/approval/report/history/job API is invented. `/transform/stream` is unused.

Local receipts bind source version, mapping version and the displayed backend-mapping-syntax context; the HSDS target profile remains **unverified**. Immutable File objects and version transitions bind browser bytes, but there is no server conflict, authorization or persisted-approval enforcement. Adding/removing/reinspecting files, editing, rejecting or opening a question invalidates review. Pending-row bulk review skips rejected/unresolved rows.

At most three explicit requests per source/mapping version and five retained attempts per session; no automatic retry. Stopping/timeout or disconnection means **unknown**, not cancelled. Local artifact links expire after 15 minutes or session clear/reload; response history is retained independently until session clear. No server artifact retention/expiry or cancellation/recovery endpoint is established.

Source corrections are manual user edits with before/after/reason/scope; no suggested model correction is fabricated. Rerun comparison describes visible JSON previews only. It does not compute validation findings, count resolved problems or assert stable entity matches/full equality. Transformation HTTP 201 is separate from schema not run and semantic correctness unavailable.

## Proposed contracts still requiring owner agreement

Source/contract identity and immutability; mapping proposals versus approved versions; parser/sample limits; required/unmapped/unsupported semantics; target HSDS release/profile; structured diagnostic layer/code/rule/entity/source evidence; safe corrections and stable finding comparison; server idempotency/conflicts/cancellation/reconciliation; run and artifact IDs/retention; permission/tenant isolation and invalid-output policy.

The browser types are **not agreed BLU-42 APIs**. See [verification](verification.md) for actual versus mocked evidence and [README](../README.md) for limits/startup. Rollback: revert the stacked interaction commit to restore PR #10. No merge, release, deployment or infrastructure changes were made.
