# OpenClaw device-token recovery — 2026-09-29

## Failure and fix

A Gateway `AUTH_TOKEN_MISMATCH` reply containing `unauthorized: device token mismatch` started asynchronous credential deletion but also emitted a terminal protocol error. The adapter rejected its connect promise and the coordinator retired the connection in a microtask, invalidating the pending repair. This was a real regression, reproduced by a delayed-deletion test before the fix.

The protocol now owns a bounded repair for a rejected **stored device token**. It preserves the pending adapter handshake, deletes only the original Gateway/Relay credential scope, and reconnects without publishing an authentication rejection. Token/scope mismatch codes and the existing legacy device-token-mismatch text remain supported. The repair budget resets on a fresh connection or verified readiness, not on an automatic socket retry.

Missing stored-device authentication, a repeated rejection or deletion failure becomes a terminal `auth_rejected`, stops the transport and retains the coordinator's user-action requirement. A remote-close replacement waits for the same scope's deletion; another Gateway is not blocked. Epoch/handshake fencing prevents late cleanup from reviving a disconnected or reconfigured connection. No authentication bypass, identity reset, global token deletion or message replay is introduced.

Hermes handshakes and the shared `requiresConnectionAction` classifier are unchanged.

## Verification

- Regression failed before the fix: the first mismatch emitted an actionable error during delayed token deletion.
- `gateway-client.legacy-parity.test.ts`: 138 passed, including real protocol + OpenClaw adapter readiness across token/scope/legacy-text rejection, refreshed credential persistence, repeated rejection, storage failure, remote-close races, scope switching and explicit disconnection.
- `index.test.ts`: 198 passed, including coordinator auth rejection/manual retry coverage across backends.
- `gateway-adapter.lifecycle.test.ts`: 51 passed, covering OpenClaw and Hermes lifecycle behavior.
- Registry `backend-contract.test.ts`: 16 passed. Its existing corrected redacted-log assertion was preserved (`reason: transport_error`, no raw `message`).

- Historical v1 live replay: 8 passed (OpenClaw and Hermes); Mobile TypeScript, documentation checks (7 instruction pairs / 5 cases), and scoped diff checks passed. Tests ran serially after stopping the owned Metro process.

These are local automated tests with controlled WebSocket/storage fixtures, not a live Gateway credential-revocation experiment. Existing device credentials and production services were not changed. This fix requires a client update; no release or version bump is part of this task.
