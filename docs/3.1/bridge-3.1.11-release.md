# Bridge 3.1.11 release

The owner authorized this patch publication on 2026-10-03, based on fresh `main` at `1ecad2e45b72be4e2cbb339eec1a46e9348282ea`. Public npm latest was 3.1.10 and 3.1.11 was unused when preparation began. Publication and public verification are pending.

## Changes since 3.1.10

- Unified `clawket update` stages a verified immutable stable package and replaces idle, authenticated managed instances while preserving existing pairing, credentials, history and scope. Package metadata `clawket.updateProtocol: 1` enables compatible phone guidance. Unknown ownership fails without replacement; independent supervisors retain their original deployment method. See [upgrade behavior and limits](../bridge-updates.md).
- Hermes pairing can recover a stale Clawket-started gateway without stopping unrelated processes.
- Operational diagnostics cover the supported backends consistently.
- Explicit Codex and Claude Code pairing backfills missing computer names and synchronizes Registry names while retaining connection identity and every saved nonblank label.

Only the CLI manifest, workspace lock entry and publication guard advance to 3.1.11. Internal workspace versions stay unchanged. Publishing does not upgrade running processes, re-pair devices, distribute an App or deploy Workers. The phone settings UI requires a separate App release.

## Verification and delivery

Release verification is in progress. Fixed artifact, source provenance, private logs, Production deployment-anchor checks, local OpenClaw/Hermes upgrade/recovery matrix and isolated candidate/public installations are retained under `/Volumes/Lucy-SSD/clawket-release-evidence/bridge-3.1.11`.

Recovery retains public 3.1.10: install that explicit version and restart the selected managed runtime through its original deployment method and scope/config/environment. A dist-tag change alone does not replace a running process. The unified updater deliberately rejects downgrades of a known running version; use the original lifecycle method for rollback.
