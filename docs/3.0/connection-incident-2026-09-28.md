# 2026-09-28 连接问题排查

负责人报告 TestFlight 上 OpenClaw 首次扫码“不支持”、再次连接很慢，Profile/模型加载失败，Codex 与 Claude Code 扫码“网络不可用”，终端 Codex 配对超时。报告时间修正为今天约 09 点和 13 点；确切 App build、时区和设备埋点身份未核实，不能把时间相近的事件直接认作负责人的设备。

## 已确认的影响范围

PostHog 项目 337268，只读 SQL。窗口明确使用 UTC **2026-09-26 16:00 至 2026-09-28 06:00**，即北京时间 9 月 27 日零点至 28 日 14 点。以下为 `connect_failed` 事件数及 `distinct_id` 去重数；设备标识不是人数，跨后端不可相加，3.1.0 包含内部测试的可能性尚未排除。没有上报、扫码 claim 前失败和未接入埋点的旧客户端不在分母中，不能据此计算全量成功率。

| App 版本 | 后端 | 失败事件 | 失败设备标识 |
|---|---|---:|---:|
| 3.0.0 | OpenClaw | 7 | 5 |
| 3.0.0 | Hermes | 55 | 8 |
| 3.1.0 | Claude Code | 6 | 2 |
| 3.1.0 | Codex | 3 | 1 |
| 3.1.0 | Hermes | 6 | 2 |
| 3.1.0 | Pi | 2 | 2 |

3.0.0 OpenClaw 的 7 次失败中，5 次为 `bridge_offline`，2 次为 `network`。Hermes 为 `network/ready` 35 次、`gateway_offline/socket` 14 次、`timeout/socket` 3 次、`network/socket` 3 次。说明存在多设备问题，不能一概归因于负责人的 VPN；这些错误标签本身也不证明同一个根因。

今天 00:00–06:00 UTC：3.1.0 iOS Codex 在 02:20:48 记录 `bridge_offline/socket`、02:21:42 记录 `timeout/ready`；OpenClaw 有 5 条 ready 记录，最后一条为 05:28:09。没有对应设备身份时，不能据此宣称负责人的上午/下午测试已恢复。

可复核查询（不要用未指定时区的日期字面量；早期临时查询受默认时区影响，已由下列口径替代）：

```sql
select properties.$app_version as version, properties.backend as backend,
       count() as failures, count(distinct distinct_id) as devices
from events
where timestamp >= toDateTime('2026-09-26 16:00:00', 'UTC')
  and timestamp < toDateTime('2026-09-28 06:00:00', 'UTC')
  and event = 'connect_failed'
group by version, backend
order by version, backend
```

去重查询 ID `dfe29032-62ff-4e77-a695-673e2fd53f30`；窗口结束后复核 `dea1e86a-e510-47fe-88aa-af65e0186c4d`，数量一致；错误分组查询 ID `0bccebd5-5cf4-4f75-9c05-5bdc98d86a88`。时间复核使用 `formatDateTime(timestamp, '%Y-%m-%d %H:%i:%S', 'UTC')` 输出字符串，避免浏览器再次转换。

## 云端与本地证据

Cloudflare Workers 历史聚合（Production 与 Preview 分开，未启用新的日志/Trace 配置）：

- 同一开始时间至 9 月 28 日 05:40 UTC，Production OpenClaw owner `1006` 断开 2,498 次，涉及 190 个 room；Hermes 2,968 次、53 个 room。断开可能包含休眠和正常网络切换，room 不是用户，不能等同于 App 失败次数。
- Hermes owner `4001` 替换 61,338 次，集中于 6 个 room；这证明连接反复被替换，需继续核对同一配对的重复运行实例/监督进程。当前源码已在 `replaced_by_new_bridge` 时停止让位，不能据此断言云端所有运行实例都包含该逻辑，也不能直接用房间数匹配埋点设备数。
- 38 小时 Registry claim 窗口中，OpenClaw Production 17 次 HTTP 200、2 次 400；Codex 3 次 200、Claude Code 2 次 200；Hermes QR 10 次 200、1 次 409，短码 4 次 200、1 次 404。成功请求的最大服务端耗时约 1.4–2.3 秒，未观察到几十秒的服务端 claim 执行。
- 今天 00:00–05:35 UTC，Codex/Claude Registry 各有一次 access-code 和 session 请求，但没有 claim 记录。这不能证明手机没有发起请求；DNS/TLS、边缘拦截、App 本地拒绝都可能发生在 Worker 应用日志之前。
- 本机 OpenClaw Bridge 今天 00:00–06:00 UTC 有 24 条心跳超时、39 条 Relay 断开、20 条 Gateway 认证成功；本地认证约 18–30 ms。多次 Relay 心跳缺失约 40 秒且调度延迟很低，部分呈半小时重复。证据支持链路活性问题，尚不足以定位为某个代理节点或云路由。
- 本机代理在约 05:14–05:19 UTC 重启过，能解释附近部分 `ECONNREFUSED`/DNS 失败，不能解释全天问题。未修改代理、VPN、DNS 或生产服务配置。

## Codex 可复现故障与修复

本机原 Clawket Codex Bridge 仍监听端口并连着 Relay，但自有 App Server 子进程已退出；认证后的健康请求返回 `Codex process is unavailable. Restart the Bridge.`。这是真实本地故障，不是仅凭日志猜测。

独立、只读 App Server 复现：模型/账号/原生 thread 列表正常；读取最近会话的完整 turns 时，前两次回复约 1.73 MB、1.02 MB，后一次使有界 RPC 关闭。原 roster 预览请求 `itemsView: full`，会无意加载大量工具输出。改成原生协议支持的 `summary` 后，12 条预览均成功，单条约 0.9–5.2 KB，随后模型请求仍正常。未持久化/输出会话内容，未发消息、续写或接管 Desktop 会话。

修改后对真实 `CodexService` 做只读验证：首次 health 2,864 ms；964 条会话列表 334 ms；重复列表 182 ms；末次 health 2 ms，原生进程持续可用。显式 history 保留完整 items，不以删减历史解决预览问题。

随后仅构建本地 CLI，通过其 `codex restart --config` 恢复本机已经失效的自有 Bridge，旧协议恢复路径实际通过；未刷新/撤销配对，配置文件修改时间仍为原来的 05:24:29 UTC。经真实 loopback WebSocket 重新认证：health 7 ms、964 条会话 330 ms、5 个模型 6 ms、后续 health 3 ms。此结果证明本机 Bridge 恢复，不替代手机到云端链路验证。

停止/重启另有恢复缺口：旧 CLI 要健康握手成功才发送 stop，原生子进程失效后无法清理自有 Bridge。新增认证后的 `controlOnly` 握手；旧 Bridge 健康报错后，通过仍受 token 保护的 `agents.list` 确认 Codex 身份，再停止。错误 token、其他后端身份、未知超时均不能授权替换，不按端口/PID强杀，不重放未知写入。

## Mobile 修改

- OpenClaw 系列（含 Codex/Claude Code/Pi QR）和 Hermes 的 Registry claim 增加 15 秒总期限，覆盖 fetch 与响应体读取。超时 abort 并返回 timeout，不自动重试单次领取凭据；这提供有界失败反馈，不等于已修复网络可达性。
- Onboarding 连接等待复用现有五种按权重随机的小猫场景及成功退出，成功后不额外延迟导航；OpenClaw/Hermes/Pi/Codex/Claude Code 共用入口。
- “首次不支持”、OpenClaw Profile/模型请求停滞、Claude Code 在手机网络上的 QR 失败，尚未逐项端到端复现，不能标记全部解决。

## 验证与交付边界

按资源规则逐文件串行执行：Runtime `codex/service.test.ts` 51、`codex/server.test.ts` 5；CLI `codex.test.ts` 11、`codex-lifecycle.test.ts` 5；Mobile `OnboardingScreen.test.tsx` 24、`pairing-request.test.ts` 3、`relay-pairing.test.ts` 4、`hermes-relay-pairing.test.ts` 3、`gateway-scan-flow.test.ts` 6，合计 112 项通过。Mobile/Runtime/CLI 类型检查、Mobile design-system 检查、`check:docs`（7 对 AGENTS/CLAUDE 与 5 项自测）通过。未运行全仓测试或发布兼容矩阵，也未把局部验证称为发布门禁通过。

已识别插线 Android 正式版 3.0.0/30001 和 QA 3.1.0/30100；iOS 测试模拟器已有 3.1.0 开发 App。投屏/模拟器的 UI 自动化窗口不可用，未完成交互验收；测试投屏已停止、启动的模拟器已关闭。Android DNS ping 落到代理地址，不是到真实 Registry 的 HTTPS 成功证据。

代码修改不会自动进入已安装的 TestFlight。未执行分发打包、上传、OTA、npm 发布、Worker 部署或生产配置更改。手机修复需后续授权的 App 更新；Bridge 修复需加载新的 CLI 并重启其自有进程。真实 iPhone 的扫码、Profile、模型、前后台和小猫视觉验收仍待完成。


## 后续归因与隐私修正（本地代码，尚未上线）

负责人随后反馈 OpenClaw 随网络恢复可以连接。这支持“当时网络路径可能异常”，但不能倒推出上午/下午每一次失败的根因。复查发现 Mobile 曾把一般握手超时记为 `bridge_offline`、无错误码异常记为 `network`；上表保留历史原始分类，不能将这些标签当作已证实的 Bridge/网络故障。新代码改为 `timeout` / `unknown` 并保留实际到达的阶段。

新增诊断只收集连接阶段、耗时、固定错误分类、HTTP 状态及失败时的 OS 网络类别；Relay/Registry 日志收紧为白名单与固定路径/原因，Codex 原生日志仅记录固定原因和数量。禁止聊天、请求/响应正文、二维码、凭据、原生 stderr/异常原文及个人路径进入这些新增诊断。证据判断表、未覆盖范围和验证见 [连接诊断规程](20-connection-diagnostics.md#september-28-privacy-preserving-failure-attribution)。未增加稳定跟踪身份、自动上传本地日志或外部网络探测；未发布/部署这批改动。
