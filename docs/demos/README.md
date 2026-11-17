# Team demo: Open Referral transformation workspace

[Watch or download the captioned MP4](open-referral-transformation-demo.mp4) — **1:09**, 1440×1100, H.264, about 1.1 MiB. Silent, with burned-in captions; suitable for presenting with your own narration.

The walkthrough shows unified file intake, source/mapping inspection, a review question, explicit version approval, actual transformation output, a manual source correction with before/after review, renewed approval, rerun comparison and export with check context.

Recorded application: **8a173153aedf9b939bbf3ea4256ed215ea281949**, PR #11. Backend: main **6486294a7aac8fbce1bb4e021fe6e810c1f335df**, running locally using existing installed dependencies. Both recordings use upstream `orgs.json` and its mapping, then change “Test Organization” to “Reviewed Organization.” No partner data, model calls or mocked HTTP results.

The final cut combines two recordings of the same build/workflow. Idle time is shortened and fast interactions slowed for readability. UI states and API responses are not fabricated. Both sessions received two real HTTP 201 responses, retained the first output and downloaded the corrected output through the UI. The recorded download's CRC was not independently checked; the separate automated local-flow CRC evidence remains in [verification](../verification.md).

**Limits shown in the video:** approval/history are browser-local, reload clears the session, HSDS schema checks have not run, semantic correctness is unavailable, and transformation completion is not production readiness or proof of HSDS validity.

Validation: complete MP4 decoded without errors; opening/mapping/output/correction/comparison/export frames were visually inspected. Application code is unchanged by this demo-only addition. [Recording metadata and checksum](recording-evidence.json).
