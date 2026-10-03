# Codex Android QA · 2026-10-03

Status: in progress. The owner requested comprehensive physical Android testing with immediate evidence capture, repair and retesting. This log separates phone evidence from source regressions and does not authorize release work.

## Candidate and isolation

The Samsung SM-A566B runs the existing QA application ID with preserved data. The store application is unchanged. Current JavaScript and the isolated QA Bridge source are both `8f502810`, with Native Codex 0.160.0. Earlier recordings retain their own older candidate provenance. Dedicated Preview Registry/Relay and QA project/thread fixtures are used; the installed Production Bridge and other backend services remain unchanged. A separate uncredentialed Preview profile environment is ready, but its phone acceptance is still pending.

Raw screenshots, OS screen recordings, UI hierarchies and logs stay in ignored local evidence with private access. This report records categories, versions, counts and limitations, not credentials, native identities or conversation payloads.

## Phone results so far

| Surface | Measured result | Boundary |
| --- | --- | --- |
| Pairing and saved connections | Dedicated project Preview and device Preview connect and restore saved connections. | Preview-only QA; no Production re-pairing or Worker deployment. |
| Ordinary messages | New owned conversation and a six-day-old dedicated QA conversation each send once and reach a real native terminal reply. | The old conversation may have retained a warm owner; cold no-owner recovery is still pending. |
| Native models | All eight reported models complete a real native turn with the chosen model and effort, actual usage and unique input. | Native turn contexts did not report actual service tier; settings metadata does not prove Fast execution. |
| Native grouped questions | A genuine blocking Plan request has two fields. An option and a custom answer survive sheet dismissal, backgrounding and App force-stop/cold launch. One Submit produces one same-call native answer output in the original turn and that turn completes. | Plan mode was established only on the dedicated QA fixture through its existing owner; Mobile does not expose a Plan toggle. Live observation proves blocking request, native rollout proves answers, neither is an approval-decision receipt. |
| Long history | An 80-message, 40-completed-turn fixture exposes native pages of 32/32/16. Older candidates jumped to the newly loaded page head. On `8f502810`, two actual prepend boundaries retain the nearby reading location, earliest history is reachable and return-to-bottom reaches the final message. | Recording 012 still shows transient blank regions and recycled assistant text beside the wrong user message at both boundaries. Sparse video frames prove these visible defects; stable screenshots alone missed them. Their repairs and physical retests remain pending. |
| Reply timestamps | The long-waiting question's final reply keeps its completion time and date separator on cold history reload. A later real command-approval reply also shows completion time several minutes after its user prompt. | These are physical checks of `8f502810`; further streaming/recovery scenarios remain in progress. |
| Per-session settings and archive | All five reported GPT-6-Luna effort levels complete native turns. Fast settings report priority. Changing another conversation preserves this conversation's model, effort, Fast and Read-only settings. Archive and restore retain the same scoped conversation and history. | Actual execution tier remains unreported. Restore can update the native-generated title; this is not loss of conversation identity. |
| Real command approvals | Separate fresh Read-only conversations produce genuine native command approvals. Single Deny yields the same original command item declined and no file; single Allow once yields completed/exit zero and exactly one expected small file line. A second write in the same conversation requires a new original-turn approval; single Deny preserves the first line. Background return preserves pending approval. | Strict static code-mode parsing proves one intended command per turn. Live request/item evidence, phone decision, native completion and file state remain separate because denied disk terminals can be absent. On the second Deny the native model nevertheless emits the success token; the App reproduces that native final text and separately shows the command declined. This is not evidence of command execution or recycled text. |
| Native App stability | Immediately after Allow once, the QA App exits to Android Home while the native task completes. Current crash and exit records confirm SIGABRT in RN 0.86.3 ShadowTree commit exhaustion. Cold launch restores saved connections and the original completed response with its completion time, without another native dispatch. | Recovery is physically verified, but the triggering component and crash repair are not yet proven. This is a captured App failure, not a connection or command-execution failure. |

## Repairs under review

The independent task PRs cover pre-dispatch cold recovery rejection, serialized history/pagination, explicit terminal cursors, permissions recovery, stable reader anchors, ordered Desktop following, bounded follower admission, native tool lifecycle projection, retired creation UI handoffs, steering reconciliation and final completion clocks. Additional narrow regressions cover profile focus changes and rejected session actions. Pagination presentation, known local send rejection and the native crash remain active investigations. Narrow local tests and each PR CI distinguish code verification from phone acceptance.

The affected PRs remain unmerged because the required dependency audit reports the newly published high advisory `GHSA-vfj7-8cjw-p6xm` in `braces`. The proposed temporary exception is an owner-only decision; it has not been applied. No audit bypass, signed distribution package, upload, OTA, service deployment or public release has occurred.

## Remaining acceptance

1. Repair and retest transient history blanks and recycled text with fresh native identities and video evidence; preserve reader anchors, paging and bottom following.
2. Run current-task steering, queued messages, editing/removal, Stop and explicit Send now with native input-count and ordering evidence.
3. Test question cancellation and reconnect retirement on disposable QA fixtures; repair and retest the captured native App crash.
4. Extend the verified per-session model/effort/Fast and archive checks to cold restart.
5. Test images, artifact viewing/download/share cancellation, message actions and session management.
6. Read all native profile sections; perform profile writes only in an isolated no-auth home, preserving the real account and preferences.
7. Verify dedicated Desktop-owner controls, isolated cold no-owner recovery and network/background uncertainty without duplicate dispatch.
8. Complete narrow phone non-regression checks on the existing OpenClaw, Hermes, Pi and Claude Code paths.

A completed report must include candidate versions, the actual phone result for each supported surface, remaining owner-only steps and accurate merge/release states. Until then, this work is not a complete Codex acceptance.
