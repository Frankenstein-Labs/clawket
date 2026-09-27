# 3.1 Bridge and service release · 2026-09-27

Owner authorizes production services and Bridge publication after backward-compatibility verification, followed by owner acceptance on Production. Client distribution remains a separate, unauthorised stage. Bridge version: `3.1.0`; source baseline: merged PR #44 (`398026a`).

Order: provision isolated Pi, Codex and Claude Code Production services, verify their real pairing/message paths, then publish Bridge. Existing OpenClaw/Hermes service updates require saved-pairing recovery checks before proceeding to the next backend. No pairing-key rotation, data reset or change to the computer's network node. Publishing npm does not auto-upgrade installed Bridges. A Worker deployment may reconnect WebSockets; automatic recovery is a release check, not a zero-interruption promise.

Read-only Production snapshots were refreshed into the private evidence directory `~/.clawket/testing/release-31-20260927/snapshots/`. All four existing deployments still match the 2026-09-22 release anchors. The release integration matrix passes OpenClaw/Hermes × candidate/historical npm 0.7.0 Bridge across six upgrade/recovery phases (24 phases), retaining saved pairing and exercising handshake, health, controlled chat, sessions and code refresh. This is local workerd protocol evidence, not Cloudflare migration rollback proof. Version 3.0.0 package and live verification are tracked separately.

Current state: preparation and compatibility checks only; no production deployment or npm publication yet. Record final service versions, artifact hashes, actual smoke results and any blockers here before declaring the release complete. Physical-device/client distribution and the previously observed external network stalls remain distinct acceptance scopes.
