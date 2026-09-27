# 3.1 Bridge and service release · 2026-09-27

Owner authorizes production services and Bridge publication after backward-compatibility verification, followed by owner acceptance on Production. Client distribution remains a separate, unauthorised stage. Bridge version: `3.1.0`; source baseline: PR #44 (`398026a`) plus release preparation PR #45 (`2abedfc`). Both PRs passed the complete required CI, Windows/macOS compatibility and secret scan.

## Compatibility and artifacts

- Refreshed read-only exports of all four existing Production Workers confirm the 2026-09-22 anchors. Evidence: `~/.clawket/testing/release-31-20260927/` (private).
- OpenClaw/Hermes × candidate/historical npm 0.7.0: six service upgrade/recovery phases each, 24 phases passed. An additional 12 phases passed with the integrity-verified npm 3.0.0 shipped runtimes. That replay only replaces the CLI main invocation with exports of its unchanged runtime classes; it is not a clean-install CLI test. Its first probe used the pre-3.0 capability expectation, corrected to require 3.0's actual additive capability metadata.
- v1 protocol replay: 39 cases. Relay integration: 4 cases. Publish guard: 6 cases. A native Python/SQLite restart test exceeded the default 5-second Windows CI limit; scoped assertions pass and its bounded 20-second timeout passes Windows CI. No production code changed for that test.
- All existing plain-text configuration values, KV bindings and Durable Object classes are preserved. No pairing-key rotation, data reset, migration-tag change or host network-node change. Four exact pre-release rollback bundles/configs are retained. Local protocol recovery does not prove a future Cloudflare control-plane rollback.
- Fixed npm tarball `p697-clawket-3.1.0.tgz`: SHA-256 `6f128c3ba8341d80786b36ba0fa4511a5ba292437f7c3f6f37eac29413d33fb9`. Package verification covers 3 files, 4 boundaries, 69 runtime modules and 108 provenance inputs. A clean isolated install matches the verified bundle byte-for-byte.
- Pi, Codex and Claude Code each pass actual Production six-digit proof/decryption, claim, session creation, real model reply, duplicate-send suppression, history and saved-token reconnect using that installed tarball and native user authentication. All test-only native Bridge processes are stopped after verification.
- Speech Production is already byte-identical to the candidate (SHA-256 `2cc0ba29057e5042af3060413da3ae7b702fc4effee5312453ccf3297174966a`, version `491efc20-7a1c-4f49-9ad8-9706f500dad7`); no redeploy needed.

## Verified production deployments

| Worker | Version | Verification |
|---|---|---|
| clawket-relay | `185208b4-3573-4352-8b6e-455b3e09108e` | Source hash, identity, health and log settings verified |
| clawket-registry | `1ea54c21-69b0-4ebf-b4c1-d5c3e61d9613` | Source hash, identity, health and log settings verified |
| clawket-hermes-relay | `f1abfdaa-6e3f-4030-9faf-b652b4a1ab42` | Source hash, identity, health and log settings verified |
| clawket-hermes-registry | `6ea9e1eb-d182-4174-bd5f-51f5b3ee0fb7` | Source hash, identity, health and log settings verified |
| clawket-pi-relay | `38f7594d-2f32-4580-81c7-4252ffd39b1a` | Source hash, identity, health and log settings verified |
| clawket-pi-registry | `4b988e08-cc1a-434f-841c-eb9b39644fac` | Source hash, identity, health and log settings verified |
| clawket-codex-relay | `d758c10d-489b-45c8-abd4-a297dd2594ac` | Source hash, identity, health and log settings verified |
| clawket-codex-registry | `c5d0b864-e632-4871-9765-8750a6beff8f` | Source hash, identity, health and log settings verified |
| clawket-claude-code-relay | `1bdb5a0a-4c01-40f7-b411-c6d79ae12864` | Source hash, identity, health and log settings verified |
| clawket-claude-code-registry | `b7d7c7b2-d628-4956-a97a-2f75c55766cd` | Source hash, identity, health and log settings verified |

Deployed source SHA-256: Relay `8c4f952c582566ef686fcb66f945723d2f2f6aa431fdb0607f4a3f64b0d46fcd`; Registry `5ffd9eef69460f78ba3d5d0269f57159bd646f5c2bf4d452fc3106ee6b76f87e`. Each is shared by the five explicitly backend-configured deploy units.

New backend Production KV, DO namespaces and pairing secrets are isolated from each other and Preview. Each deployment runs the v1 gate first and uploads a fixed bundle; deployed bytes and safe logging settings are read back. Existing production pairings are verified before and after each backend update with the 3.0 shipped runtime.

## Release result and remaining acceptance

All ten Workers are deployed. OpenClaw post-deployment verification passed. Hermes first idle probe failed on an abnormal disconnect: cloud logs recorded client close `1006` at 05:31:29 UTC, socket age 103,227 ms. Two independent reruns each passed 130-second idle, heartbeats, saved-token reconnect and refresh/claim. The old runtime code and deployed service did not change between attempts. Cloud evidence is a bounded aggregate query; no specific network component is established as the cause. The first failure is retained, its root cause is unproven, and rerun success is not evidence that external network stalls are fixed. Readback confirms all existing binding values, secret names, KV namespaces and DO namespaces are unchanged; the four existing custom-domain health endpoints return 200. The owner completed official npm CLI authentication (`p697`) and the separate publication security-key challenge. The final v1 gate passed all 39 cases. npm publication succeeded; at 2026-09-27 05:44:40 UTC public metadata reports `latest=3.1.0`, and a fresh public tarball download matches both the fixed SHA-256 above and npm SHA-512 integrity. Evidence: `npm-public-verified.json`. Client builds/uploads/releases are not part of this authorization. Publishing npm does not auto-upgrade installed Bridges; Worker deployment may cause a recoverable reconnect, so this is not a zero-interruption promise.

Owner acceptance still covers the client experience and physical-device/store upgrade/entitlement checks. Previously observed external network stalls are not declared fixed by this release. Universal/App Link acceptance on final signed clients remains separate from the verified six-digit/QR pairing flow.

For owner Production acceptance, install `npm install -g @p697/clawket@3.1.0` and use the normal backend pairing flow without `--preview`. This release did not replace the owner's global CLI or switch existing phone Preview connections. All isolated native release-test runtimes are stopped.
