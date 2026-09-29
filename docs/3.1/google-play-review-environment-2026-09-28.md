# Google Play 3.1 review environment

Owner authorized an isolated review machine, real dedicated DeepSeek key, configuration and expiry/reconnect testing; then explicitly selected the existing idle Alibaba ECS. No new VM was purchased. The owner subsequently authorized physical-phone testing, saving review-access details and re-submitting the existing 3.1.0/30101 release. The App and shared Relay/Registry code/configuration remain unchanged. Review was re-submitted; managed publishing remains enabled and no public release was made.

## Deployed environment

- Existing Alibaba ECS (instance ID omitted from this public record), Beijing zone C, 2 vCPU / 2 GiB / 40 GiB / 3 Mbps, Alibaba Cloud Linux 3. Existing purchase expires September 19, 2027; renewal is manual. Added 2 GiB swap. Existing nginx and system agents preserved.
- Pinned Node 22.23.1, OpenClaw 2026.9.1, published `@p697/clawket` 3.1.2 under `/opt/clawket-review`. Node archive matches the official SHA-256; the two top-level npm package integrities match official npm metadata. A registry mirror was used after slow upstream downloads; this is not an independent audit of every transitive package.
- Unprivileged `clawketreview` owns the synthetic workspace `/var/lib/clawket-review/workspace`, native Gateway configuration and dedicated Bridge registration. Gateway listens on loopback 18789. Bridge connects outward through the existing official OpenClaw Relay; no new public Gateway port or shared cloud configuration change.
- Separate `clawketmodel` owns a loopback-only proxy on 18880. A dedicated provider key (name omitted from this public record) is stored root-owned, group-readable only by the proxy user. The agent receives a separate proxy token, not the real DeepSeek key. Real model: `deepseek-flash`.
- Proxy bounds: 2 concurrent requests, 20/minute, 200/day, 512 KiB request body, 4,096 output tokens and 1,000,000 daily reserved input-byte/output-token units. Counters persist; this conservative admission budget is not an exact provider monetary cap. Saturation can temporarily reject review requests and needs operator attention.
- systemd units: `clawket-review-model`, `clawket-review-gateway`, `clawket-review-bridge`, `clawket-review-firewall`, `clawket-review-renew.timer`. Services restart automatically and are enabled at boot. Units use separate users, restricted write paths, empty capabilities, no-new-privileges and memory limits.
- UID-scoped iptables/ip6tables chain `CLAWKET_REVIEW` rejects private/link-local networks and Alibaba metadata `100.100.100.200` for both service users. Actual socket probes verified the restriction. systemd 239's IPAddressDeny alone did **not** stop a metadata probe; it was not counted as protection. The persistent firewall service is required before the review runtimes start.
- A dedicated static Worker (name and deployed version omitted from this public record) serves English instructions and the QR behind a random secret URL path. No routes, DNS, shared bindings, third-party page resources or observability logs. Responses use no-store, no-referrer and noindex. Anyone holding the URL/QR can access the shared synthetic review environment: treat both as credentials.

## Reusable access mechanism

The review QR contains an already-issued dedicated room client credential plus native Gateway token, using the App's existing generic Relay QR format. It omits the single-use access code. Normal temporary six-digit / invitation pairing remains unchanged for users. No hardcoded review backdoor or permanent invitation was added.

The claimed Registry record has a 365-day lifetime. A weekly timer refreshes the dedicated owner's access code to renew that record while preserving issued client credentials. The QR is therefore reusable while the services, account and renewal job remain healthy; it is not an unconditional forever guarantee. Manual refresh succeeded on September 28 at 01:48 UTC, and the unchanged QR worked afterward. Cloud VM renewal, model balance, provider availability and promo-code availability remain operational dependencies.

Pro is separate from connection authentication. QR pairing does not confer a RevenueCat entitlement. A dedicated Google Play lifetime campaign `Clawket Google Play Review 2026-09` (campaign ID omitted from this public record) created 10 single-use codes; 3 unused codes are assigned to the private page, 6 remain in reserve, and the final code was redeemed for physical-phone QA at zero charge. Product `com.p697.clawket.pro.lifetime`, option `lifetime`. Redemption window September 28, 2026 02:10 UTC through December 26, 2026 00:00 UTC. No subscription or product-price change. Existing gift campaign remains untouched.

**Paid access verified on September 28:** The phone's existing Google Play account redeemed the final dedicated code through Google's redemption page. Google showed “Successfully Redeemed / Item added”; the native payment sheet independently confirmed the lifetime item was already owned. Initial purchase-history queries returned a Google Billing ERROR and the App still showed Free. After Play synchronized, Clawket showed Pro enabled and Lifetime as the current plan; Restore purchases returned “You are Pro.” RevenueCat diagnostics independently reported an active entitlement. The paid OpenClaw logs page opened after force-stopping/restarting the App. After clearing only the newly installed production app's QA data, Pro was recovered again without another code. The pre-existing QA package was not cleared or uninstalled.

The review page now explicitly instructs reviewers to use the same Google Play account in the redemption page and device Play Store, and to reopen/restore after a short synchronization delay if needed. No app-specific account, model key or developer computer is required. Codes are still single-use and require a Google Play account; the repeatable credential is the QR. Successful redemption does not guarantee Google's acceptance of this review-access method.

## Re-submission and test installation

Saved the English login-details entry “Clawket review server - reusable QR” with the private QR/promo-code URL and Redeem / Restore instructions (491/500 characters), then checked the full-content access declaration after actual entitlement and paid-feature verification. Re-submitted the existing 77 changes: production 3.1.0/30101 and the previously authorized localized store assets. The access update appears alongside them under changes considered during review. Console readback shows **正在审核中的更改**. The initial quick-check stage completed before final handoff. Final console readback states “您的更改目前正在接受审核”; this is not review approval. Managed publishing remains enabled, with the last public release still September 24.

Physical-phone evidence is from Samsung SM-A566B, **official Google Play 3.0.0/30001**, not a native run of candidate 30101. The five core billing/entitlement files are byte-identical between public 3.0 source `4d84c00a` and submitted 3.1 source `1c09aef1`. Submitted-source networking was separately exercised through the live protocol harness. Downloaded and verified the Play-signed 30101 universal APK, but its sideload launch was blocked by Google's installer check. No integrity protection was disabled or installer identity forged; no new App build or upload was performed.

Attempted official internal sharing of the existing artifact. Accepted internal sharing terms, enabled its separate Google-managed test certificate, and created the one-account downloader list `Clawket Review QA 2026-09-28`; access is restricted to email-list testers. Existing tester/uploader lists were preserved. This did not deliver 30101 to the phone. Restored the phone's Internal app sharing toggle to off after testing; the Play developer-options menu remains available. Production signing certificate `F4:F8:8D:52:39:C3:1B:20:6F:CD:01:F6:21:22:B5:88:F3:0D:D5:3A:C6:4D:F3:6B:35:1E:33:34:7A:AA:0B:24` was unchanged.

The new internal-sharing certificate `A4:CE:DF:F4:8C:BF:53:CD:D0:FE:9A:E0:D7:C6:04:19:88:35:5F:34:45:AA:D6:A5:CE:B0:EC:06:5A:31:6C:72` initially triggered an unregistered-key submission blocker. Added this public fingerprint to the existing package's Android developer verification record. Final refreshed readback shows **已验证** for both this internal test certificate and the unchanged production certificate. The blocker cleared and Google accepted the review submission. This certificate verification is separate from the app review.

## Verification and limits

Evidence is private under `~/.clawket/testing/google-play-review/` (0700), not in Git. Credentials/configurations/QR/URL/CSV are 0600. The source harness bundles the actual mobile parser, protocol and native handshake used by submitted Android commit `1c09aef1658238307afcf644a5c41fb7482607c0` (3.1.0 / 30101); all 26 bundled source dependencies match that commit byte-for-byte. Native platform/storage adapters are stubbed, networking is live.

Passed:

1. Production dedicated ECS: new device handshake without manual approval, agent/session/health queries, real DeepSeek reply, abrupt socket drop and recovery.
2. Entire ECS reboot, all five units returned active. Previously paired device resumed and completed real inference.
3. After the original 600-second temporary code had expired, a fresh device identity imported the **same QR** and completed native authentication, real inference and reconnection. The Mac's temporary Gateway/Bridge had already been stopped. QR age was 613 seconds for this fresh-device proof; later saved-device tests reached 990 seconds.
4. Actual file tool created an exact expected marker in the cloud workspace; independently read it over SSH and compared. Removed that QA file and reset the dedicated main conversation afterward.
5. TTL-enforcing clock simulation: 20 checks across OpenClaw and Hermes at 2 hours, 1/3/7/30 days, renewal at day 180, validity at day 366 and expiry at day 546 without further renewal. This is source simulation, **not** days of elapsed production observation.
6. Historical v1 compatibility: 39 tests across `fixtures` (8), `legacy-bridge` (9), `historical-client-handler` (7), `historical-image-pipeline` (9), `live-replay` (6), run one file/process at a time, one worker. No full local suite.
7. Published PNG independently decoded with macOS Vision and matched the full expected QR payload. Live page/PNG returned 200, PNG bytes match, wrong path returns 404, no-store present, three assigned promo codes present. Chrome loaded the QR at 1200 × 1200.
8. Proxy rejects unauthenticated inference, agent UID cannot read the real provider key, metadata access fails after reboot, Gateway/proxy ports remain loopback-only. Final observed VM memory: approximately 741 MiB used / 1,129 MiB available; swap unused.

9. Physical-phone review QR imported from Photos, real DeepSeek returned `PHONE_REVIEW_OK`; after clearing this session's production-app QA data, the same unchanged QR paired again and returned `REPAIR_AFTER_RESET_OK`. Restart retained the connection and Pro; the paid logs screen returned live data. The temporary pairing code had long expired. QA conversation was reset after testing, before reviewer access.
10. Focused mobile `pro-redemption.test.ts` (5) and `pro-subscription.test.ts` (42) passed as separate in-band processes. Both test inputs and source match submitted `1c09aef1`. No full local suite. Final live harness reconnect/reset passed at QR age 5,700 seconds.
11. Updated private review page and PNG returned 200 via a normal HTTP client, retained no-store, preserved identical QR bytes and all three unused reviewer codes, and included same-account/synchronization guidance. One urllib request returned 403; the browser-compatible requests client succeeded. No shared edge policy was changed.

Limits: native acceptance above is on public 30001, supplemented by exact submitted-source protocol tests and billing-source equivalence, not a claim that 30101 ran on the phone. Multi-day expiry is simulated; elapsed live QR evidence reached 95 minutes. Google app review approval remains pending; internal certificate verification is complete. No new App build/upload or public release.

## Operator runbook

Private local directory contains `ssh-config`, restricted `ecs-admin-key`, pinned `ecs-known-hosts`, source/config templates, `production-connection.json`, `review-qr.png`, `review-url.txt`, both English instruction files, dedicated promo CSV, probe reports and source proofs. Do not paste these into Git/issues or general logs. Keep an access-controlled backup of this directory.

```sh
ssh -F ~/.clawket/testing/google-play-review/ssh-config review-ecs
systemctl is-active clawket-review-model clawket-review-gateway clawket-review-bridge clawket-review-firewall clawket-review-renew.timer
systemctl list-timers clawket-review-renew.timer --no-pager
cat /var/lib/clawket-review/renewal-status.json
systemctl start clawket-review-renew.service
journalctl -u clawket-review-bridge -n 60 --no-pager
```

Inspect logs locally and redact credentials before sharing. Service definitions are `/etc/systemd/system/clawket-review-*`; operator code is `/opt/clawket-review/{model-proxy.py,review-firewall.sh,renew-pairing.mjs}`. Native/Bridge configs are `/var/lib/clawket-review/openclaw/openclaw.json` and `/var/lib/clawket-review/.clawket/bridge-cli.json`. DeepSeek secret and proxy token are `/etc/clawket-review/{deepseek.key,proxy.token}`. Preserve file ownership on restore.

For another fresh-device test, use a new synthetic profile name:

```sh
REVIEW_ENV=production node ~/.clawket/testing/google-play-review/mobile-probe.cjs review-new-device --inference
```

A new profile creates a new identity; reusing a profile verifies saved-device reconnect. Never reset main during active human review. Timer success is recorded locally; no alert/monitor automation was configured.

To retire access after owner authorization: stop the dedicated runtimes/timer, revoke the dedicated provider key, remove the private review page secrets/Worker and invalidate/retire the dedicated room credentials using the supported owner flow. Pausing a promo campaign only stops future redemption; it does not revoke lifetime purchases already redeemed. Removing the review page alone does not revoke a previously downloaded QR. Leave existing nginx, other host services and shared Relay/Registry resources intact.
