# Google Play 3.1.0 submission — 2026-09-28

Owner explicitly authorized building the signed production Android package, uploading it to Google Play and submitting 3.1.0 for review. All three actions completed; no public release was performed.

- Source: `1c09aef1658238307afcf644a5c41fb7482607c0`. Exact-commit Required checks CI run [36324049215](https://github.com/p697/clawket/actions/runs/36324049215) passed all four jobs. Rechecked 1,172 source-file hashes after packaging; no drift. No full local test suite was run.
- Package: `com.p697.clawket`, version **3.1.0 / 30101**, 99,458,299 bytes. SHA-256: `40c268c441f3adec289f9f16746c24b75b872bd3fe197068b9d70e61bd317e65`.
- Canonical AAB script completed public-config validation and prebuild. Default Gradle cache failed Kotlin version-catalog resolution; a separate QA cache restored compilation but needed a slow release dependency download. Completed with the previously successful store-build cache at `/Volumes/Lucy-SSD/Relocated/Caches/dev/clawket-sdk57-gradle`. Used two Gradle workers and two Metro workers; four ABIs retained. Only generated/ignored Android configuration changed.
- `bundletool validate` and `jarsigner -verify` passed. Upload certificate exactly matches the previously published 3.0.0/30001 AAB. Production speech hostname is embedded; official configuration validation passed, RevenueCat test key absent and Pro unlock disabled; manifest is not debuggable. Bundle requests `PAGE_ALIGNMENT_16K`; all 54 64-bit libraries out of 108 native libraries have LOAD alignment of at least 16 KB.
- Production release **Clawket 3.1.0 (30101)** includes 19 localized release notes. Play validation had no blocking errors, no reduction in supported devices and one missing-deobfuscation-file warning; native debug symbols are attached. Existing all-target-country / 100% target rollout and managed publishing were preserved.
- Finalized the previously saved 19-language store image drafts: phone, 7-inch tablet, 10-inch tablet and feature graphic, **76 image changes**. Submitted these with the production release, **77 changes total**. Console moved all changes into **正在审核中的更改**. Automated quick checks were still running at confirmation; successful checks forward the submission to review. This does not mean Google approval or public availability.

Evidence and AAB: local-only `evidence/google-play-2026-09-28/`, including `artifact.json`, `submission.json`, CI results, source hashes, build/validation logs, manifest, ELF checks, localized release notes, submitted-page snapshot and screenshot. The directory is locally excluded from Git to keep binaries and operational evidence out of source history.

Console: Google Play Console → Clawket → Publishing overview.

App Store review and the pending iPad withdrawal decision were not changed by this Google Play authorization.
