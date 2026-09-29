# Codex 体验与五后端连接恢复调研 · 2026-09-28

状态：研究阶段记录。负责人随后已授权完整实现与安卓真机验收，当前执行状态见 [实现与验收记录](connection-upgrade-acceptance-2026-09-28.md)。下文的未实施/未验收描述保留研究结束时的证据边界，不代表后续实施结果，也不构成发布授权。

## 结论

需要同时推进 Codex 原生互操作修复、五后端统一恢复机制与精简运行设置。现有问题不能统一归因于网络。先修已知状态/调度缺陷，再通过能力协商补充恢复协议；目前没有证据要求先替换 Cloudflare/WebSocket 或强制旧用户迁移。

“接近官方体验”的边界是：选择电脑与项目、继续原会话、设置实际生效、审批/提问可处理、断线可恢复、发送不丢不重。Git 管理、PR、分支/worktree 管理、完整文件浏览不在本建议范围。

## 样本和版本

- 发布版基线：Bridge 3.1.3，来源提交 `4d483b913ab9afafcf6f25c28f85a544644095f4`。
- 当前 main 有其他会话未提交的诊断、命名、移动端与 Codex speed 改动；不能把这些视为已发布功能。本报告未改动这些文件。
- 本机独立 Codex CLI `0.153.3`；其 `app-server generate-ts --experimental` 已确认模型 speed tiers、线程运行设置、权限字段。生成类型只证明协议表面，不能替代端到端行为验证。
- Remodex 本地参考仓库 `/Users/lucy/Desktop/me/references/remodex`：checkout 保持 `e0e342d`；仅 fetch 后只读研究 `origin/main` 的 `00b29057c35794d7802b3fbc7d9a4d102d34517f`（2026-09-26）。
- 按负责人建议克隆官方 [openai/codex](https://github.com/openai/codex) 至 `/Users/lucy/Desktop/me/references/codex`；最新 main 固定为 `44fe510ce3ee61c8ef623adcbf89b901c73ddd61`（2026-09-28）。源码仅作阅读参考，不编译或替换本机 Codex。
- 同时 fetch `rust-v0.153.3`（commit `b1a547b1f73ce86205d9222ac19cff334b3b7a2e`）和 `rust-v0.158.0-alpha.2.1`（`0d9c7cbfa6cf1489f55a8a9542b75ddd2c061807`），对照本机两个实际版本；保持参考 checkout 为 main。以下设置 ACK 语义在两个安装版本对应源码中均得到确认。
- 用户前四张图片视觉内容相同，均为官方 Composer；未从图片观察到展开的高级设置菜单。菜单设计建议来自描述、官方资料和参考源码。

## 已定位的 Codex 桌面恢复缺陷

用户第五张图的 `Cannot read properties of null (reading 'settings')` 与两个 Bridge-owned 会话匹配；它们于 2026-09-28 06:56:37Z、07:01:05Z 创建，均已有一次接受的输入。使用时间统一为 UTC，避免本机/用户时区混用；不记录原生会话 ID 或聊天正文。

10:29:15Z–10:30:20Z 的桌面日志有 49 次该错误，48 次对应这两个会话。同组日志中 `thread/read` 已在 1–2 ms 成功，随后状态装载约 13–19 ms 失败。原生元数据存在、未归档，模型/推理信息有效。

发布版 [`desktop-state.ts`](https://github.com/p697/clawket/blob/4d483b913ab9afafcf6f25c28f85a544644095f4/packages/bridge-runtime/src/codex/desktop-state.ts#L16) 构造 Desktop follower snapshot 时，把 `latestCollaborationMode` 和 turn params 中的 `collaborationMode` 设为 null。本机桌面消费者多处直接读取 `latestCollaborationMode.settings`；自身初始化状态则是含 `mode` 和 `settings` 的对象。

本机 Desktop 为 `26.924.22138` build `11645`，内置 App Server `0.158.0-alpha.2.1`，受影响记录来源为 CLI `0.153.3`。公开 App Server 类型与桌面私有 IPC 状态不是同一份契约；新旧版本组合需要独立验证，不能仅凭 CLI 版本可解析就声明兼容。

这是确定存在的契约缺陷，与本次报错高度吻合；错误包装没有完整调用栈，仍需修复后在真实 Desktop UI 完成复现/恢复闭环。当前证据支持“兼容层状态装载失败”，不支持“会话文件损坏”或“隧道超时导致此错误”。

修复范围不能只补一个非空占位：应从原生有效设置生成完整状态，保留模型、推理、权限、速度、协作模式；对实际支持的 Desktop IPC 版本校验状态，并做双方创建、双方打开和续聊验收。未知版本应明确降级，不能输出猜测的成功状态。

恢复既有会话应保留原生 ID、历史和项目；在确认任务空闲后更新/重启 Clawket 自己的 Bridge、重新加载 Desktop 页面，使旧内存快照被替换。不应改 SQLite、删会话、杀掉其他客户端或重发原提示词。

另有负载风险：[`service.ts`](https://github.com/p697/clawket/blob/4d483b913ab9afafcf6f25c28f85a544644095f4/packages/bridge-runtime/src/codex/service.ts#L145) 在 Desktop 关注会话时以 150 ms 合并窗口响应更新，读取 `thread/read(includeTurns:true)` 并发布含两份历史结构的全量快照。显式手机历史还会先取 10 个 full turns，再限制输出大小。3.1.3 的摘要预览修复没有覆盖这两条路径；需分页、单项限界与增量更新，不能让超大工具输出拖垮原生进程或健康检查。这是源码风险，尚未证明导致用户本次前台重连问题。

还需覆盖“Bridge 重启期间 Desktop 接管”的写入所有权边界：目前 native 导入记录与 Bridge 自建记录走不同 owner 路由。后者恢复已有原生 ID 时同样应重新发现 owner，不能因来源是 Bridge 自建就推断仍拥有写入权。尚未发现这两个故障会话实际发生双写的证据。

## 五种 Agent 共用什么

| 层 | 当前状态 | 升级边界 |
| --- | --- | --- |
| 手机 WebSocket | 五后端共用 BaseWebSocketTransport / RelayWsTransport | 可以统一连接生命周期、替换通知和前台恢复 |
| 手机协议适配 | OpenClaw/Hermes 走 GatewayProtocolClient；Codex/Claude/Pi 各自直接使用 transport | probe、取消、恢复语义需统一，保留原生差异 |
| 云端 Relay | 共享实现，backend policy、部署资源、握手和路由隔离 | 新能力协商；保留旧路由和身份边界 |
| 电脑 Bridge | 共用部分连接辅助逻辑，五后端有不同原生进程与会话管理 | 不将某一个后端修复当成其他后端已通过 |
| 原生 Agent | 协议、写入所有者、审批、历史和恢复能力不同 | 共用产品契约，由适配器明确声明可实现能力 |

## 前台恢复慢：具体机制

以下机制已在发布版基线中存在；是否解释用户某次断线，仍需同时间轴的设备测试。

1. **健康检查排在会话列表后。** `ConnectionCoordinator` 的 `refreshActiveRoster` 与 `probeEntry` 共用 `maintenanceTail`（基线 `index.ts:945,1127`）。旧列表请求可等到 20 秒 RPC 超时，健康 probe 才获得执行机会；其后还可能经过探测和连接期限。强杀重开清空了这些旧状态，因此更快是合理的机制解释，但尚不是个案复现证据。
2. **Android 前台策略有缺口。** App 层 ready 且后台不足 60 秒时可能不探测；Thread 层 8 秒以上会探测，但 false 结果没有触发恢复。Codex/Claude/Pi 的 probe 只返回布尔值，于是失效但看似 ready 的 socket 可能等后续 watchdog。
3. **不同后端的 probe 含义不同。** Gateway probe 内部会重连和等待，其他三个只检查；上层另有重连。App、Thread、Coordinator、Adapter 和 transport 多层发起，存在等待叠加与竞争。
4. **换 socket 未统一取消旧 RPC。** transport 主动 reconnect 时 detach/close，但不一定通知 adapter 的 onClose；旧 pending 请求可能保留至自身 deadline。需要显式 incarnation 替换事件并拒绝旧回包。
5. **原生进程失效和隧道在线混在一起。** Codex owned App Server 退出后 service 进入永久 disconnected 状态，单纯手机重连无效；应在确认没有不明写入后安全重建自身进程，并恢复权威会话状态。health 也不宜依赖每次刷新整个模型目录。

主要代码：`apps/mobile/src/connection/index.ts`、`services/foregroundReconnectPolicy.ts`、`chat/useChatController.ts`、`connection/protocol/gateway-client.ts`、`connection/transports/ws-base.ts`、`connection/adapters/codex.ts`、`packages/bridge-runtime/src/codex/{service,rpc,relay}.ts`。现有跨设备故障及 owner replacement 证据见 [连接事件记录](../3.0/connection-incident-2026-09-28.md)；新诊断仍在未发布工作树，不应拿来声称已有线上归因。

## 运行设置与基础功能

建议 Composer 保留加号、一个紧凑权限入口、一个模型入口、语音/发送。模型面板统一呈现模型、思考强度、标准/快速；只有用户开启 Fast 时显示小型状态标识。项目继续放顶部副标题，不增加输入框上方常驻行。会话顶部菜单提供复制原生 ID、重命名、归档。

| 能力 | 发布版缺口 | 建议 |
| --- | --- | --- |
| Speed | 未提供用户选择；工作树有开发中代码 | 使用 native 模型能力和 service tier，明确标准/快速；不把降低 thinking 当 Fast |
| 权限 | `on-request/user/workspace-write` 写死 | 既有会话继承真实设置；新会话默认项目权限，允许显式完整访问并记住选择；显示主机管理限制 |
| 设置一致性 | snapshot 有硬编码权限/空模式 | 读取与订阅 native 有效值；设置串行确认后发送，晚回包不能覆盖新选择 |
| 复制 ID | descriptor 已有原生 sessionId，未找到对应 UI 动作 | 复制原生 ID，不复制 Clawket 内部路由 key |
| 重命名 | Bridge-owned 已实现，native 禁用 | 按支持版本/owner 路由开放原生改名；确认远端成功，错误可见 |
| 归档 | owned delete 实际调用 native archive 后删除本地记录 | 统一“归档”的可逆语义，提供找回入口；不要称为删除或静默隐藏 |
| 审批/提问 | 已有，但断线与状态恢复仍需验收 | 后台后仍能回答同一个请求；拒绝/取消结果可见，结果未知不冒充成功 |

不推荐用默认 Full Access 掩盖审批丢失。推荐记住用户主动选择，已有会话不被手机强制降级或升级。Remodex 默认也为 On-Request；其自动审核档依赖 native 支持，不应第一版照搬成无条件选项。

[官方 Speed](https://learn.chatgpt.com/docs/agent-configuration/speed) 明确 Fast 与额外用量相关，ChatGPT credit 与 API billing 不同；按账号/模型实际能力呈现，避免硬编码通用价格倍数。[官方权限](https://learn.chatgpt.com/docs/permissions)区分权限范围与审批策略，受管理配置限制。本机生成 schema 有 `model.serviceTiers`、`thread/settings/update`、`ThreadSettings`、`permissions` 与 `sandboxPolicy` 互斥约束；字段省略与 serviceTier=null 的含义不同。

官方源码进一步明确：`thread/settings/update` 的空响应仅表示排入队列，依赖前一个设置的后续更新必须等 `thread/settings/updated`，或合并为同一个请求。因此“RPC 返回成功”不能直接作为“生效”依据；发送路径也需保证采用用户选定的完整有效设置。参见固定提交 [turn_processor.rs](https://github.com/openai/codex/blob/44fe510ce3ee61c8ef623adcbf89b901c73ddd61/codex-rs/app-server/src/request_processors/turn_processor.rs#L810) 和 [设置集成测试](https://github.com/openai/codex/blob/44fe510ce3ee61c8ef623adcbf89b901c73ddd61/codex-rs/app-server/tests/suite/v2/thread_settings_update.rs)。公开 `ThreadSettings.collaborationMode` 本身也是必填对象，支持本次兼容缺陷判断，但公开字段仍不等于 Desktop 私有状态结构。

## 官方源码带来的架构依据

1. **按实际 native 版本生成协议类型和契约样本。** 最新源码、安装版本和 Desktop IPC 分开跟踪；不能用 `any` 与手写默认值代替完整状态契约。修改配置、resume、pending approval 与断开订阅都应采用原生语义。
2. **把历史读取从连接恢复中拆开。** 本机 0.153.3 schema 已标注 paginated thread 的全量 includeTurns 读取过时，提供 metadata、turn summary/notLoaded、item 分页、excludeTurns 和 initialTurnsPage。latest main 中 legacy turns 分页仍可能完整重建 rollout，item 分页也存在不支持的线程路径；需能力与错误分支、缓存及事件驱动，不能只改字段后继续高频轮询。单页条数上限不等于字节上限。参见 [thread_processor](https://github.com/openai/codex/blob/44fe510ce3ee61c8ef623adcbf89b901c73ddd61/codex-rs/app-server/src/request_processors/thread_processor.rs#L3075)。
3. **订阅断开与任务停止不同。** 官方当前实现与测试覆盖活跃 turn 在 unsubscribe 后继续、重新 resume 时恢复 pending requests。手机进后台不应停止工作，回前台需恢复同一任务/审批身份。参见 [thread_unsubscribe 测试](https://github.com/openai/codex/blob/44fe510ce3ee61c8ef623adcbf89b901c73ddd61/codex-rs/app-server/tests/suite/v2/thread_unsubscribe.rs#L200)。
4. **共享 App Server 是可研究方向，不是即插即用的 Desktop 接管。** [app-server-daemon](https://github.com/openai/codex/blob/44fe510ce3ee61c8ef623adcbf89b901c73ddd61/codex-rs/app-server-daemon/README.md) 通过本机 socket 提供可共享的公开 App Server；仍标为 experimental。本机 0.153.3 源码已有早期 daemon，最新与桌面内置版本继续演进。但它只共享自己的 ThreadManager，不能自动接管另一 Desktop stdio 进程持有的任务；只有两端实际接同一 server 才可能替换相应私有 IPC 路径。本轮没有启动、更改或迁移用户 daemon。
5. **有界背压比提高帧上限更重要。** 官方慢 WebSocket 消费者被独立隔离，stdio 等待队列空间；远程分段还有 sequence、重复/错序、大小与数量限制。这些可为新恢复协议提供测试思路，不代表 Clawket 应照搬官方 main 的大重组上限。超时也不意味着原生写操作已取消。

## 从 Remodex 学什么

基于 2026-09-26 固定提交，主要参考：

- [权限模型](https://github.com/Emanuele-web04/remodex/blob/00b29057c35794d7802b3fbc7d9a4d102d34517f/CodexMobile/CodexMobile/Models/CodexAccessMode.swift)：Ask / 自动审核 / Full 的明确映射。
- [运行设置同步](https://github.com/Emanuele-web04/remodex/blob/00b29057c35794d7802b3fbc7d9a4d102d34517f/CodexMobile/CodexMobile/Services/CodexService%2BRuntimeSettingsSync.swift)：每线程串行、owner epoch/revision/确认，避免切设置后 Send 抢跑。
- [前台传输恢复](https://github.com/Emanuele-web04/remodex/blob/00b29057c35794d7802b3fbc7d9a4d102d34517f/CodexMobile/CodexMobile/Services/CodexService%2BTransport.swift)：探测服务实际响应，ping 本身不足以证明 native 可用；前台有有界探测和统一恢复。
- [安全传输与事件回放](https://github.com/Emanuele-web04/remodex/blob/00b29057c35794d7802b3fbc7d9a4d102d34517f/phodex-bridge/src/secure-transport.js)：phone ACK、sequence、每进程 epoch、最多 500 条/10 MiB 的内存缓冲，显式 gap/reset/completed，超窗回权威历史。不是无限持久日志，也不代表重启后必能回放。

不照搬其 rename/archive 本地先成功、native RPC 失败只记日志的处理；跨端应显示真实同步结果。没有测量依据声称 Remodex 从不掉线，也不能从功能列表推导可靠性。其 E2EE 值得作为单独安全项目，不能当作重连修复。

## 建议执行顺序

**A：已知缺陷与基础体验，不依赖 V3。** 修复 Desktop 状态契约；统一前台恢复 owner、健康优先队列、旧请求取消与 epoch；限制长历史；恢复自有 native 进程；补权限/速度/复制 ID/原生改名/归档。分别验收，不把所有范围压进一次发布。

**B：协商式恢复协议，可命名为 V3。** 必要语义：连接/进程 generation，操作 ID 与接受/运行/完成/未知状态查询，snapshot revision，事件 sequence/ACK/cursor，有限回放与明确缺口，pending approvals/questions 恢复。中断后查询同一操作，不能盲目自动重发提示词。控制流优先于历史/附件。Relay 保持无聊天持久化，回放放主机端有界存储，超窗读原生历史。

旧 App/Bridge 不具备能力时保留旧协议；OpenClaw 原生协议无需被整体替换，由 Bridge 做能力适配。保持 origin-routed RPC、当前 socket 校验、身份隔离和 v1 compatibility 门禁。

**C：安全和链路升级单独评估。** 新通道可协商手机到 Bridge 的端到端加密，Relay 只转密文；身份认证、重放防护、密钥生命周期、重配/撤销和旧通道降级显示须完整设计并审计。不自己拼密码学后宣称安全。只有区域可达性与分段时延证明确有必要，再加备用路径/地域；不先引入多云或更换传输技术。

Cloudflare 的 [WebSocket hibernation 文档](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)说明可保留连接并用附件恢复内存状态；现阶段无证据表明平台本身必须替换。平台行为与具体网络质量仍须实测。

## 验收目标（尚未达成）

在手机网络可达、电脑在线的受控条件下，建议以回前台到可发消息 P95 ≤3 秒、P99 ≤8 秒为首版目标；分别记录 iOS/Android、网络、Bridge/native 版本和冷热连接。首次打开、恢复连接、模型首字延迟分开统计，不互相代替。网络不可达时目标是及时而准确地反馈，不承诺 3 秒连接。

- 五后端各测至少 100 次后台恢复/网络切换；后台 30 秒、5 分钟、30 分钟，锁屏、Wi-Fi/蜂窝切换均覆盖；和强杀重开的恢复分布对照。
- 8 小时空闲/长任务/审批等待稳定性；不能靠人工重启 App 或 Bridge 才恢复。
- 在发送前、native 已接受但 ACK 丢失、工具执行中、final 丢失时注入断网；零重复执行、零丢失已确认输入、零假完成。
- 主机睡眠/唤醒、Bridge/native 子进程退出、owner replacement、重复实例、巨大工具输出、长历史分页。
- 手机新建→Desktop 打开续聊；Desktop 新建→手机续聊；双方交替设置/发消息；模型/thinking/speed/权限以实际执行和返回设置为证。
- 旧 App×新 Bridge/Relay、新 App×旧 Bridge/Relay，OpenClaw/Hermes 单独完整回归，v1 replay 保持发布门禁。
- 视觉验收：缓存历史立即可读，恢复不清空/强制滚底，不同时堆叠多个连接错误；等待审批/提问状态优先，重试只有一个明确入口。

## “超过 Remodex”与规模、安全门禁

负责人明确要求速度、稳定性、安全性都超过 Remodex，五种连接适用相同质量标准。应把它定义成可复核的目标，不能凭作者背景、功能数量或少量成功测试判断。

竞品比较只覆盖双方共有的 Codex 场景：固定手机、电脑、网络、原生模型和软件版本，交错测冷启动、后台恢复、黑洞连接、ACK 丢失、长历史、审批、Bridge 重启。连接可用、历史可读、模型首字分别计时；比较成功率、P95/P99、人工重启次数、重复执行和输入丢失。其余四后端沿用相同测试结构，并核对各自 native 语义，不伪造跨产品比较。

100 次恢复与 8 小时浸泡仅是验收起点，不能证明百万用户规模；100 次零失败仍有约 3% 的单侧 95% 失败率上界，也不足以稳健评估 P99。更高可靠性结论需要足够且代表性的重复试验、分平台/网络统计与灰度线上证据。

当前还存在两个明确的安全/容量设计缺口，列入后续工作，不等于已发生攻击：

- Codex local pairing 默认监听 `0.0.0.0` 并生成 `ws://` LAN 地址（`apps/bridge-cli/src/codex.ts`）。这是明文通道；不能在其上静默开放完整主机访问后宣称安全超过 E2EE 竞品。需要经过端点身份校验的加密路径及明确的旧通道边界。
- Relay 的 128 client 上限目前只覆盖协商式 OpenClaw client channels（`apps/relay-worker/src/index.ts`）。其他后端的单 socket 速率/并发限制不能替代每配对身份的总预算。需按设备/room 限制连接、并发、字节和启动频率，防止有效凭据创建多个 clientId 放大负载。

安全验收需覆盖设备撤销立即影响现有 socket、项目范围、owner epoch、审批重放、跨会话串线、慢消费者、明文/密钥日志、加密降级。邀请加密不等于聊天 E2EE；E2EE 的端点身份、双向密钥确认、nonce/epoch、撤销轮换和负面测试必须完整且经过独立审查。已被攻破的端点不在 E2EE 可保护范围内。

“百万用户”需转换成同时在线电脑/手机数、连接小时、重连峰值、流量与大帧分布，再递进做隔离容量测试。优先量化每千连接小时的 CPU、存储写入、心跳/轮询请求和费用，避免用更高频 ping 换表面速度。当前没有百万并发验证，也不能从 DO 可分片直接推出容量结论；这不影响先修已有的恢复缺陷。

本轮尚未实施这些修复，也未完成上述验收。下一步应先确定范围和默认权限策略，再分阶段落实。
