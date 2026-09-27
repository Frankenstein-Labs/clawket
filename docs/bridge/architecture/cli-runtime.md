# CLI Runtime Architecture

The maintained architecture is intentionally small:

- `apps/bridge-cli` owns user command parsing and output formatting.
- `packages/bridge-core` owns pairing, config discovery, QR generation helpers, and service install/status primitives.
- `packages/bridge-runtime` owns the long-running relay/gateway runtime.

## Dependency Direction

```text
apps/bridge-cli   -> packages/bridge-core
apps/bridge-cli   -> packages/bridge-runtime
packages/runtime  -> packages/bridge-core
```

Rules:

1. Keep reusable transport logic in `packages/`.
2. Keep command parsing and terminal output in `apps/`.
3. Do not create package dependencies that point from `packages/` back into `apps/`.
4. Do not add desktop-only compatibility layers. The repository is CLI-only.

## Pairing entry points

`clawket pair` keeps the legacy automatic OpenClaw/Hermes pairing output for older App versions and agent prompts. `clawket pair choose` inventories locally available OpenClaw, Hermes, Codex, Claude Code and Pi installations, marks existing local Bridge configuration, then pairs only the backend selected in an interactive terminal. It never treats local configuration as proof that a particular phone is paired. New App prompts select the backend explicitly with `clawket pair --backend <name>`; automation should do the same. Pi also asks for a project folder.

Pairing codes and QR images remain in terminal output. OpenClaw pairing invitations no longer open a browser automatically; `clawket pair --open` and `clawket refresh-code --open` opt in to opening the page.
