# Server and Bridge 3.1.4 release

The owner authorized releasing the server and Bridge first, preserving existing users and older clients. This candidate contains the tested additive Relay recovery controls, local WebSocket admission safeguards, Codex native settings/continuation/history improvements, and bounded SDK session catalogs and prompt receipts. Mobile distribution is separate. The existing Mobile analytics type accepts the additive `archive` action so the shared contract remains type-compatible; no Mobile UI or runtime changes are included.

## Scope

- Five Relay deployments: OpenClaw, Hermes, Pi, Codex and Claude Code, each retaining its current independent resources.
- Bridge npm package `@p697/clawket@3.1.4`; internal unpublished workspace versions remain unchanged.
- No Registry deployment, database/DO migration, pairing reset, secret rotation, DNS/WAF change, local-model Relay deployment or App release.
- The isolated candidate excludes concurrent Mobile, CLI naming/re-pairing and Registry diagnostics changes. Its backend source is copied from the validated development candidate; publish guard/version changes are separately checked.

## Compatibility and rollout

New owner/client round-trip controls, presence and large-frame hints require capability negotiation. Legacy heartbeat handling, OpenClaw routing and array-shaped `sessions.list` remain available. Existing App/Bridge installations are not forced to upgrade. Deploying a Relay may cause a brief reconnect; backward compatibility is not a promise of uninterrupted sockets.

Before deployment, verify the fixed commit's CI, v1 replay, current-production bundle rollout matrix and package provenance. Record each current deployment and preserve configuration/bindings. Deploy one backend at a time, check readback and scoped smoke before advancing, and stop on a regression. No new DO migration is involved; use the recorded compatible service version if recovery is needed. npm dist-tag rollback affects future installs only; an installed Bridge requires explicit version installation/restart.

Known non-blocking risks remain in the development acceptance report: selective periodic stalls have not been attributed, original Desktop GUI recovery lacks actual-window closure, and one transient settings display degradation was not reproduced. Native settings/continuation probes and scoped recovery passed; do not claim these unknowns are eliminated, performance percentiles or competitive superiority.

## Evidence and status

- Isolated candidate v1 replay: five files / 41 tests passed.
- Publish guard tests: six passed after updating both accepted and rejected version fixtures for 3.1.4.
- Documentation: seven instruction pairs / five checker cases passed.
- Previous validated backend development candidate: 24/24 local rollout phases using current Production bytes; rerun against the selected release candidate before deployment.
- Package build, immutable candidate CI, deployment anchors, production smoke and npm publication: pending. Nothing is published by this document.

Private evidence: `~/.clawket/testing/server-bridge-release-20260929/`. No credentials or pairing payloads belong in this document.
