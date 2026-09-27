# Bridge 3.1.1 release · 2026-09-27

Owner authorized this Bridge-only npm publication after implementation and verification. Source commit: `22ebe85` on `main`. App distribution and Worker deployment were not part of this release.

`clawket pair choose` is the new interactive, read-only discovery entry until a backend is selected. It lists OpenClaw, Hermes, Codex, Claude Code and Pi with local configuration status. The bare `clawket pair` retains its old OpenClaw/Hermes automatic pairing results for installed App versions that still ask an Agent to run that command. New App onboarding prompts explicitly select their backend. OpenClaw `pair` and `refresh-code` print the code and QR without opening the browser; `--open` opts in. The bundle also includes the verified Claude Code native-history timestamp correction present in the source baseline.

Verification before publish: CLI chooser 3 tests, CLI integration 29, Mobile onboarding model 11 and screen 24, Claude Code history 5; CLI and Mobile TypeScript checks, documentation check, v1 compatibility replay 5 files / 39 cases, package verifier (3 files, 4 runtime boundaries, 69 runtime modules, 109 provenance inputs). The compiled CLI was run on the owner computer to inspect its five-backend list and exit with `q`; this made no pairing or node changes. The actual npm publish repeated the v1 gate and package verification successfully.

Public npm reports `@p697/clawket@3.1.1` and `latest=3.1.1`. The public tarball has SHA-256 `1dda1fdf6c871512baf1be3701168e9e4f7d0d02d4f0090fd905bb4c07cd67bc`; its computed SHA-512 equals npm's integrity metadata. Publishing npm does not auto-upgrade a globally installed Bridge or deliver the new App prompt to installed clients.
