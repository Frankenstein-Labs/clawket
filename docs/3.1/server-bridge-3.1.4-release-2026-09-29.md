# Server and Bridge 3.1.4 release · 2026-09-29

The owner authorized releasing the server and Bridge first while preserving existing users and older clients. The fixed production candidate is `800befa999d013a55d9333ae8ff1ff02e7691e8a` ([PR #47](https://github.com/p697/clawket/pull/47)). Five Relay services are deployed and verified. **Bridge `@p697/clawket@3.1.4` is publicly available; npm `latest=3.1.4`.** Public registry metadata and the downloaded tarball were verified at 2026-09-29 12:34 UTC against the immutable candidate (SHA-256, npm SHA-1 and SHA-512 integrity all match). npm first accepted the upload asynchronously; publication was not declared complete until public verification succeeded. Mobile distribution is separate.

## Scope and compatibility

The candidate adds capability-negotiated Relay recovery/presence and large-frame controls, local WebSocket admission safeguards, Codex native settings/continuation/history improvements, bounded session catalogs and prompt receipts. Legacy clients retain heartbeat/routing compatibility and array-shaped `sessions.list`. Old installations are not forced to upgrade or re-pair.

No Registry deployment, database/DO migration, pairing reset, secret rotation, DNS/WAF change, local-model Relay deployment or App release occurred. Independent resources, all existing Relay bindings/vars, compatibility dates and sanitized logging settings were checked before and after each deployment. OpenClaw/Hermes Registry code bytes and deployment IDs remained unchanged. Only isolated QA pairing records were added for production transport probes; user pairing records and local user Agent processes were not altered.

Concurrent Mobile UI, CLI naming/re-pairing and Registry diagnostics work is excluded. One Mobile analytics union accepts the additive `archive` action to keep the shared contract type-compatible; it introduces no runtime/UI behavior. The internal unpublished package versions remain unchanged.

## Release evidence

- Fixed-commit [CI](https://github.com/p697/clawket/actions/runs/36562701069): all four jobs passed, including macOS/Windows Bridge and Relay compatibility, required checks, and secret scanning. Required checks include 363 Mobile suites / 3,953 cases. This is not a claim that all dependency advisories are absent.
- v1 replay: five files / 41 tests passed locally and before each Relay deployment. Publish guard: six cases; docs: seven instruction pairs / five checker cases.
- Production rollout matrix: four cases / 24 upgrade/recovery phases passed against current production bytes, refetched and SHA-verified before rollout. The historical matrix includes published 0.7.0 Bridges. Cloudflare actual rollback was not exercised.
- Package build, package provenance (83 runtime modules / 123 inputs), npm dry-run and fixed tarball verification passed. Tarball SHA-256: `9fbed8665a8ca12ecb05986755d4767e2fbe66b75b11da77926efcfc0d0ad796`; npm shasum: `80c7fb73f01ce1918cf7df1f9233646c48654135`.
- Live Production: all five backend paths passed authenticated health, sessions, controlled message/history requests and saved-token reconnect. OpenClaw/Hermes used published 3.0.0 Bridge transports and previously claimed credentials; both retained legacy non-pong clients for 130 seconds, followed by successful health. Pi and Claude also passed a 130-second non-pong probe.
- Additional old-client recovery: eight adapter/transport files match pre-change commit `a7c76b7a` byte-for-byte. Codex/Claude/Pi adapters recovered automatically after a forced owner restart, with single-run recovery measurements of 4,718 / 5,380 / 5,121 ms, then successful history reads. Codex was followed for 150 seconds; Claude/Pi for 30 seconds. These are actual client networking code run in Node with only native ID generation replaced, **not device UI measurements or latency percentiles**. Backend/model replies are controlled in these production transport checks; prior actual model/device acceptance is separate.

The subsequent documentation-only CI run `36567908958` passed required checks, Windows and secret scanning, but failed the existing macOS local-model supervisor concurrent-start case (`command failed: 1`). That script is unchanged and is not included in the npm tarball. The failure is retained for follow-up; source-candidate CI above was fully green. Final documentation CI must pass before merging the release PR.

## Exceptions retained

Two initial raw-socket probes failed: Claude closed during its first 130-second window (close code not captured); Codex observed an owner heartbeat timeout, owner recovery in about 0.7 seconds, and a later stale-client request timeout. Rollout stopped both times. These failures are preserved, not counted as passes or attributed conclusively to the network.

A forced owner restart then confirmed Relay explicitly retires the old socket with `4011 gateway_unavailable`, and the pre-change mobile transport automatically reconnects and re-handshakes. A raw socket without that recovery behavior is not a complete App acceptance test. Claude's instrumented 130-second repeat and all three old-adapter recovery checks passed; an unchanged Codex Relay control also passed 130 seconds. This supports compatibility and controlled release, but does not prove periodic stalls are eliminated. A live connection may briefly reconnect during deployment or owner recovery. Original Desktop GUI recovery and the transient settings-display observation remain the previously documented verification limits.

## Production anchors and recovery

All five live source hashes match the candidate bundle: `22afaffeb4c5cf65710ff4fc83f965cf30c23f7fd4c9668f05151e4aef33ff91`. Each service is at 100% of its recorded version.

| Backend | Released Relay version | Previous compatible version |
|---|---|---|
| pi | `8e217727-cc74-4acd-94e5-36b57b73741a` | `38f7594d-2f32-4580-81c7-4252ffd39b1a` |
| claude-code | `2c5f88d0-f452-413c-a778-a98b70ca589b` | `1bdb5a0a-4c01-40f7-b411-c6d79ae12864` |
| codex | `218bc62c-3b34-4b16-b027-1b43dc0643e7` | `d758c10d-489b-45c8-abd4-a297dd2594ac` |
| hermes | `89f3acdd-5956-4267-ae0a-d88ccd2f442f` | `f1abfdaa-6e3f-4030-9faf-b652b4a1ab42` |
| openclaw | `267ef8c2-ef47-4e24-a2b1-dbf509fb9fdc` | `185208b4-3573-4352-8b6e-455b3e09108e` |

If a regression is confirmed, stop rollout and restore the recorded version for that backend with its existing local deployment configuration; no new DO migration was introduced. Preserve bindings, credentials and logs. npm dist-tag recovery only changes future installs; installed Bridges require explicit version installation/restart. Server publication does not automatically update a user's installed Bridge, and client UI changes still require a separate App release.

Private evidence: `~/.clawket/testing/server-bridge-release-20260929/` (source/deployment snapshots, CI logs, rollout matrix, raw failures, recovery traces and immutable package). No credentials or pairing payloads belong in this document.
