<p align="center">
  <img src="./assets/openhands-logo.png" alt="OpenHands" width="420" />
</p>

# OpenHands Mobile

**L’application mobile pour se connecter à OpenHands Cloud.**

OpenHands Mobile a été créée principalement pour donner accès à **OpenHands Cloud** depuis un téléphone. Elle permet de se connecter à vos agents OpenHands dans le cloud, de suivre les conversations et les réponses en direct, de consulter les appels d’outils et de changer de session.

L’application peut également se connecter à des **agents locaux** et à des backends exécutés sur votre propre ordinateur ou votre réseau. La connexion à OpenHands Cloud est son usage principal ; les connexions locales offrent une solution complémentaire pour les utilisateurs qui souhaitent conserver leurs agents chez eux.

<p align="center">
  <a href="https://github.com/Frankenstein-Labs/clawket/releases"><strong>⬇ Télécharger l’APK de test Android (canal QA)</strong></a>
</p>

- [Télécharger l’APK de test QA](https://github.com/Frankenstein-Labs/clawket/releases) (canal QA, voir ci-dessous)
- [Voir toutes les versions](https://github.com/Frankenstein-Labs/clawket/releases)
- [Consulter le projet OpenHands](https://github.com/OpenHands/OpenHands)

### Quelle version installer ? Deux canaux distincts

Il existe **deux canaux**, et ils ne remplacent jamais l’un l’autre :

| Canal | Identifiant d’application | Signature | Distribution |
| --- | --- | --- | --- |
| **Officiel** | `com.p697.clawket` | clé de signature « upload » officielle | Google Play (profil EAS `production`) |
| **Test (QA / sideload)** | `com.p697.clawket.qa` | clé **debug** Android (jetable) | APK GitHub Releases / Actions |

L’APK de test porte l’identifiant `com.p697.clawket.qa` et est signé avec la clé **debug** Android, qui est publique et jetable. Il **coexiste** avec l’application du Play Store : les deux s’installent côte à côte, comme deux applications différentes. Aucun des deux ne peut écraser ou désinstaller l’autre, et aucune donnée n’est perdue.

> **À ne pas faire :** installer l’APK de test *à la place* de l’application officielle. C’est impossible par conception (identifiant et signature différents) ; Android affichera *« Application non installée »*. Pour passer d’un canal à l’autre, installez l’application de l’autre canal — vous aurez alors les deux.
>
> **Si vous voyez *« Application non installée »* ou `INSTALL_FAILED_UPDATE_INCOMPATIBLE` :** vous essayez probablement d’installer un paquet portant le même identifiant qu’une version déjà installée signée différemment (par exemple un ancien APK signé debug par-dessus la version Play). C’est le conflit de signature attendu. Utilisez l’APK du canal QA (`.qa`), ou désinstallez d’abord l’application du même identifiant.
>
> **Installation Android :** Android peut demander l’autorisation d’installer des applications provenant de cette source ; activez-la dans les réglages de votre appareil si nécessaire.

La version **officielle** est construite et signée par le pipeline EAS (`production`) avec le vrai keystore ; l’APK de test n’est **pas** l’artefact du Play Store. Cette séparation est vérifiée automatiquement par `apps/mobile/scripts/check-android-apk-workflow.test.mjs`.

## À propos d’OpenHands Mobile

L’application est un client mobile : elle se connecte à OpenHands Cloud en priorité, tout en prenant en charge les agents locaux et les backends compatibles configurés par l’utilisateur. Elle ne remplace pas le service cloud ou l’agent local auquel elle se connecte.

## Fonctions de l’application

- **Keep your agents together.** One roster for agents across your connections, with recent activity and quick access to conversations.
- **Follow the work as it happens.** Streaming replies and detailed tool calls live alongside the conversation.
- **Switch sessions with context.** Find and resume sessions, including those created through channels such as Slack and Telegram when supported by your backend.
- **Manage from the Agent console.** See usage and access models, skills, scheduled tasks, and settings. Controls follow each backend's capabilities.
- **Connect your way.** Use Relay for remote access, or connect over LAN, Tailscale, or your own endpoint. Self-host the infrastructure if you prefer.
- **Use your language.** The app supports 19 interface languages, light and dark themes, and voice input with an optional transcription service.

OpenHands Mobile se connecte en priorité à OpenHands Cloud, et peut aussi utiliser les agents locaux que vous exécutez. Les fonctions disponibles dépendent du backend connecté.

## Get connected

Install OpenHands Mobile from Google Play for the official app, or use the sideload QA APK link above to test a local build beside it. On the computer running your agent, install the Bridge CLI (Node.js 20.3+):

```bash
npm install -g @p697/clawket
clawket pair
```

Scan the generated QR code in OpenHands Mobile. The default command detects installed OpenClaw and Hermes backends and produces a labeled pairing result for each. Relay is the default; Hermes pairing also attempts to start its Clawket-managed bridge and Relay runtime.

To detect installed platforms and choose one interactively (including Codex, Claude Code, and Pi), run this in your computer's terminal:

```bash
npx @p697/clawket@latest pair choose
```

The pairing home shows this command and its Copy action directly below the platform list, under **Or detect automatically**. Scan and expandable code entry are available on the same page, and the scanner can also read a QR code from your photos; manual codes require selecting their platform first. Platform-specific onboarding defaults to terminal scanning for Codex, Claude Code, and Pi; OpenClaw and Hermes default to an agent message. You can switch methods and enter a pairing code instead of scanning. `pair choose` is interactive, accepts no flags, and is not a Preview command.

For direct pairing on your local network:

```bash
clawket pair local
```

To select a backend explicitly, use `--backend` with `openclaw`, `hermes`, `codex`, `claude-code`, or `pi`. Use `clawket status`, `clawket doctor`, and `clawket logs` to inspect your connection.

`status` summarizes all saved Agent connections; add `--verbose` for paths and capabilities. Use `clawket logs --backend codex --last 10m --follow` (or another backend) for live troubleshooting. Default lifecycle/reset commands retain the OpenClaw/Hermes service scope; use `clawket codex reset`, `clawket claude-code reset`, or `clawket pi reset` with the original pairing options for those Agents. Reset retains session history.

## Build from source

Use **Node.js 22.x** and npm for this checkout. iOS development requires macOS and Xcode; Android development requires Android Studio and its SDK.

```bash
npm ci
# Generate only the platform you are developing (Android also works without Xcode):
npm exec --workspace apps/mobile -- expo prebuild --platform ios
npm run mobile:dev:ios
# Or, generate Android and run it:
npm exec --workspace apps/mobile -- expo prebuild --platform android
npm run mobile:dev:android
```

Optional public configuration is documented in [`apps/mobile/.env.example`](./apps/mobile/.env.example). Copy it to `apps/mobile/.env.local` to configure your build. Provider secrets belong on the server, never in `EXPO_PUBLIC_*` values.

Community Debug and Release builds work without analytics, billing or speech configuration. Leave `CLAWKET_OFFICIAL_BUILD` unset; the `production`/`testflight` EAS profiles are for official Clawket distribution. Use your own Apple signing team for a physical device and your own EAS project for cloud builds; see [self-hosting](./docs/self-hosting.md). iOS also requires CocoaPods, and Android requires JDK 17 with `ANDROID_HOME` set.

```bash
npm run mobile:config:show
npm run mobile:config:check
```


## Connections and self-hosting

In **Relay mode**, the Registry handles pairing and the Relay forwards live WebSocket traffic between the app and your Bridge. Your agent continues to run on your own machine. In **direct mode**, the app reaches your backend endpoint over LAN, Tailscale, or a custom URL without Relay infrastructure.

You can build the mobile app and operate your own services. OpenClaw and Hermes share the Relay implementation but use separate services, storage, and pairing credentials.

- [Self-hosting guide](./docs/self-hosting.md)
- [Relay configuration](./docs/relay/CONFIGURATION.md)
- [Local Relay development](./docs/relay/LOCAL-DEVELOPMENT.md)
- [Relay architecture](./docs/relay/ARCHITECTURE.md)

## Privacy and optional integrations

Relay forwards traffic without persisting message content. The app keeps a local message cache; deleting a connection clears its cache. Your agent backend and model provider retain their own data-handling policies.

Source builds can leave these integrations unconfigured or configure their own services:

| Component | Purpose |
| --- | --- |
| PostHog | Basic usage and diagnostics; analytics events exclude conversation text and prompts. Leave analytics configuration empty to disable it. |
| RevenueCat | Store subscription management. Unconfigured source builds skip billing and unlock Pro features. |
| Alibaba Cloud speech service | Transcribes audio when you use cloud voice input. Configure the independent speech endpoint to enable it; provider keys stay on the server. |

These components are separate from Agent connectivity. See the [configuration example](./apps/mobile/.env.example) and [speech service guide](./docs/3.0/22-voice-input.md) for details. Store builds use their configured integrations; see the [Privacy Policy](https://clawket.ai/privacy).

## Repository

| Path | Purpose |
| --- | --- |
| `apps/mobile` | Expo / React Native app |
| `apps/bridge-cli` | Published `@p697/clawket` CLI |
| `apps/relay-registry` | Pairing Registry Worker |
| `apps/relay-worker` | WebSocket Relay Worker |
| `apps/speech-worker` | Independent cloud transcription service |
| `packages/agent-protocol` | Shared backend contracts and capabilities |
| `packages/bridge-core` | Pairing, configuration, and service helpers |
| `packages/bridge-runtime` | Bridge runtimes |
| `packages/relay-shared` | Shared Relay protocol and types |

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md). Run the repository's required checks before proposing code changes:

```bash
npm run check:required
```

Live-service and release integration checks have separate prerequisites; see the contributor and workspace documentation. Report security issues as described in [SECURITY.md](./SECURITY.md).

## License

Unless a subdirectory states otherwise, this repository is licensed under [AGPL-3.0-only](./LICENSE).

Bridge upgrades preserve existing pairing. See [Bridge updates](docs/bridge-updates.md) for unified update support, runtime verification and manual deployment exceptions.
