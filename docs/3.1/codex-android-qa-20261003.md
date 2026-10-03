# Codex Android QA · 2026-10-03

Status: in progress. The owner requested comprehensive physical Android testing with immediate evidence capture, repair and retesting. This log separates phone evidence from source regressions and does not authorize release work.

## Candidate and isolation

The Samsung SM-A566B runs the existing QA application ID with preserved data. The store application is unchanged. Candidate JavaScript is `628e0be9`; the isolated QA Bridge bundle is `e0357cee`. Later Mobile-only patches do not imply a newer native Bridge build. Dedicated Preview Registry/Relay and QA project/thread fixtures are used; the installed Production Bridge and other backend services remain unchanged.

Raw screenshots, OS screen recordings, UI hierarchies and logs stay in ignored local evidence with private access. This report records categories, versions, counts and limitations, not credentials, native identities or conversation payloads.

## Phone results so far

| Surface | Measured result | Boundary |
| --- | --- | --- |
| Pairing and saved connections | Dedicated project Preview and device Preview connect and restore saved connections. | Preview-only QA; no Production re-pairing or Worker deployment. |
| Ordinary messages | New owned conversation and a six-day-old dedicated QA conversation each send once and reach a real native terminal reply. | The old conversation may have retained a warm owner; cold no-owner recovery is still pending. |
| Native models | All eight reported models complete a real native turn with the chosen model and effort, actual usage and unique input. | Native turn contexts did not report actual service tier; settings metadata does not prove Fast execution. |
| Native grouped questions | A genuine blocking Plan request has two fields. An option and a custom answer survive sheet dismissal, backgrounding and App force-stop/cold launch. One Submit produces one same-call native answer output in the original turn and that turn completes. | Plan mode was established only on the dedicated QA fixture through its existing owner; Mobile does not expose a Plan toggle. Live observation proves blocking request, native rollout proves answers, neither is an approval-decision receipt. |
| Long history | An 80-message, 40-completed-turn fixture exposes native pages of 32/32/16. Two candidate recordings reproduced a no-input jump after loading earlier history. | Latest native-sizing candidate keeps the content through 20 seconds of no input, but a following half-screen drag jumps from group 25 to group 9. Screens and another OS recording preserve this residual failure. A fresh owned/native identity and an unprewarmed target history separate this from the old cached phone window. |
| Reply timestamps | After answering the long-waiting native question, the final reply first shows completion time and then changes to the original question time during reconciliation. | Captured in paired screenshots and OS recording; repair and physical retest pending. |

## Repairs under review

The independent task PRs cover pre-dispatch cold recovery rejection, serialized history/pagination, explicit terminal cursors, permissions recovery, stable reader anchors, ordered Desktop following, bounded follower admission, native tool lifecycle projection, retired creation UI handoffs and steering reconciliation. Narrow local tests and each PR CI distinguish code verification from phone acceptance.

The affected PRs remain unmerged because the required dependency audit reports the newly published high advisory `GHSA-vfj7-8cjw-p6xm` in `braces`. The proposed temporary exception is an owner-only decision; it has not been applied. No audit bypass, signed distribution package, upload, OTA, service deployment or public release has occurred.

## Remaining acceptance

1. Retest earlier-history anchors with the fresh 80-message window, no-input settling, a new drag during paging and resumed bottom following.
2. Run current-task steering, queued messages, editing/removal, Stop and explicit Send now with native input-count and ordering evidence.
3. Test true command approval denial/allow-once, question cancellation and reconnect retirement on disposable QA fixtures.
4. Test per-session model/effort/Fast settings across conversation changes, archive/restore and cold restart.
5. Test images, artifact viewing/download/share cancellation, message actions and session management.
6. Read all native profile sections; perform profile writes only in an isolated no-auth home, preserving the real account and preferences.
7. Verify dedicated Desktop-owner controls, isolated cold no-owner recovery and network/background uncertainty without duplicate dispatch.
8. Complete narrow phone non-regression checks on the existing OpenClaw, Hermes, Pi and Claude Code paths.

A completed report must include candidate versions, the actual phone result for each supported surface, remaining owner-only steps and accurate merge/release states. Until then, this work is not a complete Codex acceptance.
