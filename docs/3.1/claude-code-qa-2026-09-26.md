# Claude Code candidate QA — 2026-09-26

This is an unreleased development candidate. Preview deployment, local Bridge execution and development-client testing are distinct from Production deployment or app/package publication. No Production release has been performed.

## Native and device evidence

- Installed, unmodified Claude Code CLI 2.1.280, official Agent SDK 0.3.283, official CLI account authentication. No Desktop credential extraction or alternate-model provider.
- Isolated project: native first response, original owned session resume, two-turn context, native history, duplicate-send suppression and real AskUserQuestion single/multiple choice.
- Android physical device (SM-A566B, Android 16): local QR pairing, project selection, new chat and exact reply. A multi-choice question retained both answers after force-stopping/reopening the app; the native model confirmed both selections.
- iOS 27 simulator: local QR pairing and exact reply; native single-choice form, custom answer received by the model, real Write permission allowed and filesystem content verified. After leaving/reentering the conversation, a second pending permission was recovered and denied; the target file remained absent and the model stopped without retrying.
- Android Preview: official six-digit secure pairing and confirmation, isolated Registry → Relay → Bridge → official CLI, exact `CLAUDE_PREVIEW_OK` reply. Connection/history recovered following an intentional Bridge stop/restart. A second turn sent through the authenticated Preview protocol remembered the phrase from before restart; its reply appeared on the Android device. This is recovery evidence, not a measured automatic-reconnect latency guarantee.

Private screenshots and executable QA evidence remain under `~/.clawket/testing/claude-code-implementation-20260926/`. QR codes, pairing credentials, native transcripts and account data must not be committed.

- Both iOS and Android model sheets were visually inspected with native resolved IDs. Selecting Sonnet on iOS produced `IOS_SONNET_OK`; native history confirms `claude-sonnet-5`.
- iOS Stop task during a real AskUserQuestion cleared the pending question only after native termination. A subsequent image message identified Red/Blue correctly and remained in native history. The image was submitted through the authenticated Bridge protocol and rendered on iOS; this does not claim mobile photo-library upload coverage.
- Official SDK `forkSession` on the isolated native QA conversation: the fork retained the remembered phrase, used a new native ID, and the source history was byte-for-byte unchanged through the SDK projection. Full native-import/fork UI navigation remains a separate owner acceptance check.

## Issues found and corrected

- Claude was missing from the rendered onboarding chooser despite having a configured option.
- Batched multi-selection taps could overwrite the previous selection. The form now uses the latest draft for each toggle; radio behavior is preserved.
- An approval snapshot lacked the shared chat controller's session envelope. Live requests displayed, but pending consent disappeared after reopening a chat. The Claude adapter now supplies the envelope; real pending-request recovery and denial were retested.
- Normalized tool rows now retain their canonical native call identity across live/history refresh, avoiding duplicate tool cards; legacy result-ID fallback is unchanged.
- Native `/model` command envelopes and interruption markers appeared as user bubbles after history refresh. Exact native envelopes are now omitted, while ordinary text discussing commands remains visible.
- Native model aliases were shown without their concrete model IDs. Preserve SDK `resolvedModel` as an optional, searchable secondary label, while keeping the native alias as the selection identity. Do not hardcode an alias's current model version.
- Stopping a structured question must use native interruption and retain the pending state until native termination; denying its tool callback alone does not prove task cancellation.
- First-turn model metadata is persisted from native initialization. Owned/forked native IDs are excluded from duplicate discovery rows.

## Isolated Preview deployment

- Registry: `clawket-claude-code-registry-preview`, version `c79b5941-3f4e-419c-a917-dd1075418c97`.
- Relay: `clawket-claude-code-relay-preview`, version `17c3089b-f8a7-4d3a-a50c-e5c06cc71635`.
- Independent KV, `ClaudeCodeRelayRoom`, Registry rate-limiter namespace and newly generated ticket/sync secrets. Other backend deployment units were not deployed.
- Compatibility date stays at 2026-09-17, matching the pinned 4.131.0 toolchain's supported workerd date; a newer unsupported date failed local startup and was corrected before deployment.
- All five v1 replay files passed individually before deployment: fixtures 8, historical client 7, historical image 9, legacy Bridge 9, live replay 6 (39 total).
- `tests/claude-code-relay/relay.test.ts`: secure pairing, invalid proof rejection, two-client response isolation, streaming broadcast, reconnect and offline rejection against local Workers.

## Product limits

Desktop/CLI discovery reads native metadata without taking ownership. Released imported conversations support same-ID continuation after fresh ownership checks and a shared writer lock; occupied or unknown owners remain blocked. Explicit branching uses official `forkSession`. Arbitrary live Desktop/TUI takeover is not implemented. Historical timestamps are unavailable from the SDK and are not invented. Unsupported steer, effort controls, skill-management and undeclared SDK dialogs are not advertised. Native authentication/MCP authorization remains on the computer.

The public npm package and Production services do not yet contain this candidate. Generic installed-backend autodetection still covers the original OpenClaw/Hermes bundle; Claude uses the explicit `pair --backend claude-code` onboarding command. Validation is narrow and serial under the owner's resource rules, not a claim that the full repository gate was run.

## Focused verification

Files were run individually, serially (no full repository suite):

- Runtime `claude-code/{history,catalog,interactions,owners,session,store,history-page,service,server,models}.test.ts`; affected history/service/session/models files rerun after final changes.
- CLI `claude-code.test.ts`; protocol `capabilities.test.ts`.
- Mobile `claude-code.test.ts`, `AgentQuestions.test.tsx`, `question-drafts.test.ts`, `ModelPickerModal.test.ts`, `ModelPickerModal.view.test.tsx`.
- Existing-backend regression files `gateway-adapters.recorded.test.ts`, `gateway-adapter.lifecycle.test.ts`, `pi.test.ts`, `codex.test.ts` passed. These are recorded/self-contained tests, not a claim of new live OpenClaw/Hermes model conversations in this session.
- Native SDK/CLI smoke, live Preview resume, native fork, permission allow/deny, question cancellation and image evidence are retained privately. A Maestro `hideKeyboard` step failed; the same iOS send was completed and verified through native UI automation. Failed automation attempts were not counted as passing flows.

Final checks: Bridge development bundle/runtime compilation, mobile TypeScript, design-system checks (218 UI files), i18n (19 locales) and agent documentation checks passed. `useChatHistoryState.test.ts` additionally covers native tool identity and existing OpenClaw/Hermes history behavior. No signed distribution artifact was prepared.

## Device discovery follow-up

The earlier device coverage used explicit QA-project pairings, so it did not prove native project discovery on the phone. Owner feedback exposed this gap. Additionally, first-time default detached pairing lost its device flag when the parent appended a new `--config` path; the child could create a project-scoped configuration. Scope propagation is now explicit and tested through parent/child invocation. Existing project pairings remain restricted and are not silently migrated.

The normal default Preview pairing command now creates a device-scoped connection with the persistent Chats fallback. Read-only discovery found 17 project directories and 113 native sessions; an actual native history page loaded 100 messages. Standard native saved project keys supplement conversation-derived directories; unreadable/malformed metadata degrades safely, and custom Claude homes do not import the default account's registry.

Android: normal secure pairing → native conversation list → New conversation → shared project picker → select the actual Clawket repository → real model reply confirming `/Users/lucy/Desktop/me/clawket`. This is a different cwd from the Chats fallback and the original isolated QA project. No files were changed by the model. iOS: enabled the existing Preview debug setting, securely paired the same device connection, saw native conversation titles/projects, selected Chats in the shared New conversation picker, and received the exact `/Users/lucy/Documents/Clawket/Chats` reply. The earlier iOS pairing attempt targeted the non-Preview environment while Debug Mode was off and failed; it was not counted as a successful pairing. Both devices remain on the new device connection; old explicit QA-project connections remain scoped.

Follow-up focused tests: CLI `claude-code.test.ts` (6), runtime `catalog.test.ts` (4), `saved-projects.test.ts` (1), `service.test.ts` (7). macOS canonical `/private/var` paths required correcting the fixture expectation; the final parent/child scope regression passes.

## Android session-panel responsiveness follow-up

Owner feedback distinguished a slow, janky panel from an unresponsive button. Opening the panel previously changed navigator-root state and rerendered mounted screens, including the underlying transcript and roster. `SessionPanelHost` now owns presentation state and explicit connection/Agent/session scope; export still waits for dismissal. Rows retain memoized rendering, and project refresh runs only while visible, retaining the same adapter's last catalog and discarding late responses after closure or replacement.

Focused `SessionPanelHost.test.tsx` (2), `SessionPanel.test.tsx` (18), and `ThreadScreen.test.tsx` (55) pass, including no parent rerender on open/close, existing session actions, cache retention and cross-adapter response isolation. The latter two mocks needed the newly consumed `Platform` API. Mobile TypeScript, design-system checks and documentation checks pass.

Android SM-A566B: opened the panel over native history, scrolled, searched, selected the earlier owned repository conversation and verified its retained cwd response; selected Chats for a new empty conversation. A private screen recording confirms expansion and populated rows without a blank full-screen transition. Development CPU samples show eliminated background roster work and reduced repeated row work, but differ in background activity and are not a production latency benchmark. iOS 27 simulator: Maestro verified open → project filter → close child → close panel → reopen → close. No signed distribution build or publication was performed.

The Android QA package had last been updated on September 25, before the new native voice module. Rebuilt and installed the arm64 Debug package in place (same QA application ID, version and signing identity; saved connections/data retained). Gradle's existing cache and Java TLS downloads failed initially; an isolated local cache plus unchanged-version artifacts from the official Maven repositories completed the build. No dependency versions or production build configuration were changed. Actual microphone capture was confirmed through Android AppOps, followed by Stop and successful transcription of a spoken test sentence into an editable draft. Nothing was sent to the Agent; the test draft was cleared and capture was confirmed stopped. This does not cover Bluetooth, calls, first-syllable timing or an updated iOS native voice package. Development reload also surfaced an existing RevenueCat offerings/network warning; these checks do not certify billing.


## Historical conversation scroll follow-up — September 26

Reproduced on the physical Android device with full imported Claude history. Two shared timeline faults issued native `scrollToEnd` during a reader drag: the first movement within 24 points of the bottom immediately re-enabled follow, and a roughly 2,961-point reduction in virtual row estimates was treated as overscroll while the reader was 1,166 points from the end. FlashList was already maintaining the visible anchor; estimating a second correction fought it.

The shared timeline now suspends bottom follow throughout drag and momentum, resumes only after settling at the bottom (or explicit send/return), and never infers overscroll from virtual content-height deltas. A slow drag without momentum has a cancellable settle fallback. Genuine measured native overscroll outside a gesture retains its existing correction. No adapter, protocol, history content or native session ownership was changed.

Android 16 physical device: opened two imported histories through the session panel; after the fix, six consecutive upward-history gestures on the long conversation produced zero automatic bottom corrections, remained in older content after settling, and the explicit return action reached the actual end. iOS 27 simulator: Maestro opened that history through the panel and performed six gestures, likewise with zero automatic bottom corrections and the return action visible. Temporary development instrumentation recorded only scroll geometry/intent and was removed. Full-history QA temporarily used the existing local development Pro override; Metro was then restarted with its original environment. This does not verify billing or change production entitlements. Private screenshots and metadata remain in the local QA directory, not the repository.

Focused `ThreadView.test.tsx`: 108 tests passed in-band, including the new measured drag/re-estimation sequence for OpenClaw, Hermes and Claude Code, momentum, resting history/prepend, no-momentum settlement and timer isolation across session changes. Existing streaming/new-row follow, keyboard/composer, explicit return and reduced-motion cases also pass. These shared-view tests do not constitute a new live end-to-end messaging run for every backend. Mobile `tsc --noEmit`, `git diff --check` and `check:docs` (7 instruction pairs, 5 tests) also passed. No release or production deployment was performed.


## Native-history explanation and owner QA access

The blanket read-only behavior below records the earlier implementation; the released-session continuation section that follows supersedes it.

The owner requested that Android retain Pro for acceptance after the temporary scroll-testing override was restored. Enabled the existing `EXPO_PUBLIC_UNLOCK_PRO=1` in the ignored local development environment, restarted Metro and reloaded Android; the live runtime flag and unlocked roster/native history were verified. This is local QA access, not a store subscription or production entitlement change. Leave this owner-requested setting enabled.

At that earlier checkpoint, native read-only history received a secondary-text explanation above “Continue in a new session”: imported conversations are read-only; continuation preserves context in a new session and leaves the original unchanged. This is gated by existing native-source/capability/continuation metadata, with no backend-specific screen condition, and translated into all 19 locales. At that checkpoint, closing Desktop did not enable direct continuation; the follow-up implementation below replaces this blanket restriction. Android screenshot inspection confirmed a readable two-line hint above the existing action. `ThreadScreen.test.tsx` passed 56 tests in-band, including Pi/Claude explanation and the existing explicit fork request/navigation. No model prompt or fork was issued to the user's original history in this copy-only acceptance.

Verification also passed Mobile TypeScript, UI style (220 UI files), strict i18n (19 locales, no missing keys), instruction documentation (7 pairs, 5 tests), and diff whitespace checks.


## Released native-session continuation (owner-authorized follow-up)

Implemented same-ID continuation for released native Desktop/CLI histories. Native source/key/cwd remain stable; no automatic fork, native rename/reset/delete, or takeover of an idle/busy/waiting/unknown owner. A fresh native roster and a shared per-native-session Clawket writer lock precede SDK resume. Imported SDK processes release after settlement; browsing history/model options does not resume the original. Phone footers explain occupied/unknown/missing-project states, provide a fresh status check, and retain explicit branching. Nineteen locales updated.

Device evidence (private `~/.clawket/testing/claude-code-implementation-20260926/`):

- Official unmodified CLI 2.1.280, interactive terminal, isolated `native-continuity` project: seeded a test phrase and received `NATIVE_READY`. While the terminal was idle, Preview and physical Android showed `in_use` with a clear explanation. Closed only that QA process; Android “Check again” restored the composer. An actual phone send recalled the phrase in the original native conversation.
- Claude Desktop Code UI: created a separate QA conversation in that same isolated directory, using Manual permissions. After the answer, native discovery reported its idle owner and blocked continuation. Archiving only this QA conversation released its owner. iOS simulator selected the imported Desktop conversation, sent a context question through the normal composer, and received its original phrase.
- SDK history verified both original native IDs and cwd, original and phone user turns in each same transcript, and original models retained (CLI Sonnet; Desktop Opus). No user-owned existing conversation was prompted, terminated or modified.
- Rebuilt and restarted the final local Preview Bridge, then used Android Maestro to reopen the original CLI QA conversation and send another context question. The exact phrase plus `RESTART_OK` appeared; SDK evidence now contains three CLI user turns under the original ID/cwd.
- During post-restart navigation, a stale coordinate selected the explicit fork action on another history. No prompt was sent and the source transcript was unchanged; the resulting unused Clawket conversation (zero accepted messages) was removed through `sessions.delete`. The SDK-created copy is retained locally under the existing transcript-retention policy. Final acceptance used fresh selectors and only the dedicated QA conversation.
- Initial iOS navigation flow reported a text-selector failure although its screenshot showed the intended conversation had opened. A separate composer/send/assertion flow passed. Do not count the first flow as a full pass.
- Reverse Claude Desktop GUI continuity is **not yet accepted**: subsequent desktop automation repeatedly returned stale/menu state and `noWindowsAvailable`, so reopening the archived QA conversation and seeing mobile turns in Desktop was not verified. Native same-transcript evidence is not a substitute for this UI check. No arbitrary live Desktop attach is claimed.

Focused checks completed serially: runtime `service` 18, `owner-lock` 3, `store` 4, `owners` 8, `session` 4, `catalog` 4; Mobile `ThreadScreen` 61, `roster-cache` 20, Claude adapter 11. Protocol/Mobile/runtime typechecks, design-system checks (220 UI files), strict i18n (19 locales), agent-document checks and the five v1 replay files (39 tests) passed. No full local suite was run. Existing Pi native branching and Codex native composer behavior have explicit ThreadScreen coverage; OpenClaw/Hermes shared screen behavior and historical replay remain green.

Only the local Claude Preview Bridge and Metro development client are updated; no new cloud deployment, production change, package publication, version bump or store distribution.
