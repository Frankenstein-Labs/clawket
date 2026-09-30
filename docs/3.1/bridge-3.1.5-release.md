# Bridge 3.1.5 release

The owner authorized a Bridge-only release on 2026-09-30. Candidate `@p697/clawket@3.1.5` is being verified; publication is not yet confirmed. No App distribution, cloud Relay/Registry deployment or local user-service restart is included.

## Changes

- Authenticated, bounded image/file delivery for OpenClaw, Hermes, Pi, Codex and Claude Code; files stay on the user's computer and transfer over existing connections without CDN/cloud persistence. See [attachment contracts](backend-attachments.md) and [OpenClaw delivery](openclaw-attachments.md).
- Additive attachment display metadata retains original text for older clients. A matching new App enables attachment cards and image actions; publishing the Bridge alone does not update mobile UI.
- Previously merged Pi pairing reuse avoids replacing a healthy authenticated owner, and Codex/Claude Code pairing labels use product names while preserving configured scope.

## Release gates

Use the fixed release branch, v1 replay, serial affected tests, package contents/provenance verification and isolated installation smoke. Public npm version/dist-tag and downloaded tarball integrity must match the candidate before declaring publication complete. Preserve the old `3.1.4` package for recovery; never unpublish or silently change existing installations.

Local preparation and public verification results will be recorded here. Private package/evidence paths must contain no committed credentials. Internal unpublished workspace versions remain unchanged; CLI manifest, lockfile and publish guard are `3.1.5`.
