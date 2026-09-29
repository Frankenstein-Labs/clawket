# Codex 与连接恢复升级 · 实现及验收

状态：功能候选已完成本轮 Android 真机与 iOS 模拟器的分项验收，安卓独立 **Clawket QA** 已留在可验收页面。最终检查发现的 Android 键盘残留与 iOS 草稿空白均已修复，并通过实际设备复验。发布风险复评：目前没有已确认尚未修复的代码级硬阻塞，建议进入正常发布流程；周期性停滞、Desktop GUI验收缺口与一次显示异常按下表管理，最终提交和发布门禁仍需完成。负责人已授权功能修复、共同连接层升级、Preview 和真机测试；未发布包、部署 Production 或准备商店分发包。

最新设备进展：五后端安卓真实收发、Codex 设置/归档恢复/提问/ACK 丢失及后台恢复已分场景实测。最新 Android 同步键盘候选通过实际中间帧、发送后立即收键盘、快速再聚焦、长草稿/展开/设置返回/正常导航与后台布局检查，单次新 Claude 回复另经原生审计确认未重复；此前动画不佳的 RN-only Android 方案已否决。当前生产 Worker 字节的本地历史兼容矩阵 **24/24 阶段通过**。iOS 新冻结源码 `989d667f…0f9c6` 已通过保留草稿冷恢复、会话往返、真正拼音组合输入、系统粘贴和唯一新消息实发；原生收件/最终回复各一次。此前完整53条历史及原生 KAV 后台检查的证据分别保留。Desktop IPC v2 契约和真实恢复探针通过，但原始 Desktop GUI 报错仍需实际窗口验收，不能以探针替代。

**本轮功能验收通过，建议进入发布流程；已知风险保留，最终提交及发布门禁待完成。**02:30 旧候选曾因未确认大帧等待 90 秒，手机故障到新认证为 80.310 秒。补齐 SDK 三后端有界目录、探活突发预算及活动客户端 5 秒 owner 探活后，05:00 从手机明确发现故障到新认证 **8.141 秒**，新历史 **10.763–11.793 秒**；06:00 对应为 **1.752 秒**和 **3.139–4.060 秒**。进一步把手机前台探活改为 5 秒后，07:00 故障到认证 **1.767 秒**，新历史 **4.292 秒**（相邻采样界限 3.773–4.764 秒）；实际健康探活间隔中位数 5.169 秒，包含回复 RTT。最后一条 Relay 信号到发现故障的间隔从 06:00 样本的 20.032 秒变成 07:00 样本的 10.062 秒，但这仍不是已知故障起点。不能把发现后的恢复时间写成总故障时长，也不能把不同故障相位的单次样本当性能百分位或受控胜负。三次均未重现此前的 90 秒等待；05:00 曾有首次新 socket 打开失败，后两次一次成功，未提供该失败的根因证据。周期性停滞与偶发建连失败的具体网络／代理／服务根因仍未确定。

此前 110 秒安卓后台样本返回后，新认证及健康确认需 2.680–3.744 秒，新成功历史提交需 4.183–5.441 秒，随后真实新消息成功。最新游标修复后，安卓已读取并逐条核对完整 47 条原生历史；约 182 秒后台返回仍保留全部历史和阅读位置。06:20 静置截图发现权限图标和模型名称显示不一致，原生仍保留 Full access / high / priority；显示异常未复现、根因未确认，后续 Unknown 展示与只读重试已通过受控夹具及原生无写审计。图片队列实验已两次完成约 472 KiB 帧、25 秒受控延迟，同 socket 与精确一次原生输入/回复；不代表 5 MiB 真实弱网吞吐。其他四后端已完成实际新回复；iOS 最终实发已通过，本机 Desktop GUI 仍需实际窗口验收。不能宣称已超过竞品，也不能把局部样本当作稳定性保证。下面的风险复评分开产品缺陷、验证缺口和发布控制；后文保留阶段性失败、修复与复验。

## 发布风险复评（最终功能验收后）

上一轮“不建议发布”的表述把未知边界与硬阻塞混在一起，过于保守。依据同一份测试证据，建议已验收候选进入正常发布流程，完成最终提交/CI/包检查后分批发布；不要求先证明所有网络故障根因、百万用户容量或竞品优势。此判断不表示未知故障已消失，也不是发布执行授权。

| 遗留项 | 当前证据与分级 | 发布处理 |
| --- | --- | --- |
| 周期性选择性停滞 | 仍发生，独立无DO Worker也出现；最新候选能自动恢复，采样中草稿/历史/设置保留、无自动重复写。属于可靠性风险，未证明当前存在永久失联或数据损坏。 | 可以随版本发布并跟踪；若新证据出现无法恢复、丢消息或重复执行，重新判为阻断。不把4.29秒检测后恢复当总停滞时长。 |
| 原Desktop GUI恢复报错 | 对应设置契约、IPC v2与同ID冷恢复真实探针通过，缺原实际窗口闭环，并非已证明候选仍报错。 | 发布准备期间优先补定向验收；若仍复现基础续聊不可用则必须修复。未检查前不宣称此GUI场景通过。 |
| 一次权限/模型显示退化 | 原生权限/Fast未变化，未发现越权或实际降权；未再次复现，Unknown显示与只读重试已验证。 | 非阻断显示风险，保留追踪，不宣称根因已修复。 |

当前客户端1,185文件源码摘要重新只读核对仍为 `989d667f…0f9c6`，与最终设备验收一致。共享工作区包含其他变更，发布前仍须固定完整待发布提交，并通过该提交的必需CI、兼容与分发配置/包门禁；缺少这些步骤属于发布控制未完成，不等于产品仍有已确认的硬阻塞。此前24/24兼容结果保持其原证据边界。

## 范围与证据

- 基线源码：Bridge 3.1.3 `4d483b913ab9afafcf6f25c28f85a544644095f4`；工作目录 main `a7c76b7a`，保留已有其他会话未提交改动。
- 真机：Samsung SM-A566B / Android 16，USB 已授权。正式包 3.0.0/30001 与旧 QA 包 3.1.0/30100 均保留；旧 QA 包连接的测试服务部分已停止，不能将其离线当作候选版本恢复失败或速度基线。
- 私有证据目录：`~/.clawket/testing/connection-upgrade-20260928/`，权限 0700。截图、计时原始数据与配对材料不提交 Git。最初 001 为启动帧，002 为旧 QA 的离线缓存主页，均已目视检查。
- 不改变电脑网络节点，不接管/中断用户已有原生任务，不把网络超时解释为执行已取消。
- 研究依据、原生版本、竞品边界：[调研记录](codex-and-connection-research-2026-09-28.md)。

## 本轮实现项

| 工作 | 状态 | 关键约束 |
| --- | --- | --- |
| Codex Desktop 完整有效设置、恢复 null.settings | 原生 IPC 契约与真实调用通过；Desktop GUI 待人工验收 | 不生成虚假默认值；保留原生 ID、历史与权限 |
| Codex 权限、模型/思考/速度统一控件 | 单测与安卓真实调用通过；Fast 归档恢复复验通过 | 更新确认后才能发消息；完整访问仅显式选择的会话 |
| 未知权限的显示与只读重试 | 组件回归及类型/设计/语言检查通过；Unknown、紧凑重试及原生无写审计均通过 | 未知不等于自定义/降权，不更改原生权限或新增发送限制 |
| 原生 ID、重命名、可逆归档 | 单测与安卓实际操作通过 | Native 成功后更新；提供已归档恢复入口 |
| 五后端统一前台恢复、健康优先、旧 socket 请求取消 | 窄回归与安卓/iOS 分场景复验通过；周期停滞原因未定 | 恢复不等待旧 catalog；不自动重发不明结果写操作 |
| Relay 全后端连接预算 | 本地协议测试通过、五套 Preview 已部署实连 | 128 full / 16 pairing / 每 token 8；替换不占新槽；hibernation 保留计数 |
| 三种原生 Bridge 本地 WS 入口防护 | 已实现，真实本地 socket 测试通过 | 32 个 socket 上限；拒绝跨站 Origin，保留 RN Android 同端点 Origin |

上述入口防护不等于聊天端到端加密。Relay 现有 TLS 与 LAN 明文边界如实展示；本轮不以自制密码协议换取“V3”名称，不声称已经超过竞品安全性或证明百万用户容量。

## 验收顺序

1. 最窄测试逐文件串行；原生版本契约、权限限制、设置/Send 竞争、归档恢复、长历史、owner 更替。
2. 独立开发包及隔离测试连接；每个后端真实发消息、审批/提问、历史续聊、停止。
3. 安卓前后台、锁屏、短/长断网、旧 catalog 黑洞、ACK 丢失、工具执行与完成消息丢失；分别记录可发、历史可读、首字延迟，不互相替代。
4. 截图目视复核紧凑 Composer、设置选择、会话菜单、错误/恢复文案；检查其他后端控件未被误开。
5. v1 回放、候选与旧端兼容、必要 Preview 实测。资源规则不允许测试套件、构建和模拟器并跑。

## 验证记录

2026-09-28 第一轮窄文件验证（均单文件串行，无构建/模拟器并行）：

- Mobile：coordinator 120、三后端 socket retirement 3、Relay transport 11、OpenClaw/Hermes legacy parity 120、两层 foreground policy 12、diagnostics 7、controller contract 54、queue 64；合计 391。最初 contract mocks 缺新 ref 导致失败，修正 fixture 后重跑通过。覆盖旧 roster 永不返回、前后台代际改变、迟到成功/失败不能影响新连接。
- Agent protocol：mock 17、capability 5。
- Relay：全后端 admission/hibernation 7、index 53（含拒绝新后端凭据扩散的实际 fetch 分支）。
- Runtime：Origin policy 15、三后端真实本地 WebSocket admission 6、Pi server 1、Claude server 3；拒绝跨站/第 33 个未认证 socket，接受 React Native 同端点 Origin，不触发未认证 native RPC。

这批验证不构成候选整体通过；Codex native 设置/历史与 UI 仍在修改，后续需重跑受影响文件并完成真实设备验收。

该阶段尚未完成候选真机测试。即使后续单机实测通过，也不能报告恢复 P95/P99 或发布结论；每项结果须注明模拟/协议测试/实际设备、样本量与失败，不以测试断言当作真机时延。

第二轮局部验证：

- Mobile Codex 控件：`useChatModelPicker` 31、`RuntimeSettingsSheet` 7、SessionPanel model 25、SessionPanel 22、Codex adapter 15，共 100 项；mobile TypeScript、UI 样式、19 语言严格检查（1469 keys、0 missing）及设计文档检查通过。无设备视觉结论。
- Codex runtime：service 59、desktop-state 4、rpc 12、settings 3 与 TypeScript 曾通过；之后对原生版本解析、历史精确消息身份和超大帧处理有追加修改，必须重跑对应文件。
- 已安装 Codex CLI 0.153.3 的隔离真实探针通过：有效 workspace/read-only 权限切换、Fast/标准与 reasoning 切换、真实模型回复、Desktop IPC follower 非空规范设置、原生重命名/归档/同 ID 恢复、重启后持久收件记录和只读历史。**重启后实际续聊首次失败，仍在修复与重新验证**；不能据前述通过项目宣称整体通过。
- 新发现单项目配对此前未连接 Desktop IPC；正在补齐与整机配对相同的协作入口，仍保持项目授权范围。

第三轮收件恢复验证：11 个窄文件共 210 项通过（prompt-status 2、Pi prompt-identity 2 / service 20 / RPC 4、Claude service 25、protocol mock 18 / capabilities 5、Mobile sendRecovery 7 / session-adapter-recovery 6 / queue 67 / contract 54）。Pi 原生精确映射尚待真实模型验证：仅在私有 owned 进程、同 session 与预先记录的叶节点、按 JSONL 顺序确认 prompt、唯一 user entry 且 parent 链连续时保存 entry ID；歧义保留“电脑已收到，执行未确认”，不凭文字或时间匹配成功。映射读取限制为尾部 64 KiB 和 256 条增量，文件旋转后旧映射不可用于新历史。

独立 review 发现并继续修复：模型/权限写入期间断线导致旧设置仍可发送、模型面板加载状态未结束；Relay 中另一个有效配对凭据可冒用 clientId 替换已有 socket。后者新增的凭据绑定保护只适用于含 fingerprint 的 attachment；滚动部署前旧 attachment 的首次重连保持原兼容语义，不能宣称即时覆盖所有旧 socket。

第四轮验证与更正：

- Codex CLI 0.153.3 与 Desktop 内置 0.158 均完成隔离真实模型探针，包括冷重启同 ID 续聊、原生 clientId 精确回显、有效权限/速度切换、重命名/归档/恢复、独立 Desktop IPC follower 非空设置与回复。首次 CLI 续聊失败已修复：初始化 userAgent 的 originator 含空格，不能按无空格名称解析版本。Desktop 探针第一次使用了不存在的旧二进制路径，改用安装解析器对应的实际路径后通过；不是产品 fallback 成功的证据。两组当时都依赖本机 Desktop broker，CLI-only 无 broker 情况仍在补验。
- Codex 最新窄文件：service 61、settings 3、desktop-history 3、rpc 14；desktop-state 前轮 4，runtime tsc 通过。此后冷会话设置准备、默认 follow 全历史读取仍在改动，必须再次验证。
- 独立 UI review 修复后：hook 36、共享设置状态 2、SessionPanel 24，共 62，mobile tsc 通过。未确认写状态跨 Thread 卸载/adapter 替换保留，旧读回不能确认新写；归档结果按当前连接/页面代际隔离。
- Relay 最终 admission 8、index 59、hibernation 20 通过；包含跨配对凭据抢占拒绝、restricted/full 同 ID 的正式连接优先恢复。首次新增 fixture 缺 Hermes KV 及使用错误 key 前缀，已修正并重跑全部该文件。Relay tsc、文档检查（7 对指令文件及 5 项 checker tests）通过。
- Android 开发包首次触发已记录的本机 Gradle 9.3.1 符号链接缓存问题（缺 libs）；改用已验证的 SSD 实际路径 Gradle cache 后继续构建，不修改 RN 源码、wrapper 或发布签名。只构建独立包名的 Debug APK，尚未完成安装验收。

第五轮原生与开发包验证：

- Codex 两个已安装版本均通过 CLI-only 冷恢复：探针注入不存在的 Desktop broker，不停止用户 Desktop。首次发送前的设置面板正确读回、原线程续聊成功；0.153.3 与 Desktop 0.158 两个方向的竞争进程均被原生排他 writer lock 拒绝，即使原 owner 空闲也不能接管。例外仅限 Bridge 创建、已验证版本、history/cwd 一致且确认未分发的 broker 故障；不推广到 imported 或未知版本。
- 最终 Codex 窄文件：service 69、desktop-ipc 9、rpc 14、desktop-history 4、settings 3、desktop-state 4，runtime tsc 通过。删除隐式全量 IPC history 请求后普通 follow 的实际 snapshot/settings/reply 再次通过。桌面 GUI 中打开用户历史仍未验收。
- Fast 仅在原生 OpenAI provider 与 native model catalog 同时声明支持时开放；自定义 provider 不因共享目录或一个 serviceTier 字段被宣称加速。
- Pi/收件恢复追加验证：Pi service 23、sendRecovery 9、controller queue 68 / contract 54，共 154。覆盖 checkpoint 后新任务竞争、损坏 receipt、停止后迟到回调不重启进程、冷缓存只读对账。真实 Pi 精确 echo 仍待跑。
- Android 独立开发包构建成功：`com.p697.clawket.connectionqa`，Debug、arm64、30101；601 个 Gradle tasks / 2m07s。本地 .env、app.json、Gradle 配置前后摘要一致，测试 Pro 仅通过构建/Metro 进程环境启用。未打商店分发包，未改发布签名、未覆盖已有 App。

第六轮 UI 与隔离部署：

- 最后新增 UI 恢复入口：ThreadView 112、ThreadScreen 66、useChatModelPicker 36，共 214；mobile tsc、19 locale / 1471 keys、227 UI / 882 TS 样式检查、设计系统检查通过。
- 五套 Relay **仅 Preview** 已部署候选连接安全逻辑；每次仓库部署工具强制串行执行的 v1 replay 都是 5 files / 39 tests 通过。没有修改 Production 或 Registry。测试使用各 backend 原有独立 Preview KV / DO / registry binding。

| Preview backend | 已部署版本 |
| --- | --- |
| claude-code | `8bf46a32-8a28-42cb-9d93-fa198f0da720` |
| codex | `e94997de-44d9-4045-9ca3-d21a140be2ec` |
| hermes | `d568fe5e-3d94-41d2-8728-8e9d0289488d` |
| openclaw | `34aeee03-a60c-4dcf-b7f2-e8414cf0a47d` |
| pi | `24aa316c-f45e-4795-a159-2e7a9d1268cb` |

## 传输与发送恢复专项记录

五后端共用的恢复已集中到 `ConnectionCoordinator`：前台、发送前检查和 watchdog 复用健康检查；健康不排在可选 roster 请求后；后台使旧健康证据失效，迟到结果不能影响新代际。socket 退役立即拒绝其未完成 RPC，恢复不重发结果不明的写操作。Codex / Claude Code / Pi 的 `chat.promptStatus` 只在能力协商后使用，`recorded` 仅证明 Bridge 持久收件，不能宣称原生已执行；OpenClaw / Hermes 保留原有身份与历史恢复语义。

Pi 已完成真实原生验证：官方安装版 0.87.1、独立 QA 项目与会话目录，使用已有 DashScope / qwen3.5-plus 配置的私有副本。两个完全相同的 prompt 分别使用不同幂等键，真实模型轮次约 1497 / 1603 ms，各映射一个不同的原生 entry ID；service 重启后两个精确历史回显和原 receipt/runId 均保留。扩展命令没有原生用户 entry 时，重启前后均保持 `recorded`，未知键为 `unknown`。用户原 models/auth/settings/trust 文件摘要未变，测试 RPC 进程全部退出。证据在私有 `pi-native/probe.log` 与对应 `evidence.json`。这是单机原生/真实模型契约验证，不能替代手机隧道或丢包时延验收。

第一组 Codex 安卓短后台观测：65 秒、86 次只读采样、0 次 CDP 不可用；仅计入采样内进入 Android Settings 后返回的完整一轮，采样开始前的 Home 切换不计入。后台时长的采样边界为 3.792–5.718 秒；返回至新健康确认约 674–1841 ms，内部 `foreground_recovery` 操作为 685 ms。adapter 始终 ready，未发生 socket/adapter 重建，旧的 7 条可见消息保持。**回前台后至少 43.646 秒未观察到新的成功历史提交，此项失败，不能把缓存可见或健康成功算作历史恢复。**私有源数据：`observations/short-background-1790600263235.jsonl` 及同名 `.summary.json`。

该实测暴露了具体生命周期缺陷：history hook 返回对象与回调随 render 改变，导致 AppState effect 重订阅；cleanup 会取消刚安排的前台刷新定时器/失效其 probe sequence。前台事件本身更新 receipt 状态，足以触发这条路径，不需要 SessionPanel 操作。已将订阅生命周期与回调身份分离，用 latest ref 读取当前回调；仅真实 adapter/session scope 变化、卸载或再次进入后台时取消旧恢复。未通过 memoize 掩盖依赖问题。新增 10 项回归覆盖五后端在定时器前/健康检查中重渲染，以及 session/adapter 切换、再次后台、卸载和健康失败；**该阶段自动化测试待执行，后续 359 项窗口已覆盖**。

修复后的同机短后台复验已通过一次：45 秒、60 次采样、0 次 CDP 不可用，完整 Settings 切换的后台边界为 4.588–6.063 秒。返回至新健康确认 586–1326 ms（内部操作 599 ms），至新的成功历史提交 1468–2939 ms；健康确认至历史提交 882–1613 ms。成功提交的请求时间明确前进，不能解释为仅展示缓存；UI 持续 ready、7 条消息保持，未见 uncertain 或重复精确回显，也没有新 adapter/handshake。私有数据为 `observations/short-background-1790601209921.jsonl` 及同名 `.summary.json`，CDP 往返中位 42 ms、最大 180 ms。前后各一轮证明本缺陷修复生效，但只覆盖 warm 前台恢复，不能替代长后台、断网、ACK 丢失和其他后端验收。

随后 Claude Code / Pi 各完成一轮同机短后台复验，均观察到新的成功历史提交：

| 后端 / 私有样本时间后缀 | 采样数 / 时长 | 后台时长区间 | 回前台至健康 | 回前台至新历史提交 | 观测保留的消息数 |
| --- | --- | --- | --- | --- | --- |
| Claude Code / `1790601789650` | 60 / 45 秒 | 4.441–5.983 秒 | 310–1123 ms | 1034–2273 ms | 3 |
| Pi / `1790602601106` | 54 / 40 秒 | 4.544–6.259 秒 | 925–1858 ms | 1309–2985 ms | 2 |

两轮 CDP 不可用数均为 0；adapter/界面持续 ready，无新握手、uncertain 或重复精确回显；内部健康操作分别 567 / 1044 ms。对应 `short-background-<后缀>.jsonl` 和同名 summary 保留摘要与来源 SHA-256。此处没有发送新消息，不能据此宣称 ACK 丢失场景通过。

Claude Code 候选代码的网络监听补丁前样本 `network-switch-1790601860383.jsonl`：100 秒 / 134 次采样，手机 Wi-Fi / 数据恢复命令完成后，约 15.5–16.3 秒才出现新的认证握手 ready，16.3–17.2 秒出现成功历史提交；恢复自动完成，3 行历史保留。UI 的 offline→ready 记录间隔为 10.639 秒，首条 transport reconnect→新握手为 30.684 秒。**恢复速度未达目标。**这是本轮候选代码的局部 before，不是已发布 3.1.3 的基线。无线开关命令使用电脑时钟，通过同机 observer elapsed 作近似区间对齐；不能直接减手机时钟，也不能把 radio enabled 当成互联网已经可用。采样未测真实互联网恢复时刻。

源码确认此前只有前后台通知，没有 OS 网络改变订阅；连续断网积累的 transport 退避会在网络恢复后继续等待。已补最小共享路径：使用已有 `expo-network`，只接收可用性/type 提示，网络返回或已知 type 改变后由 coordinator 在 300 ms 稳定窗、至少 5 秒间隔下验证健康/提前一次重连；不打断进行中的连接/握手、不重置退避计数，不重发写操作，不记录地址或网络标识。后台/停止/连接切换取消待执行提示，迟到初始读不能覆盖新事件。**该阶段自动化与真机复测待执行，结果见后续窗口**；此处源码修改本身不算速度改善实测。

补齐同 socket 的历史恢复边界：网络 hint 后健康成功但 adapter 状态未变化时，coordinator 发送当前代际的临时通知；只有聚焦的当前会话订阅，合并一次在途刷新。历史层先等旧网络已开始的同页请求，再读取一次，不能把旧请求完成算作新历史；进入后台、会话/adapter 改变或卸载后不再分发这次追加读取。沿既有历史合并保留草稿、行身份和 viewport，不伪造 ready、不重发未知结果的写操作。对应 controller 五后端、coordinator 迟到结果以及历史读取跨 scope 回归已补，随后在下文 359 项窗口验证。

网络监听补丁后实际样本：Hermes `network-switch-1790603806514.jsonl` 中只纳入仍聚焦 Hermes Thread 的前 112 次采样，离开页面后的 8 次排除；恢复无线开关命令后约 6.0–7.5 秒认证 ready、9.0–10.3 秒新历史提交，UI 的 error→ready 记录间隔 1.442 秒，2 行历史保留。随后同一手机、同一 Claude Code 后端完成 `network-switch-1790604177158.jsonl`（90 秒 / 120 次采样）：恢复命令后认证 ready **3.670–4.737 秒**、新历史提交 **5.170–6.169 秒**；OS hint 从不可用变为可用，记录到恰好一次 hint retry，retry→认证 ready 为同手机时钟 **1301 ms**。3 行历史保留，无 offline/error、uncertain 或重复精确回显。这是候选代码单次前后对比，真实互联网可用时刻未受控，不代表 Release 时延分布或优于竞品。

独立 review 后继续补安全/尾随边界：明确连接鉴权失败由 entry 保存 `needsUserAction`，取消当前 socket 的自动退避、维护和网络提示；自动 foreground/probe 不可绕过，显式用户重连或凭据替换走新的认证。三原生 adapter 保留状态 reason 和认证错误 code。普通会话工具权限失败不进入该连接阻断。历史通知带恢复代际，重复代际去重；慢读中新的真实 path recovery 用单个 pending bit 合并为串行尾随读取，避免漏掉第二次恢复，仍无消息重发或定时重试。相应窄回归已补，并在后续窗口验证。

追加独占窗口验证已完成：`network-recovery` 8、`networkRecoveryObserver` 4、coordinator `index` 145、controller `queue` 88、完整 `useChatHistoryState` 95、`recovery-window` 4、三原生 `session-adapter-recovery` 15，**7 个文件共 359 项全部通过**，均逐文件 `--runInBand`，没有全套并行。包含上文此前待执行的 AppState 重渲染、网络 hint、同 socket 新历史、尾随读取和鉴权阻断回归。Mobile TypeScript 首次仅报告测试夹具类型错误（`renderHook` 的 props 泛型、假 socket 的可选 close 参数）；只修类型声明后通过，无生产行为或测试逻辑改动。资源检查没有其他测试/构建/模拟器，本窗口结束后所有测试及 tsc 已退出。最后新增的鉴权/尾随逻辑仍需候选手机复验，不能将单元测试通过等同于已完成设备验收。

Codex 实际执行中断网恢复：`send-disconnect-1790606371079.jsonl` 已完整采集 100 秒 / 133 次，0 次 CDP 不可用；发送后关闭手机 Wi-Fi / 数据，关闭完成至恢复命令完成为 28.743 秒。恢复命令后新认证 ready 为 **4.177–5.500 秒**，成功新历史提交为 **6.431–8.187 秒**；恰好一次 OS hint retry，retry→新握手为同手机时钟 **1439 ms**。用户消息与规范历史精确回显均从 2 增至 3，`duplicateExactEcho` / `uncertain` 始终为 0，最终 11 条可见行、无活跃运行或未确认发送。独立原生只读证据确认该幂等键只有一个原生输入、一次成功命令执行、一次终态回复，QA 结果文件恰好一行预期标记；手机恢复截图由主验收记录。

这次 `runAcknowledged` 在断网前已为 true，因此证明的是**已确认执行的断线与丢后续事件恢复**，不能称为 ACK 丢失恢复实测。恢复后空输入框的 `canSend=false` 也不能解释为连接失败。私有同名 summary 保留来源摘要、跨时钟对齐区间与 `private/phone-send-disconnect-native.json` 的元数据摘要；复用 `summarize-observation.py` 仅离线读取有界元数据文件，不接触手机或后端。该样本 CDP 往返中位 43 ms、最大 1006 ms，真实互联网恢复时刻仍未测量。

随后完成一次约 321 秒的 Codex 长后台（后台全程没有 CDP，返回前才启动 observer）：`long-background-1790607815064.jsonl` 为 40 秒 / 49 次成功采样、5 次 CDP 不可用。按离开前独立保存的 handshake/history baseline 核验，第一帧仍是旧缓存历史，第二帧才出现新历史；返回命令完成→新历史提交为 **3.852–4.740 秒**。新认证握手在第一可用帧已经完成，受最初 CDP 不可用限制，只能报告 **≤4.012 秒**，不能报告精确耗时或正下界。草稿与滚动位置由主验收截图确认保留；摘要明确没有观测完整 AppState 后台边界。离线脚本缺少旧历史/健康基线时不再以 0 代替，必须记为未能证明新恢复。

**长后台期间仍发现 Bridge 稳定性缺陷：**以先前日志字节/行数锚点为界，Codex、Claude Code、Pi 均新增一次约 60 秒 WS pong 超时并主动重连，OpenClaw / Hermes 本轮未新增。此前无时间戳的累计日志不纳入本轮次数；新样本只能证明当前确有超时，不能确定网络根因。Cloudflare 官方说明协议 ping 会自动响应 pong、不会唤醒 DO，因此不能用“休眠不支持 pong”解释。候选新增协商式 `relay.owner-pong.v1`：保留 WS ping，在原超时点以当前 socket 的一次随机 nonce 应用回声复核，最长增加 5 秒；错误、迟到、旧 socket 回声和任意业务流量均不能延长它。旧 Relay 保留原策略，OpenClaw owner/channel 各自独立。参考：[Cloudflare WebSocket 自动 ping/pong](https://developers.cloudflare.com/durable-objects/best-practices/websockets/#automatic-pingpong-handling)。

心跳补丁的 Bridge 定向验证已完成：helper 10、OpenClaw/Hermes fallback 12、四 runtime capacity/heartbeat 24、Hermes relay 27、OpenClaw runtime 66，**5 文件共 139 项全部一次通过**；逐文件低并发，随后 runtime TypeScript、本地 CLI bundle 和文档检查通过，版本未变。覆盖正常协议 pong 不增加应用 echo、旧 Relay 不发送新控制帧、匹配 echo 保留连接、迟到/错误/旧 socket echo 不续命、业务帧不能掩盖单向故障、协议 pong 取消兜底、停止及 owner/channel 隔离。已准备仅私有 QA 进程使用的真实 Preview 故障注入 preload，分别抑制协议 pong 与两类 pong；当时尚待 Preview 实测和长后台复验，后续真实结果见下文；不能据单元测试宣称周期性超时已解决。

后续真实 Preview 抑制 Pi 协议 pong 的实验并非全绿：第一轮应用回声匹配成功，RTT 451 ms；第二轮两类 pong 均未到达，5 秒后正确回收，手机真实 health 也失败。同窗正常 OpenClaw/Hermes owner 出现应用回声超时，不能据此归责 Pi、代理或 Cloudflare；已有代理日志没有该故障窗的有效记录。手机恢复后 4 条消息及 2 个精确回显保留、无重复/不确定发送。该样本只证明首次兜底可用及失联后能恢复，不证明连续稳定性达标。

为缩短困在旧 socket 的时间，最新候选将**协商成功的 owner/channel**提早至第一次未应答协议 ping 后发同一个有界应用回声；Hermes 已采用首次 pong deadline，保持不变。正常协议 pong 不增加应用请求；任意业务帧不清除待确认 ping，旧 Relay、客户端三间隔下限及写操作不重放保持。理想调度下，三原生 owner 从失败到检测的最坏约 65 秒降至 35 秒，OpenClaw 约 40–50 秒降至最多 25 秒，Hermes 仍约 30 秒；这些是代码时序，不是实测速率或系统暂停下的硬保证。新增第一 miss 边界、迟到协议 pong、停止清理与单次 echo 回归随后已在独占窗口验证：native capacity/heartbeat 36、OpenClaw/Hermes fallback 14、helper 10、OpenClaw runtime 66、Hermes relay 27，**5 文件共 153 项全部首次通过，runtime TypeScript 通过**。内存检查空闲 59%、无并行重任务；所有进程退出后交还窗口。此测试窗口结束时尚未重新生成 CLI bundle，新时机的真实 Preview 复验在下文最终候选阶段完成；上文 139 项属于提前检测修改前的候选。

**最终候选 · Pi 真实心跳注入：**随后使用最终本地 bundle 完成 Pi Preview owner 的真实首次 miss 故障注入：仅抑制协议 pong 时，同一个已协商 socket 连续三轮精确应用回声确认，RTT **162 / 140 / 125 ms**，没有自动断开；open→首应用验证 **30.007 秒**，各次上一协议 ping→应用验证 **15.002–15.004 秒**。再同时抑制协议 pong 和真实到达的应用回复，三轮均在 **5001 / 5002 / 5003 ms** 的应用截止后回收，关闭→替代 socket open **3651 / 2760 / 2482 ms**。这次能明确区分主动过滤与“网络未返回回复”。启动时 owner lease 409 和最后人工停止不计入恢复时延；实际停止均通过该 QA config 的认证生命周期。实验后已恢复无 preload 的普通 Pi，监听 PID 与本地认证 status、Relay ready 均核实。其他四个既有 QA owner 未停止/重启，该实验窗口日志未新增超时。证据为私有 `final-pi-heartbeat-evidence.json`，含最终 bundle 和两份日志摘要；该结果仅证明 Pi owner 的真实心跳恢复，不替代 OpenClaw channel、五后端手机或生产时延分布。

**最终候选 · 五 owner 正常观察：**host `1790612156492` 至 `1790612769167`，共 **612.675 秒**。Codex、Claude Code、Pi、OpenClaw、Hermes 五个既有 QA 进程均保持原 PID、预期命令且无 fault preload；日志文件身份与基线前缀未变，五份日志均新增 0 字节，未观察到新增心跳超时、应用兜底或 owner 关闭/重连。私有 `final-owner-soak-baseline.json` / `final-owner-soak-result.json` 保留进程、文件身份、计数和摘要。此窗口没有注入故障、改 Mac 网络或主动请求原生 API；正常手机操作同时进行。它是被动 owner 日志观察，日志没有变化不是逐次 pong 测量，也不等于五后端手机端或长期稳定性验收。上文历史失败样本仍保留，不能由本次短窗口反推其根因已经消失。

**最终候选 · Codex 长后台复验：**`long-background-1790612852624.jsonl` 在后台结束前才开始采样，独立 host 操作锚点间隔 **329.907 秒（5 分 29.907 秒）**；没有把它描述为完整 AppState 时间测量。返回动作后 35 秒观察取得 41 次成功采样，最初另有 6 次 CDP 不可用。按离开前保存的独立 handshake/history baseline，首个有效帧仍为 connecting 与旧缓存历史；新的认证 ready 在 **3.251–4.733 秒**内出现，新的成功历史提交在 **5.505–6.308 秒**内出现，内部 `foreground_recovery` 为 3383 ms。8 个用户输入及 8 个精确原生回显保留，24 条可见行（包含助手与工具行）未变化，uncertain、unconfirmed 和重复精确回显均为 0；截图 197 的最终可用性由主验收确认。私有同名 summary 及 `final-codex-bg-baseline.json` / `final-codex-bg-actions.jsonl` 保留证据。该单次 Debug/CDP 样本区分了新历史与缓存，不产生 Release 分位数、完整后台 socket 存活或五后端手机验收结论；CDP 不可用本身不是网络故障。

**最终候选 · Pi 手机断网恢复：**`network-switch-1790613494355.jsonl` 共 113 次成功采样、0 次 CDP 不可用。手机无线关闭完成至恢复命令完成为 **21.168 秒**；此处记录的是 host 命令边界，不把恢复开关等同于互联网已可用。恢复命令后新认证 ready **3.785–5.253 秒**、新成功历史提交 **5.287–6.367 秒**；恰好一次网络 hint retry，retry→新握手为同手机时钟 **1246 ms**。原 2 个输入/2 个回复保留，随后负责人实际发送新消息，最终得到 3 个用户输入、3 个助手回复与 3 个精确回显；uncertain 和重复精确回显始终为 0。新发送期间正常 unconfirmed 从 0 到 1 再回 0，不误报为未知发送或故障。截图 203/204 由主验收确认自动恢复及新回复；同名 summary、独立 baseline/actions 与私有 metrics 保留来源摘要。它证明这一次正常 Pi runtime 的自动恢复及恢复后真实可用，不是长期成功率或原生执行次数的独立审计。

**最终候选 · OpenClaw 手机断网恢复仍偏慢：**`network-switch-1790613703450.jsonl` 共 112 次成功采样、0 次 CDP 不可用。无线关闭完成至恢复命令完成 **21.160 秒**；恢复后认证 ready **12.218–13.231 秒**、成功新历史 **15.327–16.184 秒**。只有一次 OS hint retry，hint→新握手 **9568 ms**。首次尝试先持续 connecting，约 5.931 秒后进入 reconnecting，再过 3.637 秒握手成功；第二条 `probe_failed` 可能沿用在途恢复原因，不是两次独立 health RPC 超时的证据，不能直接归为多等 9 秒退避。该窗 owner 日志未见心跳超时、Relay 聚合状态为 true；Gateway/channel 聚合连接约 6.362 秒为 false，但底层 socket 状态不等于客户端认证状态，现有日志未保留足以确定初次 socket 结束原因的证据。**自动恢复功能得到验证，速度目标未通过，原因仍需定位。**

此次 OpenClaw 入口明确路由到已有 `main` 会话，不是此前隔离的手动 QA session；没有重置、删除会话或改变原生全局模型。恢复后负责人另发新消息，采样从 1 用户/1 助手增至 2 用户/2 助手、5 条可见行，无 uncertain 或重复精确回显；采样最后仍 `isRunning=true`，后续终态 UI 需单独记证，不能把已有助手行等同于完成。私有同名 summary、baseline/actions 与 metrics 保留来源摘要。

**最终候选 · 正常观察结束后的新增失败：**前述 612.675 秒窗口本身仍无新增日志；随后普通 owner 又出现应用兜底超时：OpenClaw 在 host `1790613003227` 开始、`1790613008228` 到期，Hermes 在 `1790613010072` 开始、`1790613015074` 到期；三原生 owner 各新增一次兜底超时，但日志没有时间戳，不能精确对齐或断言它们同时故障。私有 `final-owner-post-soak-followup.json` 保存观察到的日志摘要与固定事件分类。它们未发生在前述短 soak 内，也不能由手机无线关闭解释；网络/代理/云端根因均未证实。**因此不能将最终候选宣称为周期性连接停滞已彻底解决。**

采样使用独立 Debug App、Metro 和只读 CDP；CDP 往返中位 45 ms、最大 1259 ms，前后台边界只报告区间，不跨手机/电脑时钟相减。React DevTools 不可用时历史状态记为未测。Metro HMR 会主动退役旧 coordinator 并重建连接，须冻结源码后另起基线。上述单次样本不能生成 P95/P99、Release 后台行为或竞品优势结论；后续仍须分别验证健康、成功历史提交、实际 UI 可用、丢失 ACK 后单次原生执行。

**补充短后台实际样本（上述最终 bundle，后续握手复用补丁之前）：**Claude Code host 后台操作至返回 7.118 秒，39 次采样、0 次不可用；返回后新健康确认 1.159–2.827 秒，新历史提交 2.829–3.929 秒。Hermes 对应 7.131 秒，40 次采样、0 次不可用；健康 1.865–3.006 秒，新历史 4.119–5.038 秒。分别保留 1 用户/1 助手，未见 uncertain 或重复精确回显；Hermes 本身无精确回显字段，不能据此宣称原生执行唯一性。均为单次 Debug/CDP 结果，observer 未覆盖进入后台动作，后台时长使用 host 操作锚点。私有 `final-*-short-*` 与两份 `short-background-1790613957965/1790614333413.summary.json` 已记录；旧 network hint 没有基线，不能算新网络事件。

**持续稳定性仍未通过：**随后被动 20 分钟记录（host `1790614272534–1790615473008`，私有 `stability-plane-1790614272534.summary.json`）再次捕获五 owner 的应用回声全部 5 秒超时，新 Relay owner 就绪耗时 1.649–3.050 秒。故障附近 90 秒独立新 HTTPS health 为 30/30 HTTP 200；全程 400 次请求中 398 个 200，另 2 次 curl TLS 建连错误 35，均未到 HTTP。另有 Codex 3 次、Claude Code 1 次未先触发 fallback 的 1006 关闭。OC 两次 fallback 开始间隔 1,800,409 ms、Hermes 1,801,595 ms，形成 UTC :30/:00 的两点线索；源码未发现半小时墙钟清理，不能据此归因代理或 Cloudflare。新 HTTPS 可用不等于既有 WebSocket/DO 路由健康；500 ms 到达采样不是 native event-loop 测量。Mac 网络/节点/配置未改动。当前代理实际由系统 service 运行，其受保护配置不可读，旧用户目录日志早于故障，不能用“旧日志无错”排除代理。后续增加 allowlisted transport cause 与 Relay owner echo 分支日志，需在部署窗口之后重新验证。

**OC 恢复诊断复验：**新 Mobile 原因诊断及前台握手复用补丁之后，双 radio 关闭 21.185 秒，恢复后追加约 0.8 秒 Settings 切换；112 次采样、0 次不可用，ready 为 5.497–6.364 秒，fresh history 为 8.524–9.440 秒（均从 radio 恢复命令完成计）。实际 OS hint 至新 handshake 为 2.249 秒。断网期观测到 6 组 `ws_error`/1006，没有 1013 或 open/handshake timeout。返回前最后采样是 `reconnecting`，返回后才出现 `connecting`，因此不能把这一轮说成实际覆盖“已经握手时回前台”的分支；该分支另有定向回归。比旧 OC 样本快，但多了 Settings 步骤，不能归因为单一补丁。私有 `network-switch-1790616254833.summary.json` 留存原始锚点与诊断；后续手动新回复由独立 UI 验证。

**17:30 UTC 再次真实停滞（仍为旧 15 秒协议等待候选）：**在五 Preview 17:16 前后完成重新部署、排除部署窗口后，约 14 分钟即再次出现五 owner 应用回声 5 秒超时；OpenClaw 另有独立 channel 超时，不能算成第二个 owner。399 次手机前台静置采样、0 次 CDP 不可用，OpenClaw 显示非 ready 约 **6.015–9.017 秒**，从故障开始至新成功历史 **8.268–10.905 秒**；实际观察到 health_probe/health_failed 后重连，以及握手阶段 **4011**（不是 1013）。7 条历史行、3 用户/3 助手保持，未见 uncertain 或重复精确回显；随后手动新消息成功变为 4+4、9 行。证据 `openclaw-idle-1730.summary.json`。连续 :30/:00/:30 是调查线索，不证明固定连接寿命或某方故障。

只读 Cloud 日志对齐到 OpenClaw、Hermes、Pi、Codex 四个 owner 的 `echo_sent`，同 diagnosticId 随即出现关闭；返回行没有 Claude owner 或 OC channel 的 echo。独立 HTTPS Date 约束 Cloud 相对 Mac 快 **8.530–8.927 秒**；校正后这些 echo 日志约在本地 5 秒兜底截止附近，不能解释成“Relay 立即收到，只是回程丢包”。OC rehydrate_summary 与 echo 相差约 4.449 秒，当前初始化最后仍等待 heartbeat/alarm setup，唤醒/存储/队列/链路都有待分离。Workers 时钟在 I/O 边界更新，日志相同时间戳不等于 CPU 执行顺序或精确网络延迟；没有开启 invocation/trace。`relay-1730-cloud-summary.json` 保留仅固定字段的查询结果与时钟限制。

**下一候选的诊断补充：**保持初始化串行认证及 `blockConcurrencyWhile`，仅总 I/O wall time ≥1 秒或失败时记录 `room_initialization` 的固定阶段与 0–60 秒有界耗时；不改 await、路由、认证或心跳频率。9 项初始化回归、6 项诊断白名单回归和 Relay 类型检查通过；下一 Preview 的实际事件待采样，不能拿没有 slow-init 日志证明平台瞬时唤醒。Bridge 独立协议 pong deadline 与一次快速重连另由对应实现/实测记录确认。 五套隔离 Preview 随后均经各自 wrapper 的 41 项 v1 回放门禁部署成功；本地新 Bridge bundle 已构建，SHA256 `d1429f96fa01d09407f091dabfdcddb0e5b0619ce99a55af455be79c42de3871`。这仅记录候选可测试状态，尚待新截止策略的真机/自然故障窗口；主动部署和 QA 重启产生的关闭从自发故障样本剔除。

### 18:00 UTC 自发停滞与 owner 代际修复

最终五后端 Bridge 的独立 5 秒协议 deadline / 5 秒应用 echo 候选仍在 18:00 UTC 出现共同 owner 停滞；新建 HTTPS 健康检查与同 Mac 的 Postman 两个长连接对照同期正常。不能据此断言代理或 Cloudflare 故障。Cloudflare 的 `echo_sent` 是发送调用返回证据，校正约 8.5–8.9 秒时钟偏差后接近 Bridge 的应用 deadline；慢初始化日志未触发也不能排除构造函数前等待或输出门。

Codex 前台静置记录 `idle-1790618389142.jsonl` 共 400 个样本、0 次观测不可用。手机可见非 ready 窗口仅 0.387–2.709 秒，但 owner 再次 ready 后，手机直到约 30.028–31.739 秒才完成新握手，约 31.530–32.991 秒才取得新历史。这是旧 client 看似 ready 的真实缺陷，不能把短可见重连窗口报告成完整恢复耗时。手机始终保留旧消息且无重复、不确定发送；随后经 UI 新发消息和实际回复成功，仅证明最终可继续。

源码确认 owner 先替换、旧 close 晚到被正确忽略时，旧 full-client 及其 RPC origins 没有被退役；hibernation 忽略 CLOSED owner 也会使原 close 的 current-owner 判断失效。候选修复在安装新 owner / `relay.ready` 前同步持久化旧 full-client 的无正文退役标记、清除 pending origins、以 4011 关闭；旧 close 的异步存储写之前完成旧集合清理。标记写失败返回 503，不接受或宣告新 owner ready；close 失败仍不得从 attachment 重建旧 route；restricted pairing 不升级，首次 owner 保留等待 client。本轮 129 项窄回归（owner replacement 30、index 79、hibernation 20）、Relay tsc、文档门禁及独立 review 通过；五套 Preview 于 18:23:15.742–18:25:25.512 UTC 顺序部署，每套兼容回放 41 项通过。手机上的实际 4011 恢复仍待复验。

### 18:30 UTC 三组对照：共同停滞不依赖 Clawket / DO

五个已升级 Preview 的 owner 在 18:30 UTC 再次出现应用 echo deadline。独立私有 plain Worker 对照（无 DO/KV/产品代码，固定 <=128 字节 QA nonce，Bearer 只在 header，45 分钟限时）在 18:29:52.772 同时发协议 ping 和应用 echo，260ms 后均成功；18:30:07.800、22.825、37.853 三次都未获回复，测试脚本在首个未回应 probe 45.078 秒后主动回收两个 socket，新连接于 18:30:55 返回 pong/echo（166/130ms）。这不是服务器主动关闭的证据。对照源码 SHA、独立部署版本、完整 phase/异常及源文件保存在私有 `incident-1830-three-controls.summary.json`。

同窗 Postman 两个既有 socket 在 18:30:08 正常返回且代次不变；此前 18:25:34.388 的单独 protocol 1006 已保留，不能只挑成功样本。18:29:30–18:31:30 的五服务新建 HTTPS 共 40/40 成功；HTTP Date 与本机的可兼容 offset 区间为 +8.504–8.999 秒（假定短窗内稳定，Date 只有秒精度）。Relay `echo_sent` 与相应 owner close 仍同 Cloud 时间记录，初始化耗时日志没有触发；这不能确定入站、出站或唤醒前等待的位置。

已测 owner 从应用超时到再次 Relay ready：Codex 0.507–1.527 秒、Claude Code 0.511–1.531 秒、Pi 0.508–1.528 秒、OpenClaw 1.470 秒、Hermes 0.686 秒。**这些数值不含故障发现等待，也不等于手机或原生会话恢复。** 之前还有配置为 5 秒的协议等待、约 5 秒应用等待，以及下一次常规 15 秒 ping 之前的未观测窗口；正常成功 pong 当时未记日志，不能伪造最后健康时刻或总失联精确耗时。

结论仅限：Clawket / Durable Object 专有逻辑不是本次共同停滞的必要条件。尚不能区分目的地网络、Cloudflare 平台/网络、本机按域路由或其他环节；没有更改 Mac 节点。19:00 继续同一对照，并以手机实际验证 4011 后及时重握手与新消息。

### 19:00 UTC 复现：服务端退役不能替代手机主动探活

本轮保持五个 Preview 版本、Bridge、Metro 源码与 Mac 网络不变。只为自有 Codex owner 加入不改变时序/不丢事件的私有元数据 observer：最后协议 pong 为 18:59:39.013；18:59:53.841 的下一 ping 未获回应；19:00:03.848 回收旧 socket，04.945 新 socket open。协议请求到回收为 10.007 秒，close 到新 open 为 1.096 秒；最后观察到健康点至新 open 为 25.932 秒。最后健康点不是故障起点，open 也不是手机/原生会话就绪。

Cloud 元数据明确显示 owner close 与 client_pruned 同在 19:00:12.599，新 owner 于 13.449 接管；旧 client 于 15.386 记录 1006，新 client 却到 47.378 才建立。HTTP Date 校正区间为 Cloud−Mac +8.534–8.929 秒。手机 399 样本、0 不可用，没有观察到 4011，只在 `health_probe / health_failed` 后恢复。独立 host/observer 时基测得 owner ready 到手机新握手为 **33.917–35.616 秒**，到新历史为 **35.421–36.922 秒**。不能把这个窗口仅描述成短暂可见重连，也不能将 server.close 调用当成手机收到关闭。

独立无 DO/KV 的 plain Worker 两个既有 socket 同时再失去协议 pong 和应用 echo，测试脚本在 45 秒无响应后主动回收后恢复；Postman 对照代次未变，同窗新建 HTTPS 40/40 成功。结论仍只限共同故障不依赖 Clawket/DO 逻辑，尚不能归责平台、目的地路径或本机按域路由。完整相位、异常、时钟与源码哈希见私有 `incident-1900-three-controls.summary.json`。 19:15 UTC 已删除本轮唯一临时 plain Worker 资源，Wrangler 明确确认成功；两个对照进程及 owner/HTTPS 观察进程均已正常结束。私有元数据保留用于核验，没有修改 Mac 节点。该窗口最终用户消息及助手回复已由主验收流程确认；失活发现、owner 重建与手机握手/历史恢复必须分别报告。

针对手机自身旧连接没有及时收到关闭，已新增候选服务端 `relay.client-ping.v1`：仅显式协商的当前 full-auth 客户端，以 32 位小写十六进制 nonce 同 socket 回声；最多 512 UTF-8 字节，先持久一秒预算，再回复，不修改旧 pong ACK 时间、后端健康或请求路由。owner/channel/pairing/retired peer 一律不回声、不转发。Mobile 侧前台 15 秒 cadence +5 秒 deadline、后台暂停由另一实施项配套。

服务端窄门禁通过 client-heartbeat 28、shared capabilities 15、Relay/shared TypeScript 与文档检查。随后新增真实 compatibility client echo 用例发现 fetch 仅持久旧 pong 能力，部署门禁红灯并阻止发布；已补经 full-auth 的 capability 入场，新增五后端 fetch admission 回归后 index 95 项通过。第二次新测试的 OC 第二手机 barrier 违反旧 active-client 规则，改成 connect 后无需改旧产品路由；两次失败日志均保留。此前 post-await owner fencing 的 hibernation 20 与 pending-requests 10 也通过。Mobile 专项 172 项及 TypeScript/文档门禁由对应负责人完成。五 Preview 随后各自通过 41 项兼容门禁，19:22:45.506–19:24:36.826 UTC 串行部署完成，完整版本与源码哈希记录在私有 `client-ping-preview-deployments.json`；部署窗口须从自然故障样本中排除。**真机复验仍待完成，不计为端到端通过。**

### 19:30 UTC owner 独立采样（不代替新客户端验收）

五 Preview 部署完成后，19:25:36.531–19:35:36.726 UTC 仅被动观察原有五 owner 日志，并每轮串行发五个新 HTTPS health 请求；没有重启 owner、改节点或做故障注入。五 owner 再次各发生一次应用回声超时并重建。OpenClaw 有原始时间戳：19:30:00.203 开始 fallback、05.202 超时、06.036 Relay 恢复（status false 到 true 832ms）；Hermes 为 07.616、12.617、13.071（453ms）。三原生后端只有日志抵达采样时间，不能把 nominal 500ms 轮询当精确故障发生时间；Codex 私有协议 observer 的 45 分钟记录窗口已于 19:27:31 到期。

HTTPS 本轮 **199/200** 成功。唯一失败为 OpenClaw 19:29:52.772 开始，TLS 在 234ms 内完成，但 8.012 秒内未有首字节，最终 curl timeout；不能抹去这次异常，也不能由它定位网络责任。HTTP Date 推得 Cloud−Mac +8.555–8.883 秒。Cloud 五 owner 均在同一毫秒记录 `echo_sent` 与旧 owner 关闭，新 owner 接入分别晚 217–752ms；没有慢初始化诊断。`echo_sent` 仍不代表送达，缺失慢初始化行也不排除 handler 前/output gate 等待。本轮无手机或外站对照结论，不能计作新 `client-ping` 真机通过。脱敏完整样本及哈希见私有 `stability-plane-1790623536530.summary.json`、`relay-1930-cloud-metadata.json`。

## Codex 原生、Desktop IPC 与安卓功能专项

以下为后续实测结果，更新前文分阶段记录中的待验证项；不代表全部连接恢复或发布验收通过。

### 原生设置、续聊与 writer 排他

- 已安装 CLI `0.153.3` 与 Desktop 内置 CLI `0.158.0-alpha.2.1` 均完成隔离真实模型测试：新会话默认 workspace、read-only / workspace 切换、Fast / Standard、reasoning、真实回复、原生重命名、归档及同 ID 恢复。设置以原生通知确认，空的 queued RPC 回复不能作为生效证据。
- 两版本均通过 Bridge 重启后先打开设置、再向原线程续聊；实际原生 `userMessage.clientId` 精确回显发送幂等键。先前 CLI 版本解析失败已修正并通过续聊复验。
- CLI-only 验证通过注入不存在的 broker 完成，没有关闭用户 Desktop。两个版本交叉启动第二个 App Server，原 owner 已完成任务但仍持有线程时，第二 writer 均被原生原子文件锁拒绝，输出稳定的 `native_writer_busy`。该恢复分支仅限 Bridge 创建的线程、上述经过验证的版本、cwd/终态历史一致，且 broker 操作从未分发；未知版本、导入线程或含糊的写请求结果不能据此接管。
- 普通 Desktop follower 的真实 IPC 验证取得规范历史、原生非空 collaboration settings 和最新回复；普通 follow 不再隐式要求完整历史。私有证据为 `codex-native/probe-{cli,desktop,cli-only,desktop-only,follow-bounded}.log`；探针仅操作本轮 QA 线程，完成后测试进程退出。

### 图片与有界历史

- 发现原 8 MiB 私有 IPC 限制是 Bridge 自定值。已安装 Desktop 的 ASAR `.vite/build/application-network-startup-CY4ZWOz-.js`，`Yc` / `ipc-attachMessageReader` 的长度检查为 `l===0||l>268435456`，原生上限为 256 MiB。候选仅将私有本机 IPC 限制设为 16 MiB、历史预算设为 7 MiB；公共 Bridge / Relay / App 的 8 MiB 契约未改变。
- 2026-09-28 21:25 JST 实际 Desktop broker 探针：两个独立 IPC client 传输含 5,242,880 字节合成图片的规范状态，最终 JSON 为 13,983,542 字节。原生要求的 `params.input` 和 canonical userMessage 两份图片内容都通过 SHA-256 一致性检查；未用空 input 或删图绕过大小限制。探针使用随机虚构 conversation ID，没有创建持久线程、调用模型或操作用户任务。
- 接收器按验证后的有界长度分配并增量读取，避免每个数据片段反复拼接整帧。单页或最终投影超预算时明确失败，不终止原生任务。显式完整历史仍有 200 turns / 5,000 items / 字节预算；超限不伪报已经完整加载。
- 最终受影响文件逐个串行验证：service 69、desktop-ipc 9、rpc 14、desktop-history 4、settings 3、desktop-state 6，共 105 项；runtime TypeScript 通过。最后图片相关三文件 19 项于 21:24 JST 重跑通过；第一次大帧 fixture 缺必需 `turns/requests`，修正 fixture 后通过。真实 broker 探针源文件位于私有 `codex-native/probe-image-broker.ts`。

### 安卓 UI 操作与原生只读核验

手机使用独立 Debug 包及 Codex Preview，21:47 JST 创建本轮隔离 project 会话；核验仅查询此 QA native ID。SQLite 使用 URI `mode=ro` 和 `PRAGMA query_only=ON`；未修改原生数据库或控制用户已有任务。

| 操作 | 实际证据与结果 |
| --- | --- |
| Fast 切换及恢复回归 | 手机 `030–032` 选择/确认 Fast；原生 rollout 在 21:51:22 / 21:51:48 JST 的 `thread_settings_applied` 均保留 `service_tier=priority`，证明权限切换与第二轮发送没有清除 Fast。**未手动切回 Standard，归档恢复后 22:14 JST 却读回 `default`，此项失败。**0.153.3 冷 resume 从全局配置恢复 service tier，Bridge 尚未补偿这一原生持久化缺口；正在修复。先前“后续改回 Standard”的说法是未经证实的推断，已撤回。 |
| Read-only 与完整访问 | 手机 `033–043` 完成选择及发消息；原生第 1 轮 turn_context 为 `read-only / on-request`，第 2 轮为 `danger-full-access / never`，均为 gpt-6-astra/high。第二轮含 commandExecution，隔离项目的 `qa-permission.txt` 存在且内容精确为 `ANDROID_QA_OK`。审批卡片操作及截图由主验收流程记录，原生静态读取仅证明这些实际执行设置与结果。 |
| 消息没有重复 | 两轮均为 completed；原生恰好 2 个 userMessage、2 个不同 clientId，分别精确匹配 Bridge 的 2 条持久 receipt。没有使用文本相似或时间窗口推断身份。 |
| 重命名 | 手机 `048–050` 后原生名称为 `Android Codex Acceptance`，再次进入仍保持。 |
| 归档及恢复 | `059` 显示 QA 在已归档列表，`060–061` 恢复，`062` 回到活动列表，`063` 打开原历史；22:14 JST 原生为 `archived=0 / archived_at=null`，Bridge 为 `archived=false`，native ID 与归档前完全相同。 |
| 复制原生 ID | `064` 粘贴结果与本轮原生 ID 精确相同，随后清空未发送。再次只读核验仍是 2 条输入，没有产生第三轮。`059/062/064` 截图已再次目视检查。 |

截图和原始 ID 保留在前述私有证据目录，不进入公开文档。以上证明本轮安卓基本设置和会话管理实际生效；Desktop GUI 打开长历史、旧工具展开、iOS、长后台及断网/ACK 丢失仍须独立验收。当前私有 Desktop IPC 仅按本机 v11 协议验证，不能推断所有未来 Desktop 版本都兼容。

### Fast 冷恢复回归的修复与复验

23:11 JST 修复验证完成：cold resume 在原有 ownership 检查之后，从原生返回的 rollout 路径有界读取最新 `thread_settings_applied`，核对 thread/cwd/provider 与文件稳定性，再将确认的 service tier 带入恢复请求。Bridge 仅额外保存用户明确选择且已获原生确认的速度偏好；只有完整且 session_meta 匹配的原生文件证明没有设置事件时，才可补偿首次消息前设置未持久化的情况。无论 Bridge-owned 或 imported，`unknown` 都不会被当作 Standard 或不存在；遇到缺失、损坏或无法确认的证据明确拒绝冷恢复，不用旧缓存覆盖原生状态。

最初 4 MiB 尾读预算经 review 发现会被合法 5 MiB 图片的 base64 及原生重复记录挤出设置事件，现扩大为有界 32 MiB。新增代表回归包含 5 MiB 二进制图片、两个约 6.7 MiB 原生表示、末尾小回复及更早的大历史，确认总文件超过预算仍可恢复较新的设置；公共 8 MiB WebSocket 帧限制未改。

- 最后逐文件串行验证：`resume-settings.test.ts` 10、`service.test.ts` 77，共 87 项及 runtime TypeScript 通过。覆盖组合操作、空草稿重建、Bridge 重启、有/无原生设置事件、外部最新 Standard 胜过旧 Fast 偏好，以及 owned/imported 的 unknown 拒绝。
- 两个已安装版本分别通过真实模型组合探针：保持 Fast 开启，依次切 read-only / full-access、完成第一轮、重命名、归档/恢复、完成第二轮、Bridge 重启、完成第三轮；所有恢复后的 Fast 仍为开启，原生 ID 一致，每轮 clientId 精确回显。随后仅对该 QA 线程用另一个原生 App Server 显式切换 Standard 并等待原生确认，Bridge 再次冷恢复尊重这个较新选择，没有用旧 Fast 偏好覆盖。
- 私有证据：`codex-native/probe-speed-cli.log`、`probe-speed-desktop.log` 与 `probe-speed-retention.ts`。两组测试线程已归档，测试子进程均退出，用户原有会话未改变。此结果修复并关闭原生/runtime 层的复现，手机仍须在候选 Bridge 重建并重启后复验，不能把旧运行包视为已自动获得修复。

### CLI-only 直接续聊与断网原生核验

23:46 JST 补齐独立路径：Bridge 重启后、Desktop broker 不可达时，直接 Send 不再依赖先打开模型面板。连接预检只有明确未分发的 broker 错误才能进入既有的原生原子 writer-lock 恢复；scope/版本/终态/速度证据仍全部验证，失败发生在持久化本次 receipt 之前。`service.test.ts` 最后 84 项通过，新增直接续聊及 unknown broker、unknown version、imported、active turn、writer busy、unknown settings 六类拒绝回归；runtime TypeScript 通过。

两个实际安装版本均通过独立 QA 探针：首轮确认 Fast 并完成真实回复，停止本探针 Bridge，重新创建后不调用 health、models.list 或 history，立即发第二轮；两轮均真实完成、同原生 ID、每轮恰好一个精确 clientId 回显、总计两个用户输入，Fast 保持开启。两组 QA 线程随后归档，进程退出。没有关闭用户 Desktop；仅注入不存在的 broker 路径。私有证据为 `codex-native/probe-direct-send.mts` 与 `probe-direct-{cli,desktop}.log`。

手机发送期间断网的本轮 QA 原生只读核验：最新输入的 `UserMessage.client_id` 精确对应 Bridge receipt，原生恰好一个该输入；同一 turn 只有一次成功 CommandExecution（exit 0）、一个最终回复及一次 task_complete。隔离项目结果文件只有一行预期标记；Bridge 与最新原生设置的 service tier 均为 priority。仅核对指定 QA 线程与文件，不启动 App Server；脱敏结果保存在私有 `private/phone-send-disconnect-native.json`。此单次证据不代表其他网络故障的重复率或全面恢复结论。桌面 GUI 工具仍拒绝控制 Codex 应用，未绕过限制，实际桌面窗口互通与长历史操作仍需人工验收。

### Bridge 重启的 owner 租约限制

Codex QA Bridge 重启后的 `HTTP_409 → close 1006 → attempt=0 / delayMs=2000 → ready` 对应现有 Relay owner 保护：每个新 Bridge 进程使用新的 owner instance ID；旧 owner 断开时 Relay 仍刷新并保留 20 秒租约，因此新 owner 最多等待这段剩余保护时间，再按 2 秒间隔尝试。20 秒是租约时长，不是含进程启动、网络与握手的总恢复上界；本地锁释放也不等于云端租约释放。升级请求被 HTTP 409 拒绝后出现 1006 是同一次握手失败的表现，attempt=0 表示租约等待不累加网络退避。该流程与手机切后台再返回不同，不计入前述恢复速度表；本轮不为提速取消或绕过独占保护。下次定位精确耗时需对齐云端旧 owner 的 `ws_disconnected`、`gateway_owner_locked` 与新 owner ready 时间；现有本地 Relay 文本行没有时间戳，不能据重试行数给精确延迟。

### 9 月 29 日：原生 Plan preset 确认修复

为真实手机 Ask User Question 验收切换隔离 QA 对话时，原生在 UTC 15:46:15.821 已应用 Plan，但 Bridge 十秒后返回未确认。只读原生记录证明仅 collaboration mode 及对应内置 developer instructions 改变，Fast 与其他设置保留。官方 `turn_processor.rs` 在 0.153.3 的 383 行、0.158.0-alpha.2.1 的 403 行定义 null 指令自动填充 preset；旧完整字面比较未识别这一语义。未重放这个未知写请求。

修复仅允许本次原生确认中的 default/plan null 指令归一化，模式、模型、推理及其他字段仍完整匹配，显式指令仍精确比较。缓存免写判断使用严格指令比较，防止同 mode 的 custom→null 恢复 preset 被跳过；写失败时保留期间收到的最新真实设置供 readback 与 Desktop follower 使用，不宣称写成功。private helper 新增固定阶段日志及只读 status，恢复 Default 时请求原生 Default preset，避免携带 Plan 指令。

本轮串行通过 `settings.test.ts` 6 项、`service.test.ts` 89 项及 runtime typecheck。两套已安装原生程序均在独立 QA 线程完成 Plan→Default、显式自定义指令→同 mode 恢复 preset，原生通知确认且 Fast、权限、模型和推理全部保持；没有发送模型 prompt。Desktop 探针首次用了已不存在的旧安装路径，改为安装解析器对应的当前 ChatGPT bundle 路径后通过；不计为产品自动回退证明。脱敏日志在私有 `codex-native/probe-mode-{cli,desktop}.log`，本机原有会话没有操作。实际手机问题卡片仍由后续设备验收确认。

### Pi 重复配对保护的窄回归

已认证的运行中 Pi 再次配对只刷新原 Registry access code 并输出 QR，不停止/重注册/生成第二 owner，也不写运行中的配置或 invitation。六位码无法热更新时明确提示扫码；来源不明、显式 scope 不一致和不确定认证拒绝替换。旧 `piControl` 的认证前 control 成功回包漏洞同时收紧为请求阶段匹配。CLI `pi.test.ts` 33 项、`pi-lifecycle.test.ts` 7 项及 CLI TypeScript 通过；第一次配对和明确离线无锁时保持原路径。真实运行实例重复刷新后旧手机仍可发消息，须由下一次候选 bundle 的手机验收验证，尚不把单测当作完成实机验证。

## 安卓实连与 UI 回归（本轮隔离开发包）

设备为 Samsung SM-A566B / Android 16，独立 Debug 包 `com.p697.clawket.connectionqa`，通过五套隔离 Preview Relay 连接本机真实后端。原有客户端、生产配对及电脑网络节点未改。以下是手机实际点击与模型执行结果，不是 mock：

| 后端 | 已完成的真实路径 | 私有截图编号 |
| --- | --- | --- |
| Codex | 原生项目发现、选 QA 项目新建、模型/思考/Fast/权限选择、只读拒绝写入、明确完整访问后创建并读回 QA 文件、改名、复制原生 ID、归档恢复并打开同一历史 | 026–065 |
| Claude Code | 原生项目/历史发现、选 QA 项目新建、真实模型目录、选择 Haiku 4.5、Read 工具读取 QA 文件、真实回复、重新打开后历史保留 | 072–083、115 |
| Pi | 从相册识别隔离 Preview QR、实际 Qwen 3.5 Plus 回复、前后台恢复 | 086–092 |
| OpenClaw | 隔离 Preview QR、原有 4 个 Agent 和会话列表、Lucy 新建独立测试会话、真实回复 | 095–101 |
| Hermes | 隔离 Preview QR、连接已有本机 Hermes API 的独立 Clawket Bridge、真实 DeepSeek 回复 | 107–112 |

上述消息明确禁止外部发信/部署，仅在隔离 QA 项目或新建测试聊天执行；未向用户工作中的会话发送测试。开发环境手机 Pro 通过私有 Metro 配置启用，真实付费/商店收据未在本轮回归。Pi 短码在当前产品中固定查询正式 Registry，故私有 Preview 短码无法查询；改用带 Registry URL 的既有 QR 路径完成测试，并未改正式路由。

真机发现并修复：roster cache 丢弃 native sessionId/archived/archive capability，导致复制 ID/归档菜单缺失；模型胶囊优先实际 ID 而不显示已存在的短名称，改为普通模型 name 优先，default 仍展示具体型号；前后台新历史刷新被渲染清理取消，见传输专项。Codex Fast 跨归档冷恢复丢失已修复，重建/重启 QA Bridge 后再次执行手机归档、恢复、打开模型面板，`133` 确认仍为“快速”和“完全访问”；随后真实任务原生设置仍为 `priority`。`123/133/135/136` 已独立目视复核，无新增阻断性布局问题。

截图均在私有 `connection-upgrade-20260928` 证据目录，包含测试配对/用户原生历史的截图不会放进公开仓库。导航误点和 HMR 重载均不计为性能样本；OpenClaw 激活后加号先显示“添加连接 / 新建 Agent”面板，早期自动化未处理这一差异，仅误打开了已有页面，未执行其中的写操作。

### UI 新增回归的定向验证

手机采样暂停、Metro 退出后，三个 Jest 文件分别以 `--runInBand` 串行通过：`useChatModelPicker.test.ts` 41 项、`useChatController.contract.test.ts` 56 项、`roster-cache.test.ts` 27 项，共 124 项。覆盖普通模型优先显示目录短名称、default 保留实际型号、目录未就绪时保留原生 ID，以及原生 thinking 为空时清理旧值且不回退到历史设置；同时验证实时与冷启动缓存均保留原生会话 ID 和归档/还原动作。未运行全套测试，本窗口未运行 TypeScript；现有 react-test-renderer 弃用提示不影响结果。

### 图片、长后台草稿及心跳补丁候选

- 安卓实际从系统相册选择本轮公开测试图标（10.5 KiB），上传并得到正确图像描述；`155-codex-image-reply.png` 已目视确认。此为真实手机附件路径，不能替代前述 5 MiB Desktop IPC 专项。
- Codex 在系统设置 App 停留约 321 秒，返回后 `141/143` 的未发送草稿与旧消息滚动位置保持一致，没有强行吸底。该窗口出现三后端 owner 心跳超时，故仅草稿/滚动及恢复功能通过，稳定性仍未通过。
- 新心跳候选定向验证：Relay/shared 111 项、两工作区 TypeScript，v1 回放 5 文件 / 41 项通过；Bridge helper 10、OpenClaw/Hermes fallback 12、native capacity/heartbeat 24、Hermes relay 27、OpenClaw runtime 66，共 139 项、runtime TypeScript、本地 CLI bundle 与文档检查通过。独立复核发现的客户端保留控制帧绕过节流风险已修正；仍保留配对票据过期与原限流。
- v1 新增真实 echo 用例曾让整文件注册数超过原每小时 10 次上限，正确返回 429；随后仅复用已有测试 room 验证大帧限制，未放宽生产限制，完整 41 项通过。当前正在更新隔离 Preview；应用回声实际故障注入和更新后的长后台窗口尚未完成。

### 9 月 29 日凌晨：真实故障注入与继续修复

五套 Preview 心跳 Relay 已更新，各次部署前 41 项 v1 回放全部通过；仍未改 Production。本轮专用 Bridge 重启到候选，用户既有 Gateway、Hermes API、生产 Bridge 与电脑网络节点保持不变。

- **Pi 重复配对实测通过**：新候选在已有 owner 运行时执行 `pair`，配置 SHA-256 与监听 PID 均保持，输出新 QR；原手机无需重新配对，真实回复 `PI_REPEAT_PAIR_STILL_OK`。证据 `157–159`、私有 `pi-repeat-pair-result.json`。
- **心跳第一组并非全绿**：仅在自己的 Pi QA 进程抑制协议 pong，真实 Preview 首次应用回声 451 ms 确认，同 socket 保持；第二次应用回声也未返回，5,003 ms 后回收。同期未注入的 OpenClaw / Hermes 也超时，手机真实 health RPC 失败先于 Pi owner 回收；不能把第二次当作健康链路或判定兜底全部通过。4 条 Pi 消息保留、无重复或不确定输入。代理日志没有足以归责节点的证据，未改节点。
- **心跳双确认皆失效实测通过**：另一独立窗口确实收到了应用 pong，并在私有进程按计划抑制；fallback 5,003 ms 到期后回收，2,449 ms 后新 owner socket ready。只证明本次机制的有界退出与重建，不是所有网络的时延上界。注入结束后 Pi 恢复无 preload 的正常运行。
- **Codex RPC ACK 丢失通过**：仅在实际原生 `UserMessage.client_id` 与 Bridge receipt 已匹配后丢掉成功 `chat.send` 响应，实时事件/历史照常。手机自动显示工具完成及最终回复（`164`），未点重试。独立只读核验确认该轮精确 clientId 一次、CommandExecution 一次且 exit 0、最终回复/完成事件各一次，隔离文件标记恰好一行。证据 `private/phone-ack-loss-native.json`。这不是“全部确认信号均丢失”或任意故障下 exactly-once 的证明。
- **设置结果未知保护通过**：Fast→Standard 已由原生确认后，私有进程丢弃写回复并对同会话最多 75 秒丢弃成功读回。`168` 明确提示“确认设置后再发送”，实际 Send enabled=false，点按未发出草稿；`172` 离开再进入后仍保留草稿与保护。解除注入后点“检查设置”，`173` 读回真实 Standard、恢复发送；随后用 UI 恢复 Fast、清空未发送草稿。未改用户其他会话设置。
- **新增待关闭缺口**：`159` 发现跨设备时钟差导致用户/助手气泡分钟倒挂，源于保留手机乐观时间而助手用原生时间；正在按精确身份回显改用原生时间，保持 row key、图片几何和消息顺序。真实 Plan 设置还发现原生已应用但 Bridge 严格确认条件未命中而 10 秒误报超时，正在修复，未盲目重复写入。

为缩短真实死链路卡顿，下一候选把已协商 owner 的应用确认提前到第一次未收到协议 pong；Hermes 本来已有此时机，保持不变，旧 Relay/客户端三间隔规则不改。名义检测上界为三原生约 35 秒、OpenClaw 约 25 秒、Hermes 约 30 秒（不含调度暂停与重新连接）；这不是实测恢复百分位。新触发时机仍须窄回归、重建 QA Bridge 和真实 Preview 复验，先前 139 项门禁不覆盖这次追加修改。


## 9 月 29 日：实际提问、停止边界和聊天入口复验

- 实际 Android Codex `request_user_input`：私有 QA 会话使用原生 Plan 设置，手机收到问题卡片（183），选项带单选圆圈与整行点选区域（184/185）；选择 Green 后原生工具收到匹配问题 ID 的答案，完成 `QA_ASK_DONE Green`（186）。随后恢复 Default，Fast、模型、思考和权限保持原生确认值。没有为用户全局配置打开实验功能。私有 `phone-ask-stop-native.json` 保存精确一次输入及工具输出证据。
- Stop 必须分项报告：点击停止后回合立即中断（190），同会话下一轮 `QA_AFTER_STOP_OK` 正常完成（192）。但此前工具已经返回后台进程 session ID；`sleep 90` 在回合中断后仍执行完，并在原定时间创建 `qa-stop-marker.txt`。这不是安全取消后台命令的通过证据，也不是 UI 凭空将工具标成成功；原生最终确实报告 completed/exit 0。保留该失败与文件证据，正在核对安全可用的原生后台终止接口及用户提示，不能把 `turn/interrupt` 描述成所有副作用已取消。
- 原生停止边界已核对：安装版本对应的 [0.153.3 `turn/interrupt`](https://github.com/openai/codex/blob/rust-v0.153.3/codex-rs/app-server/src/request_processors/turn_processor.rs#L1560) 校验当前 turn 并等待 `TurnAborted`；[`interrupt` 与后台终端清理](https://github.com/openai/codex/blob/rust-v0.153.3/codex-rs/core/src/session/handlers.rs#L57) 是两个操作。[后台终端 API](https://github.com/openai/codex/blob/rust-v0.153.3/codex-rs/app-server/src/request_processors/thread_processor.rs#L2362) 的 `clean` 作用于整条线程，`terminate` 仅接受 `threadId + processId`，没有原子校验 `expectedTurnId/itemId`；也未建立外部 Desktop owner 的已验证调用路径。本轮保持官方回合中断，不追加整线程清理、第二 writer 或 OS 进程终止；Codex UI 必须说明“回复已停止，已经启动的命令可能继续运行”。当前参考主干 [`process_manager.rs:596`](https://github.com/openai/codex/blob/44fe510ce3ee61c8ef623adcbf89b901c73ddd61/codex-rs/core/src/unified_exec/process_manager.rs#L596) 还明确保留进程以免回合中断终止后台任务，这是补充源码证据，不冒充已安装版本逐行验证。`phone-ask-stop-native.json` 及隔离 QA 项目的 `qa-stop-marker.txt` 保留失败事实；“回合中断通过”和“后台命令取消未实现”分开验收，准确文案的回归与真机复验另记。
- Pi 时间戳：193 手机历史中，同一条精确原生回显的用户消息与回复均显示 23:26；此前 159 的 23:27→23:26 倒置已消失。只修正有精确身份依据的时间，不凭文字匹配覆盖 OpenClaw/Hermes 的本地消息。
- 会话入口：确认已 ready 的同连接、同 adapter、live roster 中同 Agent 的有效上次会话，可直接进入聊天，整份目录在后台刷新；冷切换/缓存目录/缺失或已归档目标仍走原安全流程。独立 review 补齐 fallback 的归档排除。`ConversationEntry.test.tsx` 16/16、Mobile tsc、文档检查（7 对指令文件 + 5 项 checker）串行通过。已运行实际手机进入路径；独立耗时量化仍待记录。
- 私有 Plan 验收 helper 曾因冷恢复快照缺失 personality，后续完整通知补回原生 pragmatic 而报“其他设置变化”。只读对照持久原生记录排除了实际权限/模型/Fast 变更；没有重放不确定写操作，也未把该 helper 失败隐藏为首次成功。
- Codex 停止文案已在真实手机复验（201）：明确显示“已停止回复；正在运行的命令可能继续执行。”该轮只验证回复停止与准确提示，不能覆盖前述后台命令取消缺口；其他后端仍使用原有停止文案。对应事件 hook 11 项、Mobile TypeScript、19 语言 1472 keys 严格检查及文档检查通过。
- 最新真实续聊截图：Pi 断网恢复后 `PI_FINAL_NETWORK_OK`（204），OpenClaw 恢复后 `OPENCLAW_FINAL_NETWORK_OK`（209），Claude Code 从系统设置返回后 `CLAUDE_FINAL_FOREGROUND_OK`（212），Hermes 同样返回后 `HERMES_FINAL_FOREGROUND_OK`（215）。均通过真实 UI 发送并收到真实模型回复；212、215 已目视复核。OpenClaw 最新一轮进入原 main 会话，仅发送无工具测试消息，不应写成隔离 QA session。这些成功不覆盖该轮较慢恢复或另一次五 owner 断连。


## 独立心跳截止与空输入框的最终候选复验

- 五个 Agent 的协商 owner 保持原心跳频率，协议 ping 独立最多等待 5 秒，再发最多 5 秒的精确随机 nonce 应用确认；只有同 socket 已证实往返且发生 1006，才允许一次 0–250 ms 抖动首试。旧 Relay、owner lease、当前 socket 隔离和不重放写请求仍保留；Local Model 没有加入此次五 Agent 的节奏调整。7 个 Bridge 窄文件 191 项、runtime TypeScript 与文档检查通过，两次独立只读 review 未发现阻断。
- Relay 构造阶段新增仅慢初始化（≥1 秒）或失败才记录的固定阶段耗时，不改变串行认证读取、hibernation 恢复和 heartbeat 的等待顺序。9 项初始化及 6 项遥测回归、Relay TypeScript 通过。五套 Preview 每次通过 41 项 v1 replay 后更新；记录见私有 `slow-init-preview-deployments.json`。候选 CLI bundle SHA-256 为 `d1429f96fa01d09407f091dabfdcddb0e5b0619ce99a55af455be79c42de3871`，仅用于本轮自有 QA runtime。
- **Pi 真实新截止实验通过**：先允许正常 pong 获得健康证据，再抑制协议 pong。两次协议 ping→应用 ping 均 5002 ms，真实回声 RTT 163 / 116 ms，同一连接持续存在。随后同时抑制两种确认：协议截止 5002 ms、应用截止 5001 ms，1006→重连尝试 156 ms（计划 jitter 153 ms）、尝试→open 749 ms、close→ready 905 ms；同 owner 身份不变，自动恢复没有 409，后继 socket 两次正常 pong。手动注入启动/结束的租约等待单列，不混入自动恢复耗时；已恢复无 preload 的普通 Pi，手机新消息另验。证据 `private/pi-independent-deadline-evidence.json`。该数字不含故障发生到下次 ping 的等待，不是 P95 或网络无关保证。
- **安卓输入框复验通过**：112 字符长草稿的实际 native height 为 136.18 dp，发送后空稿恢复 40.18 dp，真实 Claude 回复完成后仍为 40.18 dp；截图 232–234 与 `private/composer-final-{long,cleared,replied}.json`。模型目录已有时，回复后的 Haiku 4.5 保留 Claude 图标。另在冷进入发现目录响应被较新的 metadata 版本一起丢弃（229 显示 haiku）；这项仍待最小修复和复验，不将主动打开选择器后的正常显示当作冷进入通过。
- 上述更新不改变官方 App 的 `.env.local`、app.json、Gradle 配置；四文件哈希与本轮前基线一致。没有提交、版本变更、分发包、Production 部署或公开发布。

## 独立验收审查：外部原生会话管理的一致性

只读审查发现此前管理测试没有覆盖的缺口：Codex 会话进入 Bridge 索引后，目录按本地记录的 title/archived 输出并去重原生同 ID。用户在 Desktop 或其他原生客户端重命名、归档、恢复时，手机可能持续显示旧标题或错误列表；不能把此前手机内发起管理操作的成功当成这一路径通过。

候选已补最小收敛：只有原生 active/archived catalog 正向返回同 threadId 与 cwd 时，才同步非空 name 和该列表明确的 archive 状态；缺失、null/空名称不推断删除、不抹本地 label、不采用首条提示词充当新名称。管理在途、较新管理结果及 reset/delete 的旧目录行有独立 metadata revision 隔离，保持运行、原生 ID、receipt 和有效设置。普通 active 刷新发现已物化、有 activity、当前无运行的索引记录缺失时，额外核对对应项目的 archived catalog；全部候选项目合计最多 2 页×100 条，只有正向匹配才变更。负结果/未知缓存 30 秒，按候选身份与管理 revision 失效；同组候选的后续刷新轮换 cursor，避免旧归档永远饿死。预算耗尽/失败保持未知；没有无条件双扫描或历史读取。

验证：`codex/service.test.ts` 112/112、Bridge runtime TypeScript、文档检查（7 对指令文件、5 项 checker）、diff 检查通过。覆盖普通 active 刷新即收敛外部 archive、多项目共享预算、预算耗尽/轮换、失败页、负缓存及其失效、迟到管理竞争、null name、运行/receipt/设置保持。

真实原生验证：安装的 CLI 0.153.3 与 Desktop 内置 0.158.0-alpha.2.1 各创建一个独立 QA 线程，各仅一条精确 clientId 用户输入。释放自有 writer 后，由另一官方 App Server 执行仅该 QA ID 的 rename/archive/unarchive；普通 active list 首次归档核对与恢复均收敛，Archived 保留相同 ID，receipt/活动时间/模型设置完全保持，没有重发或额外原生 turn。两条 QA 线程已归档，所有探针进程已退出。私有证据位于 `codex-native/metadata-{cli,desktop}-*/evidence.json` 与 `probe-native-metadata-{cli,desktop}.log`。这是官方原生 API 互操作验证，不替代受工具限制尚未完成的 Codex Desktop GUI 人工验收。

## 冷进入权限首读与 19:00 原生终态核对

安卓 246 冷进入显示灰盾／“电脑上的设置”，未改权限的后续原生读回在 250 显示橙色 Full access。灰盾涵盖未知或自定义状态，不能把它写成已确认 workspace 或永久丢失 Full access。该原 QA 会话的 18:59:42 原生设置仍为 `never`、disabled permission profile、priority，且没有设置被上述两条独立 metadata 探针修改。

静态定位到首读竞争：会话 metadata 的 model/provider 更新会使旧的整份 model selection 回复被丢弃，连同它仍有效的 permissions/Fast。候选已把运行设置读回与 model metadata 分代，保留同 scope 的权限/速度，较新读和显式写仍能阻断旧结果；`useChatModelPicker.test.ts` 52/52 已通过，含新增 5 项针对性回归。首轮旧用例仍断言 metadata 后 Fast 必须丢弃，已按本轮正确语义更新，model/effort 的旧结果隔离保持。

独立 CLI-only 原生探针在 CLI 0.153.3 与 Desktop 内置 0.158.0-alpha.2.1 均复现另一真实缺口：同一独立 QA ID 显式 Read-only／Workspace 后，停自有 App Server 冷恢复变成全局 `dangerFullAccess` + `on-request`（custom）；Full 恰巧因本机全局 Full 而保持。两条探针均只有一条初始用户输入，结束已归档，未修改原手机 QA 会话。原始证据 `codex-native/cold-permissions-{cli,desktop}-*/evidence.json`，不能用灰盾截图替代此真实原生复现。

修复采用原生命名 profile 写入、最新原生匿名标准 profile 的有界恢复与 effective 核验。原生恢复前落盘 confirmation intent，正常精确确认可清本次新 intent；原已不确定的 marker 跨 Bridge/native 重启保持，仅显式权限确认可清。未知匿名策略不得落回全局 Full；已命名的自定义 profile 按原生当前定义解析，managed 拒绝不降级。`requiresConfirmation` 为可选兼容字段，由手机用于权限重选与 Send 阻断。定向门禁：resume-settings 19、settings 7、service 122（共148）与 runtime TypeScript 均通过；含丢失/不完整回复、跨重启、Desktop 发送路径、未知版本匿名策略、较新版本命名策略与显式修复。

修复后的两版本真实反向探针均通过：只为探针进程用 `-c` 设置全局 Read-only，不修改用户配置；同一 QA native ID 的 named Full／Read-only／Workspace 冷恢复与实际续聊保持正确，再验证旧匿名三模式的冷恢复。只读模式下精确 QA marker 的原生 exec 写尝试一次，文件不存在；Workspace 仅在私有 QA 项目写入验证内容。两条修复验证会话已归档，进程已退出。CLI 共6条、embedded共4条独立输入；CLI首轮证据断言漏掉原生 `custom_tool_call(exec)`，修正为精确原生调用计数后沿同 QA ID 继续验证，没有重放输入，失败日志保留。脱敏证据 `codex-native/verified-permissions-{cli,desktop}-*/evidence.json`。这些是原生 API/本地模型探针；手机最终权限重选 UI 验收仍需候选 App 验证。

19:00 窗口 sleep 工具完成于 19:00:16.624Z，原生 assistant final 到 19:03:10.844Z 才落盘，`task_complete` 为 19:03:10.925Z；手机随后收到最终标记。等待期间原生仍未终态，不能认定 Bridge 丢失已完成的结果；工具后的上游等待原因未归因。脱敏时间证据 `private/codex-1900-native-completion.json`。


## 安卓静默运行内容保持与 iOS 首轮实际验收

19:00 UTC 窗口中，安卓只发一次无文件修改的 sleep 30，最终收到 CODEX_RECOVERY_WINDOW_OK。原生工具完成于 19:00:16.624，原生 final 19:03:10.844 / task_complete 19:03:10.925；工具后约 174 秒尚无原生终态，不是 Bridge 丢了已完成的回复。数据和截图 252–255 保存在私有目录。

独立 App 缺陷：无事件 22 秒后，armPendingRunTimeout 清掉当前 run、流式文字和工具，31 行变成 28 行，约 27 秒后新历史恢复。已改为保留显示与运行身份，只请求已有合并只读恢复；挂起、失败、缺少明确活动状态都不能作为完成证据。异步响应还按 adapter、会话、run 和生命周期代际隔离，卸载后不得重建定时器。104 项单文件回归通过，覆盖五后端各 pending / failed / unknown、无重复 prompt、终态正常结束和卸载迟到响应。实际选择性业务帧丢失复验仍待候选启动，不把单测当作真机通过。

iOS 旧 Debug 原生壳加载本轮 QA JS，通过正常相册 QR 配对、项目选择、新建独立会话、真实回复和设置展示（ios-009、012、013）。私有 Metro wrapper 同时覆盖两平台测试配置，官方 Pro 和发布配置未改。设置更改、菜单、粘贴和恢复尚待后续实测。

## 大帧与 owner 心跳的有界保护（Bridge 门禁通过，待实网验收）

共享 Relay 的短心跳可能排在单个合法大帧之后；手机单独延长等待并不能保护 Bridge owner。候选实现通过 `relay.transfer-hint.v1` 协商，在本地发送或 Relay 的发送前提示表明 128 KiB–8 MiB 帧时，提供同 socket 的绝对 90 秒传输窗口。重复帧不续期，只有最新传输代之后发送且精确匹配的协议 pong／应用 echo 能提前解除；普通消息及发送回调不算健康证据。五种 Agent owner 与 OpenClaw secondary 共用规则，旧 Relay 和 8 MiB 公共帧限额保持。窗口到期后仍须独立健康证明才能再次使用，不能以连续大帧永久隐藏黑洞。

该保护仅属于公网 Relay leg，不延长本机 Codex App Server stdio／Desktop IPC 的既有独立请求期限，不重放未知写操作。Bridge 本轮串行验证 `relay-transfer-lease.test.ts` 12、`relay-owner-pong.test.ts` 27、`relay-transfer-runtime.test.ts` 21、`relay-owner-pong-runtime.test.ts` 20、`relay-request-capacity.test.ts` 48，共 128 项首次通过；覆盖五 owner 上下行、OpenClaw secondary、旧 Relay、失败发送不授予窗口、晚到／旧代 nonce、原截止前旧 echo 的 1 秒限流重试及到期不续。runtime 类型检查、runtime dist 与开发 CLI bundle 构建通过。当前尚未宣称限速大帧或新候选真机验收通过。

### 02:00 UTC 自然窗口与完整帧后的保护收口

2026-09-29 01:47:05.787–02:07:06.603 UTC 被动捕获再次记录自然故障：401 次独立 HTTPS health 中 400 次成功，OpenClaw 1 次 TLS `ssl_syscall`；Claude Code、Hermes、OpenClaw 应用回声约 5 秒超时后重连，Codex 则记录 `waitMs=74597`。手机静置 400 个样本／0 次 CDP 不可用，约每 30 秒维护读取出现大帧绝对预算；故障时该预算仍未耗尽且手机显示 ready。此时观察器旧 `transferGraceMs` 实际读取绝对 budget，不能由该字段单独认定队头阻塞宽限仍生效；宽限延长的证据还包括 Bridge 的实际等待日志及对应实现。检测后 1.717 秒重新认证、3.390 秒新历史成功不能代表完整不可用时长。手机与 Mac 时钟分开校准，Bridge 日志为 500 ms 轮询的观察到达时间。私有 `stability-plane-1790646425787.summary.json`、`phone-codex-natural-0200.summary.json` 固化原始 SHA 与限制。

该样本暴露了传输状态缺口：完整收到提示的大帧后，原实现仍把未消耗的 90 秒窗口当作正在传输，直到下一周期的独立探针才能解除。候选收口区分待完整入站帧与未确认出站帧；精确完整入站交付只撤去该方向的队头阻塞保护，不改变 generation、不解锁绝对预算、不标健康，也不影响并行上传。已入队出站帧／已完成入站帧之后，立即合并一次每秒至多一次的新 nonce 探针；只有最新代精确回声解锁预算。慢传输、双时钟到期锁、旧 Relay、五 owner 与 OpenClaw secondary 保留。没有增加 wire capability 或 Relay 变更。

本次 Bridge 五文件逐个串行首次通过：lease 16、owner-pong 36、transfer-runtime 26、owner-runtime 20、capacity 48，共 146 项；runtime 类型检查与开发 CLI 构建通过。对应 Mobile 与真实新候选复验另记；上述本地门禁不证明周期故障已经根治。

**02:30 UTC 新候选实际复验仍未通过稳定性验收。**本地五 QA runtime 于 02:26 主动换为开发 bundle `1f253ccab1fd7cce2dea0f75142a1b27fdbb68f36f03478f043ccac135409c1e`，该主动切换单独记录。02:28 起的被动日志随后再次捕获自然失联：Codex 应用探针从观察到的 02:29:53.320 开始，直到 02:31:23.607 才记录 `waitMs=90000` 并回收 socket，02:31:24.108 观察到新 owner ready；其余四 owner 在约 5 秒应用回声超时后重建。出站大帧尚无独立收件证据时，90 秒保护仍可能延迟恢复；完整入站收口不能单独解决这一情况。故障真实开始时刻未知，500 ms 日志到达采样也不是精确原生事件时间。

手机连续样本 `idle-1790649133223.jsonl` 实际从 **02:32:13.223 UTC** 开始，不能冒充覆盖 02:30 的完整现场；其保留诊断显示此前 launch 到首次 ready 为 1.489 秒，之后 heartbeat failure 至重新握手 **80.310 秒**，包含三次握手超时。后续 300 秒连续观察共 400 样本、0 次 CDP 不可用，仍另遇一次 heartbeat failure，至新握手 2.160 秒、成功新历史 4.080 秒。后续正常维护读取中，旧观察器绝对预算为正的两个区间分别不超过 2.100／2.030 秒；旧字段 `transferGraceMs` 当时实际读取绝对 budget，不能将其当作活跃传输宽限或据此证明完整入站保护缩短。新观察器已分开 `transferGraceMs` 与 `transferWindowBudgetMs`，旧原始采样保持不改写；也不能以 397 个 ready 样本证明全程后端健康。当前显示 31 行、12 个精确回显、0 uncertain／重复；初始入页前未载入历史不计作丢失，未逐页验证全量历史。私有 `phone-codex-natural-0230.summary.json` 保留 SHA、跨钟校准与两段证据边界。

实际只读尺寸测量 `codex-catalog-size-1790649471172.json` 确认 `agents.list` 为 1 项／111 UTF-8 字节，`sessions.list` 为 971 项／589,487 字节（仅 descriptor JSON，不含 RPC 信封），分别耗时 398／602 ms。此前 02:29 的异步 harness 只返回 Promise 内部对象，没有有效尺寸，已排除。正常大目录的全量维护响应已是具体优化对象；候选增量目录方案仍在设计，不得宣称已解决首次大快照或所有慢传输恢复。

本轮被动捕获最终在 02:48:03.031 UTC 自然结束：20 分钟、400 次独立 HTTPS 中 398 次成功，Pi／OpenClaw 各一次 TLS `ssl_syscall`，没有观察器调度延迟记录；五 owner 各一次应用回声超时，重建后未见第二次超时。Codex 76 次探针开始包含完整帧后主动确认，不能计为 76 次故障；其余未确认记录也可能被新帧退役，只有明确 timeout／close 才列为故障。`stability-plane-1790648882951.summary.json` 固化完整原始 SHA 与条件 Cloud–Mac 钟差。

随后收口另一处确定风险：发送端每秒一次不保证网络抖动后的到达间隔仍为一秒。Relay nonce admission 改为附件持久的四次小突发、每秒一次持续补充；不改变认证、旧 ACK 到期、路由或端侧 deadline。整数额度先持久消费再回复，旧时间戳保守迁移、休眠不补满、时钟回退不增额，发送失败不退款。`heartbeat-budget` 23、owner heartbeat 41、client heartbeat 34 共 98 项窄回归通过；Relay 类型检查初次仅新测试变量缺显式类型，补齐后通过，docs／diff 检查及 v1 五文件 41 项通过。首套 Preview wrapper 再次通过 41 项后因 Wrangler 登录过期在账户预检阶段退出，**当时尚未部署该修复**；不能以本地通过冒充云端已更新。

Wrangler 官方 OAuth 随后完成刷新并重新确认 Clawket 账号。03:07–03:09 UTC 顺序部署五套隔离 Preview，每套 wrapper 均先通过 41 项 v1 门禁；最终云端读回五个候选版本均为 100% 当前版本，invocation logs／traces 关闭、query-string redaction 开启。未修改 Production，部署窗口明确排除自然故障样本。`nonce-bucket-preview-retry-deployments.json` 保存各套源文件 SHA、版本和开始／结束时间，`nonce-bucket-preview-final-readback.json` 保存独立云端回读；首次认证失败记录另行保留。该段只确认 Preview 部署及配置，新的大目录与自然窗口设备验收仍待后续记录。

### Relay 大帧保护与 20:04 UTC Preview 候选

Relay 只向显式协商且仍为当前 full-auth owner、client 或 OpenClaw secondary 的 socket，在真实大帧前同步发送 UTF-8 字节数提示；提示和原帧之间没有 await，原帧内容保持。所有 peer 伪造的传输提示在普通路由前截断。旧客户端的 ready/control 形状和截止保持不变。新 transfer peer 的服务端兜底 ACK 清扫及 Hermes owner watchdog 使用 `max(原配置截止, 3×心跳间隔+90秒)`，alarm 使用同一截止，保留更长自定义配置；新 full-client 握手／awaiting 清扫地板为 `max(原TTL,90秒)`。20 秒 owner admission lease、connect-start 缓冲和 pending challenge TTL 未扩大。客户端／Bridge 的独立证明式探活仍更快，提示本身不代表健康。

最终窄回归 `relay/transfer.test.ts` 23、`index.test.ts` 108，全数通过，Relay TypeScript、指令检查和 diff 检查通过。较早同轮已验证 shared capabilities 15、hibernation 20、pending request 10；新实际 fetch 用例覆盖五后端广告、受限 pairing 不提升、两向真实大帧和 OpenClaw secondary。五套 Preview 均经各自 41 项 v1 replay 后部署；回放保留冻结旧 fixture，并验证旧 peer 形状与新协商大帧字节完全一致。Codex 首次控制面上传在回放通过后 `fetch failed`，无新版本；重试成功，失败日志保留。

最终版本：OpenClaw `bec03402-739b-4114-a513-9966c99ef9a2`、Hermes `e0005946-211c-4b0f-ba2d-09c57c8d270c`、Pi `51648029-b52a-4065-a404-a25e83a641a1`、Codex `d2d0a670-d646-4b0c-a8d2-372b069dc878`、Claude Code `a4285b28-dd09-4797-863c-bb76eda790cf`。末次部署完成于 20:04:25.080 UTC；源码 SHA、各次部署和失败记录保存在私有 `transfer-final-preview-manifest.json`。这些是 Preview 更新与本地门禁，不是 Production 发布或新候选真机验收结论。

本轮另发现真实 **Preview 日志配置缺口**：OpenClaw/Hermes ignored 配置仅启用 observability，没有显式关闭 invocation 或开启 query redaction；20:03:02.209 UTC 云端读回确认 invocation=true、redaction=false、trace=false。立即以两个 Preview 专属 settings PATCH 收口（20:03:25.024 UTC 两个 API 成功），镜像本地配置并重新部署。20:04:36.362 UTC 对五套云端逐一读回确认 invocation=false、redaction=true、trace=false，仅脱敏应用日志保留。历史启用起点和日志内容未调查，不能声称没有敏感数据暴露；没有读取原始调用日志、修改 Production 或擅自轮换凭据。固定元数据证据为私有 `transfer-preview-observability-{correction,final}.json`。

同类缺省也存在于受版本控制的 OpenClaw/Hermes Preview 示例；已补齐同样三项设置，保持部署目标和资源隔离不变，避免复制模板后再次启用。Local Model Preview 示例仍有相同配置缺口，属于本轮五 Agent 范围之外的待处理项，未部署或改动该服务。

系统睡眠／时钟回拨补丁后的最终门禁：现成 `scripts/relay/run-wrangler.test.mjs` 15 项、指令检查 7 对／5 项、diff 检查通过；20:19:41.680–20:19:56.152 UTC 最后一次 v1 5 文件／41 项全部通过，未再次部署。开发 CLI bundle SHA-256 前后均为 `83259467cf40346e6736906777b61b21dd3281ec515fabc475764fdfe1b549bf`，证据私有 `final-transfer-compat.json`。新候选真机黑洞／大帧验证单列，不以这些门禁代替。

### 20:30 UTC 新候选自然停滞复验

20:14:43–20:34:43 的只读 owner/HTTPS 采样覆盖五个最终候选；20:20 的主动整进程重启及其租约重试按每个 backend 的首个 ready 分界排除。20:30 五 owner 仍各发生一次应用确认超时后恢复。OpenClaw、Hermes 有源时间戳的 relay=false→true 分别为 896／614 ms；Claude、Pi、Codex 仅有日志观察到达时间，timeout→ready 的到达差为 507／1014／503 ms，不能报成精确真实重建耗时。故障起点、下次 ping 前等待和此前协议等待不包含在这些数值内。新 HTTPS 400 次中 399 次成功；唯一 Hermes curl28 发生于 20:32:30.659–34.692，TLS 尚未完成，晚于本次恢复，不能当作 20:30 的根因。没有更改电脑节点，也没有新增外站对照。

同窗安卓 Codex 前台静置 observer 完整 400 样本、0 次 CDP 不可用：新 client heartbeat 触发 `heartbeat_timeout`，手机进入恢复；首次新握手收到 4011，随后再次握手成功；仅凭 close code 不能区分 owner 退役和其他后端不可用分支。可见非 ready 区间为 **13.992–15.845 秒**；同手机时钟的心跳失败诊断→新认证握手 **14.903 秒**、→新历史加载成功 **15.995 秒**，故不能说总恢复只有一秒。31 行及 11 用户／15 助手／5 工具全程保持，11 个精确回显不变，0 uncertain／重复精确回显／发送错误。样本内没有新发送，不据此证明下一轮执行。

利用 observer elapsed 与 CDP RTT，条件估计 Phone−Mac 为 +9.118–9.136 秒；相对 Codex owner-ready 的日志观察到达，手机新握手约晚 1.269–1.287 秒、新历史成功约晚 2.361–2.379 秒，已未重现 19:00 的 owner-ready 后约 34 秒假 ready。此跨源估计依赖恒定时钟及近似 observer 起点，native 日志延迟未测，不能当作严格端到端时延区间。实际故障发生到诊断的等待仍未知；这是单次 Debug/CDP 自然窗口，不能证明恢复目标整体达标、P95 或竞品优势。私有 `transfer-candidate-soak-summary.json`、`phone-codex-natural-2030.summary.json` 保留原始 SHA、主动重启边界与限制。

### 最终 Android Codex 110 秒后台恢复

`long-background-1790628092762.jsonl` 完整 160 秒观察含 158 个成功样本、15 个 CDP 不可用样本。电脑操作锚点约束在系统设置停留 **110.019–110.306 秒**；15 个不可用样本全部在返回之前，不能视为 15 次网络失败。另有独立真实 `ws_error`／1006 诊断在后台初期出现，连接到返回前台后才恢复；因此也不能写成后台连接一直健康。

以返回命令完成为电脑时间锚点，出现新认证握手与新成功 health probe 的采样区间均为 **2.680–3.744 秒**，新成功历史提交为 **4.183–5.441 秒**，均与背景前基线比较，未把旧缓存当作新恢复。手机内部 foreground recovery 操作耗时 2292 ms；它不含返回命令到 AppState/恢复开始的等待，不能替代上述端到端区间。截图 277 已目视确认当前聊天图片与回复正常，观察中当前展示的 31 行、11 用户／15 助手／5 工具及 11 个精确回显保持，未见 uncertain、重复精确回显或发送错误；没有对全量分页历史逐 ID 验证。观察结束后另通过真实 UI 发送并收到 `CODEX_BACKGROUND_110_OK`（279），该新发送与静置样本分开记录。

这是 Android Debug/Metro/CDP 单次后台样本，与此前“后台不连 CDP”的测试不同，不代表 Release 或时延百分位。离线证据 `private/final-codex-long-background.summary.json` 保存原始/action SHA、CDP 区间和跨钟估计限制；通用摘要亦在原观察文件旁。此次仅离线分析和文档补录，没有新启动模型、网络探针、部署或测试。

大帧窗口另完成睡眠边界收口：Bridge 的窗口和待确认协议／应用 nonce 分别保存单调钟、墙钟截止，取先到者；每窗口首次观察到过期即锁定并换 probe generation，墙钟随后回拨也不能恢复旧窗口。最新定向回归为 lease 14、owner nonce 31、five-owner/secondary 21，共 66 项首次通过；runtime 类型检查通过。此处为时钟反证测试，不冒称已实际让 Mac 深睡完成传输实验。


## 冻结候选的安卓权限重选与单 socket 黑洞验收

本节固定开发 CLI SHA-256 `83259467cf40346e6736906777b61b21dd3281ec515fabc475764fdfe1b549bf`；最后 Bridge 双时钟相关 66 项、Mobile 最后 24 项及 v1 replay 5 文件／41 项门禁均已完成，沿用各门禁的实际覆盖，不代表全仓测试。四份本地配置 `apps/mobile/.env.local`、`app.json`、`android/app/build.gradle`、`android/gradle.properties` 均与本轮前置 SHA 基线一致，私有 `local-build-config-before.json` 与 `private/current-config-integrity.json` 记录四个 matches=true；没有为这些实验修改正式 Pro／发布配置或 Mac 网络节点。

Android 实际权限恢复界面通过：仅在隔离 QA 的 Bridge 元数据中设置未确认标记，原生 rollout 不动。截图 259–262 依次显示“检查设置”、权限页“重新选择权限后再发送”且无预选；用户方式明确选择完全访问后，guard 消失并显示 Full access 勾选。随后同会话只点击一次发送 `CODEX_FINAL_GUARD_OK`、无工具要求，手机实际取得完整回复。原生只读核验以精确 `UserMessage.client_id` 匹配 Bridge receipt，确认一个输入、一个 receipt runId、一个最终回复和一次 task_complete，工具调用为 0，持久 permissionsUnconfirmed 已清除；未依据正文／时间启发式认定幂等。脱敏证据 `private/phone-permission-guard-blackhole-native.json`。

两次注入仅丢弃指定旧手机 socket 的应用入站 40 秒，后继 socket 不受影响，期间没有修改网络节点、原生进程或重发业务；均为 Android Debug／Preview 控制实验，各 **n=1，不是 P95**，也不定位先前半小时周期故障的外部根因。

| 场景 | 观察与恢复结果 | 私有证据 |
| --- | --- | --- |
| 点 Send 后旧 socket 黑洞 | 70 秒内 84 个有效采样、0 不可用。发送前的健康探测已在途，恢复由 health_failed 触发；从注入开始到新认证握手为手机同钟 **2.911 秒**，到新的成功历史提交为 **3.869–5.377 秒**。实际最终回复可见，未手动重试；不能当成纯静置心跳发现速度。 | `private/phone-one-socket-fault-1790627112433.jsonl` 及同名 `.summary.json`；上述原生精确身份核验 |
| 纯静置旧 socket 黑洞 | 70 秒内 87 个有效采样、0 不可用，协商 client-ping 的 heartbeat_timeout 触发重连；新认证握手 **19.784 秒**，新的成功历史提交 **20.562–21.379 秒**。截图 266 仍显示刚才新增的完整用户消息与回复，采样内无 uncertain、未确认发送或重复精确回显。 | `private/phone-one-socket-fault-1790627226142.jsonl` 及同名 `.summary.json` |

上述时间使用手机 JS 时钟，history 区间由相邻采样界定；成功历史提交与仅显示缓存分别核验。`visibleMessageCount` 是当前 ThreadView 输入消息数组长度，**不是累计原生历史总量或实际渲染行总数**：Codex head 读取最多 32 个原生 item，映射会过滤非聊天条目，controller 又会叠加在途消息。因此首次 31→33→31 与第二次保持 31 不能单独作为新增消息丢失的证据；该观察器也没有输出逐条 ID 来证明是哪几条旧行退出当前页。本轮目标新消息是否存在由截图与原生精确 clientId 核验，完整跨页历史无损仍须单独验收。两轮最终恢复成功不能替代连续自然故障窗口、大帧或两平台完整验收。


同一冻结候选另完成选择性业务入站丢失：先正常发送一次 `CODEX_QUIET_RUN_OK`／sleep 60，工具可见后，仅屏蔽该旧 socket 的业务帧 40 秒，Relay control／tick 继续通过。私有 `phone-one-socket-fault-1790627732022.jsonl` 显示注入后约 43 秒内 ready、isRunning=true、35 条当前投影消息保持，没有重现“静默 22 秒即清除运行与文字／工具”的旧缺陷。其后确实有一次连接重建：connecting／handshaking 时短暂为 isRunning=false、32 条，ready 后变为 true、33 条，成功 fresh head 提交后为终态、31 条；不能记为全程零重连或消息数组恒定不变。分页计数限制同上，不据 35→31 推断最新回复缺失。

截图 269 是开始状态，270 是 40 秒屏蔽恢复后的最终回复；270 不能冒充故障期间第 22 秒截图，静默期间保持的证据来自连续 observer。独立原生只读核验确认目标 clientId 精确一次、receipt/runId 一次、CommandExecution 一次且 completed／exit 0、包含目标标记的最终回复与 task_complete 各一次；工具的轮询调用不重复计为命令执行。原生回合开始于 20:34:59.406Z，命令完成于 20:36:05.052Z，task_complete 为 20:36:07.205Z，证据 `private/phone-quiet-business-blackhole-native.json`。这是单次选择性丢帧验收，不替代自然网络故障或限速大帧实验。


图片受控发送队列验收通过（同冻结候选，Android n=1）：3,042,671 字节源 PNG 经 App 处理后，实际首个大帧为 **472,533 字节**；仅在原 socket 的发送队列中保留 6 帧／473,015 字节 **25.147 秒**，一次 flush 后继续正常发送，没有切换 successor socket。121 次观察全部 state=ready，手机截图 276 实际显示正确四种颜色与 `IMAGE_QUEUE_OK`。这验证了超过旧短 RPC 截止的受控队列延迟可以完成，**不是实际带宽限速，也不是 5 MiB 线上大帧压力通过**；源图片大小不能冒充传输字节数。

独立原生只读核验：同 QA thread 的精确 UserMessage.clientId 输入 1 次、Bridge receipt/runId 1 次，原生输入含 1 张图片，工具调用 0，含目标标记的最终回复 1 次、task_complete 1 次。原生回合 20:39:41.522Z 开始、20:39:44.249Z 完成。私有证据为 `phone-large-send-queue-1790627952209.jsonl` 与 `phone-image-queue-native.json`；后者仅保留脱敏计数和时间，不复制图片或模型正文。本次未证明任意大帧时长、真实弱网吞吐或外部周期停收问题已消失。

## 2026-09-29 01:11–01:20 UTC 其他四后端最终基本收发复验

沿用开发 CLI `83259467cf40346e6736906777b61b21dd3281ec515fabc475764fdfe1b549bf`、20:04 Preview 与正常无注入的五套自有 QA runtime。Android 逐个正常进入、只点击一次发送并目视核对实际模型最终回复：Claude Code／Haiku 4.5（285）、Pi／Qwen 3.5 Plus（290）、Hermes／deepseek-flash（296）、OpenClaw／claude-opus-5-5（302）。截图与 SHA 存于私有 `final-other-backend-replies.json`；这轮是各 n=1 的基本收发，不含完整工具回归、精确原生去重计数或时延百分位。没有修改全局模型、Mac 节点或正式配对。

Codex 此前的同候选图片回复、110 秒后台后新回复与原生精确输入核验另列。此后 iOS 发现一个原生 unauthorized 回合没有可见错误，及最新版 Desktop 的设置 IPC v2 兼容缺口，正在追加修复；不能把本节其他后端通过当成整个后续候选已冻结或全部通过。


## 2026-09-29 Desktop 设置 IPC v2、失败回合与新版图片发送验收

开发候选 CLI SHA-256 为 `2b2be6a0f70935a594a2fff19116e5986c9febdf6fdf6a82335bf17081969f2d`。本机 Desktop `26.924.22138`／build 11645 的设置请求已使用 IPC v2；补丁兼容 v2 入站，向旧端降为 v1 仅限同 socket／clientId 收到该方法明确的派发前 `request-version-mismatch`，且请求没有 v2 专有 condition／activeTurnId 字段。超时、断开、未知结果或其他方法的错误不会触发写入重试。条件设置按原生 model／effort 语义核验，未实现的 active-turn 写入明确拒绝；Desktop 发起一轮时的权限设置确认与实际发送处于同一个会话串行区，避免手机排队修改权限插入其间。该并发边界有定向反证，未扩大为整个 Desktop UI 的验收结论。

iOS 01:19:42.924 UTC 的原生回合确实以结构化 `unauthorized` 失败且没有最终助手回复，旧手机只结束运行、没有显示错误。新候选保留原生 failed 状态，live 与 history 使用同一 `codex-turn-error:<native-turn-id>` system notice；已知鉴权失败只显示固定登录检查提示，其余失败为固定通用提示，不传原始 provider 错误正文。不把 incomplete／断连推断成已失败或已完成。Bridge 同时保留旧 App 的兼容回退；新手机按固定 system 身份合并，不把失败正文当成成功助手回复。官方 CLI `login status` 本轮 exit 0、显示已登录 ChatGPT，因此不能由这一次 unauthorized 认定账号已经退出、过期或被封。错误行的 live/history 门禁通过；该实际旧失败回合在新版手机重新进入后的可见性须由设备验收另列，不能用测试代替。

设备补验已完成：`ios-error-history-localized.log` 的实际滚动查找通过，`ios-070-history-error-chinese.png` 可见上述旧失败回合的中文 system 提示，后续成功对话仍保持原文；负责人任务的 Desktop GUI 验收仍未被此项替代。

此次依次运行 `desktop-ipc.test.ts` 25、`history.test.ts` 9、`service.test.ts` 138，共 **172 项首次通过**；runtime 类型检查、开发 bundle 构建、v1 replay **5 文件／41 项**、文档 7 对／5 项与 diff 检查通过。Mobile 对应 mapper 13、controller 24、ThreadView 116，以及类型、设计、19 语言检查通过；均为窄门禁，不是全仓测试或已发布。仅普通 QA Codex runtime 由旧 PID 36919 更换为 89312，原生用户任务及其他四套服务不动；主动重启与可能的 owner 租约等待排除出自然网络恢复数据。

### 实际 IPC v2 无模型写回读

使用既有隔离 Android QA thread，经真实 Desktop broker、当前 Clawket owner 与官方 App Server 验证条件设置；没有通过受限 GUI 自动化绕过桌面窗口限制。首轮从 Fast 改 Standard 后，探针因可选 personality 字段的 snapshot 比较过严而退出：冷 resume 响应未包含该字段，首次完整原生通知补出已有值。随后只读对比原生事件确认，实际仅 service tier 从 priority 变 default，其余原生设置未变。没有把这次退出写成产品失败，也没有盲目重放未知写入。

明确恢复原 Fast 后，重新以完整有效设置为基线完成 Standard→Fast 的正式两步 v2 探针。整个过程原生设置写入共 **4 次**（default、priority、default、priority），最终与原始原生设置完整一致；正式两次请求版本均为 2，已取得原生应用确认与权威 snapshot。探针期间原生用户输入 **0 次**，没有模型调用。私有 `codex-settings-v2-native-summary.json`、`codex-settings-v2-qa.events.jsonl`、`codex-v2-cold-restore.json` 保留分阶段证据；这是 IPC 与真实原生设置链路通过，不等于 Codex Desktop 窗口操作已验收。

### 新候选 Android 图片队列与精确输入

真实 UI 只发送一次 `IMAGE_SENDING_LABEL_OK`，截图 315 已显示实际最终回复。此次受控发送队列首个大帧为 **472,532 字节**，共 5 帧／472,980 字节保留 **25.060 秒**后一次 flush；恢复原 send，未更换 socket。116 个可用采样均为 ready。不能将这种本地队列注入称为真实带宽限速、5 MiB wire 压力或任意网络环境通过；Sending 标签的视觉结果属于设备截图证据，原生计数本身不证明 UI 文案。

精确同一 QA thread 的只读审计确认：UserMessage.client_id 回显 **1 次**，对应 Bridge receipt／runId **1 次**，输入图片 **1 张**，工具调用 **0 次**，最终助手回复与 task_complete 各 **1 次**，终态无 error，持久权限确认 guard 已清除。原生回合 01:56:44.156 UTC 开始、01:56:50.777 UTC 完成；标记只用于选定目标回合，身份核验使用精确 clientId，而非正文／时间去重。私有证据 `phone-large-send-queue-1790646962336.jsonl` 与 `phone-image-sending-label-native.json` 保存原始摘要和计数，不复制图片或模型正文。本例 n=1，不代表 P95、周期停滞根因消失或 iOS 键盘问题已修复。


### Android 文字发送待确认文案复验

02:46 与 02:48 UTC 两次分别由真实 UI 发起的文字发送，使用受控 8 秒发送队列验证待确认状态。首次 UI dump 等待超过队列窗口，故第二次另发一条独立测试并直接截图；两次不是同一条消息的自动重试。截图 323 已目视确认最新用户气泡显示时钟，未提前展示助手正在思考；截图 324 显示该条消息确认并取得实际最终回复。

私有 `phone-text-sending-native.json` 的只读原生审计分别确认每轮精确 clientId 回显、Bridge receipt/runId、最终回复与 task_complete 均各 1 次，工具调用均为 0。它验证的是受控发送队列期间的文案和这两次精确输入；不作为自然网络恢复时间或整体无重复保证。

## 03:30 UTC 有界目录与探活突发预算候选的自然复验

冻结开发 CLI `7e58d1a366004f8697bbe6053ccddcc615555608319f3a490c464c0a53850560`、03:09 前完成的五套隔离 Preview，正常五 QA runtime 在 03:22:39 主动更换后开始观察。该主动切换与随后自然故障分别记录。被动采样覆盖 **03:23:17.123–03:43:17.513 UTC**，没有修改 Mac 网络、注入故障、发送模型消息或再次重启 owner。五 owner 在 03:30 仍各出现一次应用回声超时并恢复；**自然周期性停滞仍未根治**。

| 后端 | 日志中的应用探针等待 | 超时至 owner Relay ready | 时间来源 |
| --- | ---: | ---: | --- |
| Codex | 5.002 秒 | 0.506 秒 | 500 ms 轮询的日志到达时间 |
| Claude Code | 5.002 秒 | 1.519 秒 | 同上 |
| Pi | 5.002 秒 | 1.528 秒 | 同上 |
| OpenClaw | 5.000 秒 | 0.961 秒 | 原日志源时间 |
| Hermes | 5.002 秒 | 0.924 秒 | 原日志源时间 |

表中是局部阶段，未包含故障发生到首个有效失败证据的等待；Relay ready 也不等于手机／原生服务已恢复。Codex 本轮没有重现 02:30 的 90 秒探针等待。独立 HTTPS 400 次中 395 次成功，另 2 次 TLS 阶段连接超时、3 次 TLS `ssl_syscall`，均无 HTTP 响应；不能据此认定代理或 Cloudflare 为根因。没有采到观察器调度超限，但这不是 owner 事件循环测量。

Android 同步纯静置样本 `idle-1790652481718.jsonl` 完整覆盖 03:28:01 起的 300 秒，共 **400 个有效样本、0 次 CDP 不可用**。实际 `transferGraceMs>0` 为 **0 个样本**；绝对预算 `transferWindowBudgetMs` 仅在恢复后 1 个样本为正，不能把它称为仍有 90 秒活跃宽限。手机明确 heartbeat failure 到新认证为 **11.267 秒**，到新成功 history 的观察区间为 **12.687–13.622 秒**（另有 history_loaded 诊断在 13.582 秒）。第一条后继 socket 握手 8.345 秒后收到 4011，再次认证耗时 1.931 秒。实际连接状态非 ready 的采样包络为 10.674–12.249 秒。

最后收到的 Relay 心跳到 failure 为 **20.023 秒**，到新认证为 **31.290 秒**，到新成功历史为 **32.710–33.645 秒**。这个字段混合服务器单向 tick 与精确 echo，不能唯一识别最后一次原生或双向健康证明；因此真实故障起点仍未知，不能把 11.267 秒当成完整停机，也不能反过来把整个 31.290 秒都宣称已失联。Phone−Mac 的条件校准为 +9.150–9.171 秒，native 日志到达另有未测延迟；未直接跨钟相减。

当前聊天投影保持 32 行、13 个精确回显，无 uncertain、重复精确回显或发送错误；截图 331／334 的滚动位置由设备负责人目视核验，未逐页检查所有历史。空输入框 `canSend=false` 不作为发送禁用证据。此静置样本不证明新消息执行，启动阶段单独观察到 adapter connect→ready 2.049 秒、进入聊天→history_loaded 2.321 秒，也不是完整 App 冷启动用时。最新 Mobile 尾随目录刷新修复在该冻结窗口之后，未混入本次结果。

代理路径只读检查：恢复后五个 QA Node 各有一条 fake-IP 地址分类的远端 TCP；Hermes 另有本地 loopback 连接。这表明存在虚拟路由，不能推断选中节点、路由切换或故障原因。03:29:40–03:30:40 UTC 三个已确认代理进程的系统 unified log 固定事件分类查询为 0 条；普通用户日志最新仍为前一天，受保护配置不再尝试读取。没有记录不能排除内部规则刷新。原始日志内容、IP、域名及凭据均未保存。

证据位于私有 `natural-0330-joint-summary.json`、`phone-codex-natural-0330.summary.json`、`stability-plane-1790652197123.summary.json` 与两份代理元数据。上述为单次 Android Debug／Metro／CDP 自然窗口，不代表 Release、时延百分位、竞品优势或发布通过；下一候选探活截止调整尚未进入本次采样。

### 03:25 UTC: bounded catalog candidate on Android

Candidate CLI SHA-256: `7e58d1a366004f8697bbe6053ccddcc615555608319f3a490c464c0a53850560`. Only the five existing QA runtimes restarted. Production and user runtimes were unchanged. The actual Android package is `com.p697.clawket.connectionqa`; `30101` is its versionCode, not a package suffix. One launch with an incorrect QA package returned Activity not found; the installed QA activity then launched correctly. Metro rebuilding took 21.7 seconds and is excluded from connection latency.

The phone's real Preview adapter read all 971 sessions through ten frozen `sessions.sync` pages: largest page 65,422 UTF-8 JSON bytes, total 591,045 bytes, complete read 4,337 ms. The first page took 599 ms and the remaining nine sequential round trips added 3,738 ms. Keys were unique and the total matched. The immediate follow-up was a 45,419-byte delta in 473 ms. This is not a cold-catalog speed improvement over the prior 589,487-byte list in 602 ms: bounded responses avoid triggering the long large-frame protection at the cost of additional initial round trips. The delta currently includes all ordering keys (roughly 44.6 KB), so its size alone does not show widespread row changes.

Cold-launch connection diagnostic: 2,049 ms. Opening the existing QA chat: target ready 1,438 ms, fresh history committed 2,321 ms. These are single Debug samples, not percentiles. Screenshots 325/326 capture startup and history; 327-329 show scrolling into earlier messages without an immediate forced jump to the bottom. Longer dwell and complete pagination remain to be checked.

A remaining management-refresh race was found during the freeze: the coordinator can join a pre-mutation roster flight even after the consumer is invalidated. Dedicated cancellation prevents a false connection error, but one bounded trailing read is still needed for immediate freshness. This candidate is not a complete management acceptance pass.


## Owner heartbeat delayed hedge candidate (2026-09-29 03:54 UTC)

The five Agent owners and OpenClaw secondary channels now keep their existing probe cadence, send an exact-nonce protocol ping first, and add one application nonce after 1 second without proof. Both legs share the original 5-second maximum deadline; a sub-second valid protocol pong generates no application request. Explicitly shorter deadlines remain shorter. Current-socket/current-cycle/current-transfer-generation proof on either leg cancels both pending legs. The 1-second hedge is not a health threshold. No writes are replayed, no owner lease is bypassed, and the local-model runtime explicitly retains its original nonce-free protocol-pong behavior.

The shared checker keeps the dual-clock 90-second transfer ceiling and direction-aware pending-transfer grace. Observed expiry latches socket failure before the termination callback, preventing a buffered large frame or a wall-clock rollback from reviving it. Hermes skips a regular ping while an existing transfer check owns the cycle, then schedules exactly one next ping when that check confirms. Bridge successful hedge start/confirmation diagnostics are limited to one pair per socket per minute. Timeout `waitMs` retains application-leg timing when a hedge was sent (otherwise the cycle); additive `cycleWaitMs` measures the entire check. Earlier observations retain their original interpretation, and sparse success logs are not continuous-health evidence.

Final development CLI SHA-256: `f80259d069edca6d89ef2806464b4dacc73f4007f8dd71b1435d9322879d971b`; runtime dist rebuilt from the same source. Serial verification: `relay-owner-pong.test.ts` 46, `relay-owner-pong-runtime.test.ts` 21, `relay-request-capacity.test.ts` 48, `relay-transfer-runtime.test.ts` 26 (141 total); runtime typecheck; development bundle; v1 compatibility 41 tests across 5 files; documentation 7 instruction/symlink pairs and 5 validation checks; diff whitespace check. Independent review found and closed the Hermes untracked-ping interleaving and the pre-first-cycle unsolicited-pong gap. No QA runtime was restarted and no service was deployed by this verification step. This is deterministic local evidence; the next natural outage/device window must measure the end-to-end effect separately. The earlier 03:30 result used the previous serial 5+5 implementation and must not be attributed to this candidate.

## 04:00 UTC delayed-hedge natural recovery evidence

The preceding candidate ran in the five owned QA runtimes after the intentional 03:57:09 restart. Passive observation ran 03:57:54.943–04:17:55.445 UTC (1,200,502 ms): 395/400 fresh HTTPS probes succeeded, two timed out during TLS establishment and three reported the fixed SSL-syscall category. There was no observer scheduling delay over 250 ms. Fresh HTTPS is a separate connection and does not establish existing WebSocket health or locate the failure. Later normal iOS QA work overlaps this full owner capture; it is not an all-five-phone idle test.

All five backends again lost heartbeat proof near 04:00. The shared cycle timed out in 5,001–5,003 ms; the application leg lasted 3,998–4,001 ms, consistent with a hedge inside the original deadline. Failure-to-replacement Relay ready was Codex 2,019 ms, Claude 1,009 ms, Pi 508 ms (log-arrival differences with nominal 500 ms polling and unknown logging delay), OpenClaw 1,453 ms and Hermes 885 ms (source timestamps). These are replacement intervals, not total outages or native-health measurements. Successful diagnostic groups are throttled, so their absence cannot define the last good probe.

Android's 300-second recording includes cold launch/Metro compilation and navigation (363 valid samples, 22 unavailable). The stable natural slice begins at 03:59:38 after the QA chat and an unsent draft were ready: 232 valid foreground samples, zero unavailable. The draft enabled Send before failure, disabled it during recovery and enabled it again afterward. The current 31-row projection, 13 exact echoes and draft were retained with no uncertain or duplicate echo in this slice; earlier history still had more pages and was not exhaustively compared. Actual transfer grace and absolute transfer budget were zero throughout this slice.

Phone first failed heartbeat proof → new authenticated handshake was **12,907 ms**; → newly successful history **14,243–15,123 ms**. The first successor waited 9,808 ms in handshaking before owner retirement closed it with `4011`; the next authenticated handshake followed 2,107 ms later. Phone clock minus host was conditionally bounded to 9,148–9,166 ms, and only that bounded mapping was used for cross-device alignment. The last observed incoming Relay signal preceded the failure by 20,036 ms and the new handshake by 32,943 ms; that field also includes one-way ticks, so it is not uniquely native or roundtrip health and does not identify the true fault onset. The healthy-looking interval before failure must not be omitted when discussing the experience.

This is not evidence that overall recovery became faster: the prior single 03:30 sample reached new authentication 11,267 ms after failure, under different probe phases. The 04:00 ordering is consistent with the phone replacing its socket before the old owner starts its next check, then waiting for owner retirement. Existing logs do not prove whether that first successor's health request arrived at the owner. No protocol or timer was changed inside this sample.

An additional **unexplained Codex-only `1006` close** arrived at 04:06:10.608, followed by ready at 04:06:16.705 (6,097 ms). Root confirmed no intentional owner mutation, injection or restart at that time; iOS started later. There was no corresponding fallback-timeout log, and the five fresh HTTPS probes in that round succeeded. This extra failure remains recorded rather than being attributed to QA navigation or hidden in the half-hour incident.

Evidence stays private: `natural-0400-joint-summary.json`, `phone-codex-natural-0400.summary.json`, owner source `stability-plane-1790654274943.jsonl` (SHA-256 `55ab801f3187ea0026c65283a934397877232b6850354fc53c660d64a17170a0`), phone source `idle-1790654251793.jsonl` (SHA-256 `faff86e024da72fbf973be667ef7db3f7e13cfde0525bab5301f3d795bb8464a`). Single Debug/CDP samples do not establish percentiles, competitor superiority or release readiness. The natural stall is still unresolved.

## Relay-authored presence protection

The four existing presence controls (`client_count`, `client_connected`, `client_disconnected`, `client.sockets`) are now reserved at the Relay entrypoint after admission and before generic or OpenClaw secondary forwarding. Full clients, pairing peers and backend sockets cannot spoof these server-owned events to select an owner's active-client cadence. The Relay still generates the original frames, and client bootstrap/doctor commands retain their existing routing. Focused regressions cover all five backends, restricted pairing, secondary channels, binary/type disguise, flood budgets and ordinary commands. The complete narrow `apps/relay-worker/src/index.test.ts` passed 118 tests, followed by the Relay typecheck. Preview deployment and real cadence measurements are recorded separately; deterministic verification alone is not deployment or release readiness.

With root's explicit test-window authorization, the five isolated Preview Relays deployed serially at host 04:34:44–04:36:54 UTC. Every deploy ran the v1 replay gate (41 tests across 5 files), using frozen development CLI `b93d1ac2fcc0a957a9f9adaf6fd29ad7acf2a8499bf656f32527fa2a787c2503`. Product source hashes and exact Preview configuration hashes were checked before each step. Cloud readback confirmed each final version, script-content etag and exact Preview KV/DO bindings, plus invocation logs disabled, traces disabled and query-string redaction enabled. Production was not targeted. All five subsequent fresh public health requests returned 200; these are not native or same-socket health assertions.

Final versions: OpenClaw `8571203e-29a0-4cbf-b165-5560ee42efec`; Hermes `057ec5d6-01ff-4321-8682-85c89080944c`; Pi `ad55df9a-5365-49a0-858c-0862326afae7`; Codex `720558f2-5d44-4479-8165-d90dfa3cdba7`; Claude Code `f49df65c-3366-48fe-9229-78ebbb95ab72`. Private manifests are `presence-preview-deployments.json`, `presence-preview-final-readback.json` and `presence-preview-health.json`. Deployment-induced owner reconnections must be excluded from the next natural-outage window and recorded separately. The active-client cadence still needs real-device evidence; “active” means a retained authenticated full-client socket, not necessarily a foreground phone.

## iOS bounded-catalog management and background acceptance (2026-09-29)

With frozen development CLI `f80259d069edca6d89ef2806464b4dacc73f4007f8dd71b1435d9322879d971b`, the existing iOS Debug client negotiated `sessions.sync` and held the complete 971-row baseline and roster. Only the dedicated iOS QA thread was changed: its copied native ID was checked before rename, again in the archived panel and after restore. Rename, archive, restore and restoration of the original name all succeeded; the latest matching native session-index entry independently confirmed the restored name. No model prompt or other thread mutation was sent. Two combined Maestro flows missed the session-panel closing animation after archive; settled, separate panel/menu steps then passed. Those automation failures are not reported as successful interactions or unexplained product failures.

Screenshots `ios-085` and `ios-086` retained the same earlier-message viewport across the dwell. A subsequent **124,517 ms** stay in Settings returned to the same app process, preserving that reading position and the unsent 77-character draft. Settled screenshot `ios-088` and read-only metadata confirmed ready, Send enabled, all 14 unique projected history messages and the 971-row catalog. This short thread did not exercise additional history pages. The first return screenshot captured the system transition and CDP was not yet reattached, so this run does not establish a precise recovery latency. Initial Metro compilation is also excluded from connection timing.

Private evidence: `ios-catalog-acceptance.json`, `ios-084/086/088-catalog-metadata.json`, screenshots `ios-078`, `ios-082`–`ios-088`, and the per-step Maestro logs. Native identifiers and pairing material remain private. The simulator was shut down after verification; no source changed during this device run. This is functional iOS Debug acceptance of the catalog/management path, not proof that the separately recorded periodic connection fault has been resolved.

### Late history-bootstrap navigation guard

Independent review then identified a deterministic navigation race: after awaiting a local snapshot or session catalog, an older closure could select and load its previous route even though the same mounted Agent screen had switched conversations. Initial targeted regressions failed six of eight cases before the fix. Snapshot/catalog/cache continuations and the bounded catalog retry now check the initiating adapter, connection/Agent/route, selection generation and latest operation. Directory publication has a separate generation: a pure session-list refresh, whether successful or failed, cannot cancel the current conversation's unfinished initial history load. Older refresh cleanup cannot clear a newer spinner.

The full affected hook file passed **130 tests**, including 16 new scope/interleaving cases. Mobile typecheck passed after correcting a new test fixture's narrow TypeScript type; documentation and whitespace checks passed. An existing test was updated to require no history dispatch from the retired refresh, leaving the newer navigation responsible for its own history. This is local regression evidence, not a new device pass; the preceding iOS screenshots predate this additional guard and the next Android acceptance must use the frozen updated source.

### Active full-client owner cadence candidate (2026-09-29 04:34 UTC)

The five Agent owner paths now schedule protocol probes every 5 seconds only when this socket negotiated owner-pong support and Relay supplied validated full-client presence. Unknown/zero presence retains the original OpenClaw 10-second or Hermes/SDK 15-second interval; explicitly shorter intervals and local-model behavior are unchanged. OpenClaw primary and secondary sockets retain separate state. Presence flapping only moves a future timer earlier, never postpones it or resets a live 5-second probe/90-second transfer deadline. Relay forwarding rejects peer-authored presence controls separately; Bridge rejects forwarded source/target identities and malformed counts/lists.

Sequential final gates passed: owner-cadence 17, owner-pong 46, OpenClaw/Hermes runtime 28, SDK/local-model capacity and lifecycle 62, and five-path transfer runtime 26 (179 tests total); runtime typecheck, runtime dist/development CLI bundle, v1 compatibility 41 across five files, documentation 7 instruction pairs/5 checker tests, and diff checks. Initial runtime regressions caught OpenClaw's normalized optional identity fields (`undefined`) and a fake-clock fixture mismatch; both were corrected before the final passes. These results are source/local verification, not a new natural-fault latency measurement.

Candidate `apps/bridge-cli/dist/index.js` SHA-256: `b93d1ac2fcc0a957a9f9adaf6fd29ad7acf2a8499bf656f32527fa2a787c2503`; runtime dist comes from the same build. No QA runtime was restarted or cloud service deployed by this gate. Continuously active Hermes/SDK protocol ping counts rise from 240 to 720 per hour, OpenClaw from 360 to 720, with matching healthy pong counts. TLS/TCP, battery and billing effects remain unmeasured. Presence means an attached full client, not foreground; an already blackholed idle owner may not receive a new presence update. The nominal 5-second cadence plus existing 5-second deadline excludes event-loop stalls, transfer grace and reconnect/authentication time and is not an end-to-end SLA. Mobile's application-ping interval remains 15 seconds.


## 05:00 UTC active-client candidate natural recovery

Only the five owned QA runtimes were restarted at 04:52:58 UTC with development CLI `b93d1ac2fcc0a957a9f9adaf6fd29ad7acf2a8499bf656f32527fa2a787c2503`. Runtime output comprised 170 files with the reviewed aggregate SHA `d365a7fbc80c36b0835dbdf1dac361581b4007e8eb0f167ad4eacb514243d87b`; the immutable 978-file Mobile source snapshot was `1fcad7b4499590a3c8c73832125f4289fb289997773772adc172fe4a07b7da73`. The intentional restart's initial SDK owner retries are excluded from natural recovery. Android compiled this frozen development source; no distribution build was produced.

The metadata-only phone capture ran 300 seconds with 400 samples and zero unavailable samples. The idle slice starts at host 04:58:21 after keyboard dismissal; all 347 subsequent samples remained foreground. Fixed screenshots 370–375 were personally inspected: the same messages, reading position and 18-character unsent QA draft remained visible; Send was disabled while reconnecting and returned afterward. Independent before/after metadata confirms the exact draft, not merely an enabled button.

Phone-clock failure-to-authentication was **8,141 ms**. The first committed fresh history was bounded by adjacent samples at **10,763–11,793 ms**, with the genuine history-loaded diagnostic at **11,285 ms**. An earlier cached-history-ready diagnostic after authentication is deliberately excluded. The first successor attempt failed while opening its socket (`ws_error` after 5,024 ms, close 1006 after 5,025 ms); no 4011 was observed. All 31 current-page rows and 13 exact input echoes remained, with zero uncertain sends, duplicate echoes or send-error states. This is current-page preservation, not full-history validation. No transfer grace protected the fault interval; two short incoming-frame grace samples after authentication do not imply a 90-second stall.

The separately instrumented owner recorded its last matching protocol pong at host 04:59:49.506, a new ping at 54.403, timeout close at 59.406, and new `relay.ready` at 05:00:00.420. Full-client presence and the subsequent health request reached the new owner at 10.434 and 10.575. These arrival timestamps prove delivery to the process, not native health or unique request correlation. Phone-clock recovery calculations never subtract host timestamps; the conditionally inferred phone-minus-host offset was 9,138–9,154 ms. Evidence: private `phone-codex-natural-0500.summary.json`, its hashed source, `active-natural-screens.json`, and before/after `android-0500-soak-metadata-*.json`.

This is a single natural failure sample with improved recovery relative to the recorded prior sample; it is not a P95/P99, a controlled competitor comparison, a Release measurement, or evidence that the periodic upstream fault has disappeared. Final real sends, complete pagination and other backend checks continue on this candidate.

### Completed 05:00 owner and independent HTTPS observation

The passive capture completed at host 05:13:50.334 UTC, covering 1,200,144 ms from 04:53:50.190. Direct process-arrival instrumentation recorded exactly one timeout-related owner close and replacement for each backend, with no additional owner closes in this interval and no reported dropped arrival observations. Root intentionally force-stopped the QA Android app and stopped Metro at 05:10:20; subsequent presence changes are not natural faults or phone-idle evidence. The five QA owner processes were not restarted during the capture.

| Owner | Cadence in the stationary phone slice | Last matching protocol pong to replacement `relay.ready` | Close to replacement `relay.ready` |
|---|---|---:|---:|
| Codex, with a full client | 5.000–5.013 s | 10.914 s | 1.014 s |
| Claude Code, idle | 15.000–15.003 s | 20.874 s | 0.983 s |
| Pi, idle | 15.001–15.003 s | 20.768 s | 0.889 s |
| OpenClaw, idle | 10.000–10.004 s | 15.788 s | 0.886 s |
| Hermes, idle | 15.100–15.370 s, including its confirmation-driven scheduling | 20.886 s | 0.882 s |

The first duration is an observation bracket from the last matching pong, not a measured fault-onset duration. The second omits failure detection entirely. Matching is checked against the most recent protocol ping in the private observer; it does not replace the runtime helper's cycle/generation validation or prove native backend health. With the phone's conditional clock offset, the new Codex owner was already ready 2.240–2.256 s before the phone declared heartbeat failure. Thus the subsequent 5.025-second socket-opening failure was not the earlier candidate's wait for an old owner to retire; its network cause remains unproven.

Of 400 independent fresh HTTPS health requests, 397 returned 200. Three failed during TLS setup: two fixed-category `ssl_syscall` failures and one timeout. All 20 requests in the one-minute window around the owner failures returned 200. No observer scheduling delay exceeded its 250 ms reporting threshold; this measures only the capture process, not every runtime event loop. These independent HTTP connections do not prove the existing WebSocket, room or native service was healthy, and do not identify the failing network component.

Private evidence: `natural-0500-joint-summary.json`, `natural-0500-arrival-snapshot.json`, the updated `metrics-summary.json`, and completed `stability-plane-1790657630190.jsonl` (SHA-256 `96983a2cb7eb3ae20f47ffe419f0ab965c026f0eff75b52f27717ce93a0ae631`). The immutable arrival snapshot records source-prefix byte counts/hashes because the original instrumentation files continue to append. There was no product source edit, model invocation, deployment, device action or network-setting change by this observation task.


## Android complete-history blocker found at 05:05 UTC

Real upward scrolling changed the displayed history from 31 to 32 rows and then reported `hasMoreHistory=false`. Screenshot `360-android-history-oldest.png` shows an old locally cached user prompt immediately followed by a much later assistant reply; it is a failure artifact, not a passed complete-history check. The private hash-only audit compares the exact QA native rollout with UI message identities: native completion records contain 18 user, 23 assistant and 6 tool items (plus one intentionally hidden reasoning item). Only 31 native item identities from the tail matched the UI; one extra UI user had no native identity. Of the 16 unmatched earlier native items, five were user, eight assistant and three tool. Assistant presentation may merge text, but even assigning the one local user to an unmatched original leaves at least four user messages and three tools absent.

The three SDK adapters accept a real `cursor` and return `nextCursor`, whereas the shared history controller only increased `limit` and compared row counts. It therefore reread the same first page and incorrectly switched to local-only history. Codex uses 32 raw native items per page, Pi up to 40 visible messages, and Claude Code up to 100; all pages are old-to-new and the opaque cursor points farther back. A fixed threshold of 50 cannot define exhaustion. Repair is in progress in the shared Mobile history window, retaining the existing non-cursor OpenClaw/Hermes path. QA App and Metro were deliberately stopped at 05:10:20 for serial narrow regression tests; no distribution or Production action was taken.

### 05:36 UTC cursor repair candidate and verification boundary

The chat history window now consumes opaque native cursors and retains loaded older segments across head refreshes. Older pages do not republish historical activity or model metadata. Scope fences cover navigation, selection, adapter replacement and socket generations; repeated cursors, duplicate page identities and empty traversal are bounded. A failed older-page read keeps existing messages and offers an inline manual retry instead of claiming history is exhausted or automatically retrying forever. Non-cursor OpenClaw/Hermes retain their existing limit/cache path. The change is Mobile-only; the running Bridge and five Preview deployments remain unchanged.

Five narrow test files passed serially: cursor window 13, history hook 149, controller contract 57, ThreadView 122 and ThreadScreen 67 (408 total). Mobile TypeScript, the design gate, strict 19-locale checks plus eight checker self-tests, and documentation checks (seven instruction pairs plus five checker self-tests) passed. Independent review checked page identity/order, current-run metadata, stale-adapter continuations, empty pages and refresh gaps. These automated results do not prove complete device history.

Mobile was frozen at 05:36:38 UTC before restarting the single-worker QA Metro. The new manifest covers all 1,182 Git-tracked/nonignored untracked Mobile files, including tests/assets/docs, SHA-256 `43b9d5a87df72da1fbbff262932336d1b66bcf73b2145f88853b12084d42453e`; this expanded inventory is not directly comparable to the earlier 978-file manifest. The history hook itself is `e3ade604638cf6a86a0fbd09e67b186e039b2ad04de29e9e2b90de7bc8d01975`. Native-identity completeness, old-cache deduplication and real foreground/continuation checks remain pending at this checkpoint. The Chinese model-authentication notice now says authentication failed, without asserting that a previously valid login expired; screenshot `ios-070` documents the earlier wording.

At 05:40 UTC, real Android upward scrolling reached all **47 native records: 18 user, 23 assistant and six tool items**. The independent, read-only rollout audit matched every native identity and all 41 user/assistant text hashes. No native record was missing, no native identity mapped to multiple UI rows, and no extra cached user row remained. This sample did not merge assistant rows. The native file SHA-256 is identical to the pre-repair failure baseline, demonstrating corrected retrieval rather than changed test data. `hasMoreHistory=false` now agrees with the actual end of native history. Screenshot `380-android-cursor-older.png` was personally inspected against `360`: the earliest permission explanation and refusal now follow their original prompt. Evidence: private `android-cursor-older.json` and `android-cursor-older-native-proof.json`. This proves complete view-model history plus the inspected older-page UI; refresh/reading-position retention and real continuation are being tested separately.

### 06:00 UTC natural recovery, history retention and settings follow-up

After complete-history verification, Android kept the same 47 native identities, text/image hashes and reading position across approximately 182 seconds in the background. Switching between the two owned QA conversations and back did not mix their histories. Copying the native thread ID, rename, archive, restore and return to the original name were exercised; independent read-only native audits confirmed both QA conversations ended unarchived with the correct project and original title. One real `CODEX_ACTIVE_FINAL_OK` request/reply completed; the later background continuation marker was still pending at this checkpoint.

The 06:00 metadata capture ran 300,177 ms with 399 samples and no unavailable samples. From the stationary foreground anchor at host 05:58:11, 306 of 308 samples were ready, one reconnecting and one handshaking. On the phone clock, explicit heartbeat failure to authenticated readiness was **1,752 ms**; first fresh history commit was bounded at **3,139–4,060 ms** (history-loaded diagnostic at 4,021 ms). An earlier cache-only history diagnostic was excluded. The successor WebSocket opened in 419 ms. The same 20-character unsent draft, 33 current-page messages and reading position survived; there were no uncertain sends or duplicate echoes. This 33-row head window follows deliberate A/B navigation and is not a regression of the earlier complete-history proof.

The last incoming Relay signal preceded detection by 20,032 ms. This is an observation bracket, not a known fault-onset timestamp. A private read-only close classifier captured the retired old socket's 1006/error 58.261 seconds after the successor authenticated; the fixed category was unknown. It was neither a current-socket failure nor proof that Relay emitted that close. This capture did not reproduce the 05:00 first-successor opening failure. Classifier listeners/factory wrappers were removed and their absence verified before deliberately stopping the QA app and Metro at 06:21:16 for the next patch's serial tests.

Screenshots 410–415 were personally inspected: reconnect disabled Send, subsequent ready frames restored it, and the draft/reading position stayed intact. Screenshot 416 was captured at **06:20:36**, not immediately after the capture. It showed a grey permission shield and raw model ID where 415 showed orange Full access and the friendly model label. No Mobile source changed between the earlier freeze and deliberate shutdown. The read-only native settings audit found the latest native settings event still Full access, high reasoning and priority service tier, with no later write or permission-confirmation guard. Grey includes unknown and custom modes; this does not establish an actual permission downgrade. Rich live metadata and a readonly picker/foreground reproduction are required before choosing a fix.

Evidence is private: `phone-codex-natural-0600.summary.json`, source `idle-1790661422765.jsonl` SHA-256 `22a1ea9c0b472a192c889bbbafcdb7e143e1de10753fd80ad8ccb588a4675c2b`, `android-older-background-retention-proof.json`, the management native proofs and `android-0620-native-settings.json`. These are single development-device samples, not release, P95/P99, competitor or root-cause evidence.

### Same-conversation settings and continuation follow-up

The late-open candidate was frozen at 06:37:20 UTC: 1,182 Mobile files, SHA-256 `d613c647ae3def3bc8fdaf74e7844114a9f8976db071bda3686aad68b56581ed`; the cursor hook hash was unchanged. Before opening any picker, the cold QA conversation returned a five-model catalog with one exact model/provider match, the friendly model label, confirmed Full access and Fast enabled. A readonly permission-sheet visit agreed. Neither step changed native settings. Across 152,526 ms of background time, the exact 26-character draft and settings survived. The immediate debugging target was unavailable during return, so this sample has no defensible millisecond recovery measurement; subsequent scoped metadata and screenshots 421–425 establish the functional result only.

After that return, one `CODEX_ACTIVE_BACKGROUND_OK` message completed in the same native QA conversation. The independent offline audit matched both this and the earlier `CODEX_ACTIVE_FINAL_OK` to exactly one native user input, one exact client-ID echo with a persisted Bridge receipt/run, one final reply and one completion each, with no tools or aborts. Screenshots 403 and 427 were personally inspected. Evidence: `phone-final-markers-native.json`, native source SHA-256 `f4ea423bbfa4ad065873f1f3f95008696de4edae99466bf2d5e242d1248f6767`. This closes the two planned real continuation checks without replaying either input.

The earlier grey/raw display was not reproduced. Static review also ruled out the proposed Codex `modelPerSession` capability-flip path: it stays true through its production handshake/probe code. A remount/replaced adapter whose first settings read fails can still display only session model metadata until a later refresh, but there is no evidence that this happened in screenshot 416. Do not describe the cold read as a fix or invent a native permission downgrade. QA Android and Metro were then deliberately stopped for the next serial test window.

### Retired connecting socket cleanup (2026-09-29)

Installed Android React Native stores its native WebSocket only after Upgrade succeeds. A JavaScript `close()` while still connecting can therefore reach a missing native map entry; a later `websocketOpen` unconditionally changes the JavaScript socket to OPEN. Clawket previously cleared every callback during retirement, leaving that late connection without disposal. This is a source-confirmed lifecycle defect, not evidence that it caused the 05:00 socket-opening failure.

Shared Relay/Direct disposal now retains only a one-shot late-open callback for the retired connecting socket. It closes that socket without emitting state, authenticating, sending messages, touching a replacement or resetting backoff; a failing native close is isolated. Already-open sockets retain the normal immediate cleanup. Regression cases model the pending native Upgrade across disconnect, explicit reconnect and open timeout, including repeated/throwing cleanup and a ready successor. No protocol, network setting or timeout changed.

This cannot undo a server-side client replacement that has already occurred before the late Upgrade reaches JavaScript. A future staged activation would need a bounded, hibernation-safe predecessor-generation compare-and-swap with legacy behavior preserved; per-attempt random client IDs or parallel races must not substitute for it. This remains deferred, not implemented. This patch makes no claim to eliminate that residual race or the periodic path stall; real candidate reconnection remains a separate device check.

Verification was serial with QA Android/Metro stopped and no booted simulator: Relay transport 15, Direct transport nine, recorded OpenClaw/Hermes adapters 26 and SDK adapter recovery 27 tests passed (77 total). Mobile TypeScript, documentation checks (seven instruction pairs and five checker cases), whitespace checks and the five-file v1 compatibility gate (41 tests) passed. No distribution build, runtime restart or deployment was performed for this patch; device verification remains separate.

### Foreground client cadence candidate after the 06:00 observation

The Mobile-only candidate shortens the existing negotiated `relay.client-ping.v1` foreground interval from 15 to five seconds. Its exact-nonce deadline remains five seconds; a pending probe and its deadline cannot be postponed by repeated readiness, normal traffic or composer input. All ready foreground views use the same cadence, including idle reading; no keyboard/draft activity state machine was added. Background suspension, old-Relay tick behavior, current-socket fencing and the absolute 90-second transfer budget remain unchanged. The Bridge, Relay deployments, reconnect backoff, native handshake deadlines and Send preflight semantics were not changed.

At negligible RTT, a continuously foreground connection nominally sends 720 application echo requests per hour instead of 240, with matching replies. These invoke the Durable Object handler and its attachment-budget write, unlike the owner's normal protocol ping/pong; nominal request/handler/write volume is therefore about three times the prior cadence. Only the selected connection is active, and background schedules no new client probes. Battery, network and billing effects have not been measured. Five-second cadence plus the unchanged five-second deadline gives a nominal ten-second detection phase under ordinary scheduling without transfer grace, not a bound on fault onset, total recovery, native readiness or fresh history. Historical 15-second sample measurements above remain unchanged.

This candidate passed five narrow files serially: client-ping 20, transfer 16, SDK recovery 27, Gateway legacy parity 124 and recorded adapters 26 (213 tests). Mobile TypeScript, documentation (seven instruction pairs/five checker cases), whitespace checks and v1 compatibility (five files/41 tests) passed. Mobile transport source SHA-256 is `a5be065249cf53193aabfde6694bf7947661a53ee4a265a1def2a8366e05bb37`; the already-verified late-open disposal source remains `183dd0a601feedad350bb82552e58f09525966363e2039ab9104d449394b4a0a`. Independent read-only reviews found no blocker. These are local automated checks; the new five-second foreground candidate still needs device/natural-window measurement. No Bridge build, QA runtime restart, cloud deployment or distribution artifact was created by this step.


### 07:00 UTC five-second foreground candidate natural observation

The frozen Mobile inventory contained 1,182 files, SHA-256 `1c610087976649918db68354bb7f9f14a84dead265b3aa33320575cde3c9ea93`; Bridge remained `b93d1ac2fcc0a957a9f9adaf6fd29ad7acf2a8499bf656f32527fa2a787c2503`. Android's last touch was reported at 06:52:09 UTC. The sole read-only phone observer ran from 06:57:32.305 for 300,631 ms, with **400 samples and zero unavailable samples**. There were no model calls, backend RPCs, UI actions, source reloads, owner restarts, deployments or network-setting changes during the capture. Root's seven timed screenshots were passive. The bounded QA close classifier was installed before the window; its listeners and factory wrapper were cleaned up afterward, and a separate read confirmed absence before the QA app and Metro stopped.

Actual numeric application-ping send timestamps showed 57 probes and 55 same-socket intervals: **5.129–5.833 seconds, median 5.169 seconds**. The next probe is scheduled five seconds after the preceding exact acknowledgement, so send-to-send timing also includes its round trip. This confirms the new cadence runs on the device; it is not derived from the observer's 750 ms sampling interval. The failed probe ran **5,032 ms** before `heartbeat_timeout`. The last incoming Relay signal preceded failure by **10,062 ms**, compared with 20,032 ms in the historical 06:00 sample. Both are observation brackets with unknown fault onset and different probe phases, not controlled estimates of average improvement.

The capture still contains one natural failure: **398 ready, one reconnecting and one handshaking sample**. Phone-clock failure to new backend authentication was **1,767 ms**: 915 ms to the replacement socket factory, 449 ms to native WebSocket open and 403 ms from open to backend authentication. Fresh history completed **4,292 ms** after failure; adjacent samples bound that result at **3,773–4,764 ms**. The earlier cache-only ready/history diagnostic was excluded. The conditional phone-minus-host offset was 9,126–9,153 ms; all recovery durations above use the phone clock alone. No active transfer grace covered the fault or any other sampled instant; a single positive absolute-budget sample is not active grace.

The current head projection kept the same **31 rows and 13 exact user echoes**, with no uncertain sends, duplicate exact echoes or send-error state. Before/after metadata matches every current row's identity, text hash, image count and optional presentation key. The exact **20-character unsent QA draft**, Full access, Fast enabled, friendly model selection and five-model catalog survived. Continuous allowlisted metadata kept the model labels present, Full access, high reasoning and runtime settings available. This is current-projection and endpoint verification, not a new all-pages or native execution audit. Root inspected screenshots 450–456 and Mobile saved 431/460; none of the spaced screenshots captured the brief non-ready interval, so their ready appearance must not override the recorded failure.

The classifier saw no successor opening error. An unknown-category 1006 arrived for retired generation 1 **58.253 seconds after generation 2 authenticated**; it is not another active-connection failure. The prior five-second successor opening failure remains unexplained and was not reproduced here. This single Debug/Metro/CDP sample validates the candidate's cadence and measured recovery, but does not resolve periodic network stalls or establish P95/P99, Release readiness, a competitor comparison or an end-to-end SLA.

Private evidence: `phone-codex-natural-0700.summary.json`; source `idle-1790665052305.jsonl`, SHA-256 `04b90a7dd268debd5e9dfd4da6387ed21827bd777d8a7c6c6ce2593140e344a7`; `android-0700-before.json`, `android-0700-after.json`, root’s independent `android-natural0700-retention-proof.json`, `natural-0700-screens.json`, and the hashed classifier read/cleanup/absent verification files listed in the summary. Analysis after capture was entirely offline; no tests, builds, further CDP injection or cloud changes were performed by this observation task.

### Unknown-permission presentation and real continuation (07:12–07:22 UTC)

Unknown native permission metadata now renders an explicit question-mark shield and Unknown label, without a selected permission radio or a fabricated custom-computer setting. A manual retry invokes the existing read-only selection read. Explicit unsupported metadata alone shows the unavailable notice. These presentation states do not write native settings or introduce a Send guard. The affected sheet and ThreadView suites passed 144 tests, including 14 new cases, followed by serial Mobile types, design, strict 19-locale validation/eight checker cases and docs.

Android exercised this with a bounded, one-use QA-only response fixture: the real selection response was read first, then only its permission mode was cloned to null. The settled accessibility tree in 463b had all three radios unchecked; normal Retry read back the real Full access state in 464, with Fast and the five-model catalog intact. The wrapper restored itself and cleanup was confirmed. Independent before/after native audits found all 29 settings events and the entire rollout SHA-256 unchanged. This proves read-only Unknown/Retry behavior; it does **not** reproduce or resolve the unexplained grey/raw display in screenshot 416. The standalone Retry row looked too prominent in the screenshot, so a final compact inline visual adjustment is being verified separately.

The frozen five-second candidate then sent `CODEX_CADENCE_FINAL_OK` once in the same owned QA thread. Screenshot 467 shows the actual reply; an independent offline native/Bridge audit found exactly one native input, one exact client-ID echo, one persisted receipt with a unique run, one matching final and one successful task completion, with no tool call or abort. Native input timestamp: 07:20:29.154 UTC. Source rollout SHA-256: `005e6791faca9db4ef9b8cccad3ed7e18bc41344371018e8c30b4b77de91964d`. This is execution and phone-delivery evidence, not a first-token latency sample. The original two markers were not resent. Private evidence: `android-unknown-and-cadence-summary.json`, `android-unknown-native-after.json`, `phone-cadence-final-native.json`. Android and Metro were stopped before the visual-only test window.

### Compact Retry visual follow-up

The unknown-permission Retry is now a canonical text button with a refresh icon, inline at the right of the permission summary. Its standard medium size retains a 44-point target; the summary may wrap instead of pushing controls offscreen. The existing read-only callback, disabled behavior, test identity and separate actual-error Retry are unchanged. Only the sheet and its affected test changed. The sheet's 17 tests, Mobile TypeScript, design gate and whitespace check passed serially with QA/Metro/simulators stopped. Two independent read-only reviews found no new blocker. Final device screenshot verification follows on a newly frozen candidate; other backend and iOS checks remain pending at this checkpoint.

The compact layout passed real Android inspection in screenshots 468/469 on the final Mobile freeze at 07:28:23 UTC (1,182 files, SHA-256 `39c8ae492483a23a7f79625fd7b84d3dc0220187fd0e8da430ea0bd32beea89c`). A second controlled Unknown response was used once and cleaned up; normal Retry restored real Full access. Independent native before/after checks found the same 30 settings events, their complete fingerprint, latest event and entire rollout SHA. The extra event relative to the prior 29-event fixture belongs to the preceding normal third message, not the visual fixture. Root personally inspected both screenshots. No additional Codex A message or native setting write was made. Evidence: `compact-retry-native-after.json`; subsequent four-backend/iOS checks use this same freeze.


## Remaining periodic fault attribution — evidence boundary, 2026-09-29

The 18:30 and 19:00 UTC controls reproduced missing protocol pong and application echo on two established sockets to an independent plain Worker with no Clawket routing, Durable Objects or KV (source SHA-256 `55afcd10affc84ccb26b2855748518120e2c02d9d7bdf0412d9e52fa7a135663`). Postman sockets on the same Mac remained responsive in those windows, and each window's 40 fresh HTTPS health requests succeeded. Thus Clawket/DO business logic is not a necessary condition for the common stall; this does not identify the responsible proxy, destination route or Cloudflare component. Sources: private `incident-1830-three-controls.summary.json`, `incident-1900-three-controls.summary.json`, with original-file hashes and clock assumptions preserved.

The [09-27 investigation](stability-2026-09-27.md) also recorded a healthy independent cloud socket while local controls stalled. Its alternative local exits shared a proxy entry and are not independent network proofs; the Android alternative-path attempt was interrupted and was not a pass. The later five QA Node connections had fake-IP remote-address classifications, establishing virtual routing but not a selected node or its failure. The permitted three-process unified-log query for 03:29:40–03:30:40 UTC returned no records; ordinary accessible proxy logs were older, and protected configuration was not read. Absence of these logs cannot exclude a rule reload. See private `proxy-unified-log-0330-narrow.json`; its broader preliminary word filter does not prove a proxy update.

Relay `echo_sent` records only that the send call returned, not remote receipt. Cloud/host clocks differ and Worker initialization measurements do not cover all platform input/output gating. Those limits prevent attributing late echo records specifically to the return path. Clawket's independently confirmed recovery, stale-client, handshake, history and transfer-grace defects remain product responsibilities even though the common stall also occurs outside its business protocol. The latest faster recovery sample does not establish a resolved cause, latency percentile or release readiness.

The next discriminating evidence is the missing boundary metadata for one recorded incident: platform-side handling/termination for the existing server-generated socket diagnostic IDs and UTC window, paired with normally accessible proxy diagnostics restricted to the owned QA connections (fixed event/close categories and timestamps only). Any further packet-level observation would need separate coordination and strict endpoint/metadata limits; none was started here. Do not change Mac nodes, bypass protected configuration, capture credentials or payloads, or repeat the same echo soak as a substitute for locating that boundary. Without that evidence, retain “selective established-WebSocket stalls on the path to Cloudflare; component unconfirmed.”

### Final Android pass found a keyboard-layout blocker (07:37 UTC)

Claude Code completed `CLAUDE_CADENCE_FINAL_OK` once in its owned QA session, but pressing Android Back shortly after sending left the compact composer near the middle of the screen after the keyboard disappeared. Screenshots 474/475 preserve the failure; waiting for the reply did not remove the large bottom blank. This is an acceptance failure despite successful model execution.

Read-only metadata distinguishes it from a remaining keyboard or an oversized input: Android IME reports hidden; the keyboard provider's height/progress and KAV computed padding are zero. The rendered host style still contains roughly 322.4 points of bottom padding, and the composer begins at y≈349.5. Refocusing and closing again, without sending a message, restored host padding zero and y=672. These observations narrow the problem to layout synchronization but do not by themselves identify the underlying commit mechanism. No product source changed during capture. A private QA reader initially produced a development LogBox because its SDK adapter guard and Promise evaluation were incorrect; that tooling error was corrected and is not counted as a product exception. A clean reproduction remains part of the fix verification.

Private evidence: `android-claude-keyboard-stuck.json`, `android-claude-keyboard-stuck-ime.txt`, `android-claude-keyboard-refocus.json`, `android-claude-keyboard-back2.json`; root personally inspected screenshot 475. Pi's subsequent real reply with Back after completion had the correct dock position, which does not clear the Claude send/dismiss overlap failure. Shared Android avoidance is being diagnosed; latest iOS acceptance and the final serial historical compatibility gate wait until this is addressed.

### Four-backend real reply and bounded catalog completion before the keyboard patch

On the frozen `39c8ae…ea89c` Mobile candidate, each of Claude Code, Pi, Hermes and OpenClaw received one newly entered cadence marker and returned its expected real reply. Exact Preview connection/session guards ran before sends; the current chat projection showed one corresponding user row, one assistant row, ready state and no send failure for each. No marker was automatically or manually resent. Root inspected screenshots 475, 480, 484 and 488. The Claude screenshot also contains the keyboard-layout failure above, so successful execution does not count as complete UI acceptance. The other three finished with their composer correctly docked.

Real phone reads exercised negotiated bounded catalog full/unchanged semantics for Claude Code and Pi:

| Backend | Sessions / pages | Full JSON payload / elapsed | Unchanged payload / elapsed |
| --- | --- | --- | --- |
| Claude Code | 131 / 1; unique keys | 65,444 bytes / 798 ms | 109 bytes / 693 ms |
| Pi | 1 / 1; unique keys | 585 bytes / 253 ms | 109 bytes / 254 ms |

These are single read-only JSON response measurements, not full WebSocket envelope sizes, first-entry UX timings or latency distributions. OpenClaw/Hermes correctly remained on their legacy catalog contract. Evidence: private `{claude,pi,hermes,openclaw}-cadence-after.json`, `claude-code-catalog-sync-1790667450529.json`, `pi-catalog-sync-1790667827422.json`. Android QA and Metro were stopped, port 8081 checked absent and every simulator confirmed shut down before the keyboard candidate's narrow tests. Latest iOS and the local 24-stage historical rollout matrix remain pending.

### Keyboard candidate and native reply reconciliation

Android now uses the same stable React Native `KeyboardAvoidingView` component as iOS, with the existing padding behavior and measured offset. The patch removes the separate animated padding owner; it does not force a padding value, remount the composer, change global animation flags or add a repair timer. ThreadView's 130 tests, Mobile TypeScript, design checks (227 UI files / 65 checker outcomes), documentation checks (seven instruction pairs / five checker cases) and whitespace validation passed serially. The six affected files and hashes are recorded in private `android-react-padding-gates.json`. This is a candidate, not a device pass: send/dismiss overlap, motion and already-visible-keyboard navigation are being checked on the newly frozen Mobile inventory `786af504…ad18a`.

Separate read-only native audits reconciled the previous four-backend test. Claude has one exact native input matched to its durable receipt and one final reply identity; thinking/text are two JSONL blocks of that same response, not two replies. Pi has one input mapped by exact native entry/file identity to its receipt and one stopped final. Hermes has one input and one stopped final in the exactly mapped QA native session, but does not provide the SDK client-ID receipt contract. OpenClaw retains scoped phone/UI evidence only; no broad native history scan was performed to manufacture stronger proof. Private `other-backends-cadence-native-reviewed.json` preserves these distinctions.

### Current-production historical rollout matrix — passed at 08:04 UTC

The local release compatibility matrix passed **24/24 stages, one file / four tests, in 47.149 seconds**. Each of OpenClaw and Hermes was exercised with the candidate Bridge and historical published 0.7.0 Bridge through six rollout/recovery phases. The test used the immutable bundle bytes for the four currently deployed Production Worker versions, checked against read-only current metadata and the previously recorded cloud/source hashes; stale September 22 snapshots were not used.

All 277 source inputs remained unchanged throughout the run, aggregate SHA-256 `00fb99c48090dd07fcfb1a820986abae590c9aba03b99877148ec847e1bc1b05`. The snapshot manifest is `4a32210f04a8dff4575533c7e919fe6fa0c223fa13b3e432459b09be20713255`. Temporary recovery bundles were local dry runs; test processes, temporary historical worktrees and recovery directories were cleaned up before the UI window resumed. Private evidence: `release-compat-final-1790669019555.summary.json` and its hashed full log.

This verifies local protocol compatibility and recovery with current-production bytes. It is not a Cloudflare control-plane migration rollback, a distribution-package check, proof of SDK model behavior or evidence that periodic stalls have been resolved. No Production deployment, upload, publication or version change occurred.

### Android RN padding candidate: functional endpoints pass, motion rejected

Real Android testing on `786af504…ad18a` completed two ordinary focus/Back cycles with native padding `0 → 322.4 → 0`, then one new `CLAUDE_KEYBOARD_SEND_BACK_OK` message followed by Back approximately 117 ms after the Send action began. Screenshot 493 shows the real reply and correctly docked composer. An independent native/receipt audit found one exact input identity, one response/request identity, one final and no tool use. The marker was not resent. A 212-character draft survived expanded editing, model-sheet return, normal Claude → roster → Pi → Claude navigation and a 50,099 ms background interval. That normal navigation closes the keyboard before the new chat mounts; it does not establish arbitrary mount-with-visible-IME behavior. The draft was cleared after checking retention.

However, actual intermediate video frames fail the motion criterion: `490-motion-1850ms.png` shows the rising keyboard covering the still-low composer; `490-motion-5750ms.png` shows the falling keyboard leaving temporary blank space under the still-high composer. By `5900ms` it has jumped to the correct endpoint. Root inspected these three frames and 493 directly. Initial 2.1/2.25/2.45 and 6.1/6.25/6.45 second extractions were already settled and must not be cited as animation proof; recording startup and geometry sampling do not share a zero timestamp.

Consequently the RN-only Android candidate is **not accepted as the final UI fix**. It resolves the observed lingering padding in these samples but changes synchronized motion into endpoint updates. Work continues on an isolated keyboard layout owner that retains native animation without a stale settled layout. Android, Metro and screenrecord were stopped, port 8081 absent and all simulators shut down before the next code/test window. iOS final checks are paused until the Android candidate is settled. Evidence: private `android-native-kav-focus-motion.jsonl`, `android-native-kav-send-motion.jsonl`, `android-native-kav-send-actions.json`, `claude-keyboard-send-back-native.json`, and the two retained screen recordings.

The permitted read-only proxy GUI follow-up exposed only a blank Clash Verge window and its ordinary window/menu chrome, even after raising the existing window. It yielded no connection or rule-refresh diagnostics. No network setting was changed, process restarted, or protected configuration accessed; the blank UI provides no evidence about the fault's cause.

### Android synchronized-padding candidate — code gates passed, device pass pending

The Android-only chat avoider now consumes the installed keyboard controller's public generic frame handler, retaining UI-thread padding animation without changing the Activity input mode. Its stable host filters incoming cached padding and owns a single React settled baseline. Animation overlays that baseline natively; only a current terminal event updates it. UI-generation checks reject queued old endpoints, and the first actual movement can initialize a component that did not receive the start event. Neither React state nor timers drive individual animation frames. Input/list instances, the existing safe-area offset and iOS's previously verified RN KAV remain unchanged. This isolates a demonstrated layout inconsistency without claiming the underlying library mechanism was proved.

The new component's 14 boundary tests and ThreadView's 130 tests passed, followed by serial Mobile TypeScript, design checks (228 UI files / 66 checker outcomes, seven app-config and five design-doc checks), documentation checks (seven instruction pairs / five checker cases) and whitespace validation. Two independent source reviews found no remaining required code change. Component SHA-256 is `8d36faf6d789e4b4559470751d2cb7e95c565a6c26677d4d1aaa76651dbcc1c5`; ThreadView is `4bb4d45ae72d62ffef4ab13911431e4d863a2f2363cfedc82b1bfbb9731211ee`. The eight affected source hashes and gate logs are in private `android-synced-padding-gates.json`.

Mocks verify state/identity/boundary semantics, not Fabric commit behavior or visual smoothness. The next frozen device pass must inspect actual intermediate frames, rapid reversal, Send clearing a multiline draft during dismissal, settings/expanded editing and normal navigation. The RN-only candidate's endpoint passes above do not sign off this new implementation. No additional native build, Bridge restart or cloud change was required.

### Android synchronized-padding real motion and single-send verification

The device is now on the frozen 1,184-file Mobile inventory `6b3373108da59e2bc53605f37f4b2bee188b878ed08cda87d37df15293202055`, with the component and ThreadView hashes above unchanged. Two ordinary focus/Back cycles returned to the same dock position without retained padding. Root inspected actual intermediate video frames `504-sync-motion-2100ms.png` / `2200ms` on opening and `5000ms` / `5100ms` on closing: the composer moves with the keyboard instead of remaining covered or leaving the RN-only candidate's large transient blank. These are sampled motion frames, not a claim about every frame's latency or FPS.

One new `CLAUDE_KEYBOARD_SYNC_OK` message was sent from the owned Claude QA thread, followed by Back approximately 127 ms after the Send command began. At `506-sync-send-back-2000ms.png` the cleared composer remains above the partly dismissed keyboard; `2150ms` / `2300ms` reach the correct dock. Screenshot 505 shows the actual final reply and compact settled layout. Independent offline native reconciliation found one input UUID matching the durable receipt run, one client-identity hash key, one final text and one response/request identity, with zero tools. Two `end_turn` JSONL blocks are thinking/text for that same response, not duplicate replies. Evidence: `private/claude-keyboard-sync-native.json` and `private/android-sync-send-back.actions.json`.

The rapid-cycle check inserted only a local draft during opening, dismissed and reopened the keyboard, then cleared the draft without sending. Geometry captured two genuine visibility transitions; root inspected 507's 2200/2800/3150/3300 ms frames, including the second opening with the draft retained above the IME. Final baseline and draft were both zero. These checks cover the real commit overlap that the mock tests could not establish. Settings, expanded editing, normal navigation, background retention and the final iOS pass continue separately; this checkpoint does not close overall acceptance or periodic-path attribution.

The remaining Android layout checks subsequently passed: a 299-character local draft remained exact through expanded editing, model-sheet return, normal Claude → roster → Pi → Claude navigation and a Home/return interval. Root inspected 508–511. The 71,722 ms measurement is Home-command start to readback, an upper bound including actions and observation, not exact time in the background or reconnection latency. Screenshot 511 still says reconnecting with Send disabled; it proves retained draft and correct visible-keyboard layout, **not** completed connection recovery. The normal route closes the keyboard before mounting another chat, so this also is not an arbitrary already-visible-IME mount test.

After clearing the unsent draft, the QA app and recording processes stopped before starting iOS. Four local build/configuration files retained their original SHA-256 values, and eight known fault/reader globals were absent. The 1,184-file Mobile source inventory still matched `6b337310…02055`. Evidence: `private/sync-background-proof.json`, `private/final-cleanup-audit.json`, and `private/android-sync-source-after.json`. These checks do not stop or reset user-owned Agent processes or production connections.

A later readback before force-stop (`private/android-sync-final-before-ios.json`, phone timestamp 08:52:40.121 UTC) has both the active connection and exact Claude view ready, 17 rows, the new user/final once each, no running turn or send error, and the draft cleared. Thus readiness subsequently recovered. The observations are not continuous and do not separately record a successful fresh-history commit; no recovery duration is claimed for this background check.

### Final same-source iOS pagination verification

With Android stopped, the owned iOS simulator loaded the same frozen Mobile source. Native session/project guards confirmed the exact QA A thread. Actual upward scrolling grew the first 31-row projection with `hasMore=true` to 53 unique rows with `hasMore=false`; root inspected screenshot 515 showing the oldest permission conversation. The conversation picker screenshot 514 contains unrelated user titles and is excluded from the owner-facing gallery.

An independent offline audit used the **current** native rollout, rather than reusing the earlier 47-row baseline. It matched all 53 identities: 21 user records, 26 assistant records and six tool records. All 47 nonempty user/assistant text hashes matched, with zero duplicate rendered IDs, duplicate native identities or unmatched rows. A's native rollout hash is unchanged (`005e6791…1964d`); this pass added no native turn. Evidence: `private/ios-final-a-full-history.json`, `private/ios-final-a-full-history-native.json`. This proves complete loaded projection and real pagination, not that every record was on screen simultaneously. The separate B continuation/settings/background checks follow.

### iOS restored draft is present in state but absent from the native editor — new blocker

Before the planned B send, the scope guard found a preserved 77-character local QA draft, but screenshot 516 and the sole native input's accessibility value show an empty editor/placeholder. The Send and expand controls are active, and the shell retains the draft's 112-point height. The read-only projection confirms exactly one focused B ThreadView and Composer: the outer/paste-wrapper value is 77 characters (76 trimmed), while the iOS wrapper's stock TextInput still has the initial empty `defaultValue` and its native text is empty. This is a genuine projection inconsistency, not a hidden-screen reader mismatch. The planned `IOS_CADENCE_FINAL_OK` was **not sent**; the old draft was not cleared to conceal the issue.

The first B metadata in this pass already had the same preserved draft before visiting A, but no native screenshot was captured then. Consequently the evidence does not isolate A→B navigation as its cause; asynchronous cold draft restoration is also in scope. The shared iOS composition-safe external-value handoff is being investigated against the installed RN/Fabric implementation. The installed paste package's iOS path wraps standard RN TextInput; its custom Android command path must not be mistaken for the iOS implementation. Preserve native-owned composing text and the controlled Android path when fixing this.

Evidence: `private/ios-final-b-draft-projection.json`, `private/ios-final-b-composer-preserved.json`, `516-ios-b-preserved-draft.png`, and `private/ios-final-owned-start.json`. The owned simulator, Metro and UI driver were stopped before the repair/test window. QA B's draft and native session are preserved; no extra native turn, source-history mutation or production change occurred.

The minimal repair is confined to the shared composition-safe input hook. A genuine external replacement gets one React commit with `value` and an updated `defaultValue`; the descendant RN TextInput uses its own event-count-aware synchronization before the parent layout effect releases `value`. Subsequent native typing stays uncontrolled. React state tracks the transition so an abandoned render cannot consume it; a current-state check prevents an old effect from releasing a newer replacement, and a native-edit revision preserves editing during handoff. There are no private native commands, remounts, timers, controller/storage changes or native dependency changes. Updating `defaultValue` alone would miss “baseline A → native edit B → restore A”, so this case is explicitly covered.

The first five public-prop contract cases produced three failures on the old implementation. The final eight contract cases, three existing hook cases, six stock/paste-host cases and four bottom-sheet cases passed (21 total). Mobile TypeScript passed after correcting only a new test's ref type. Independent code reviews found no required change. These tests model the installed RN public-prop synchronization contract; they do not establish actual Fabric or IME behavior. Final device validation must restore the exact retained B draft visibly, exercise navigation/clear/typing, and only then send the planned single new QA marker.

### iOS restored-draft repair: actual native input and real continuation passed

The final Mobile inventory contains 1,185 files, aggregate SHA-256 `989d667f923f631eed9f195d3fd3bc3d0536da7db15436b0c2af4748e040f9c6`; the composition-safe hook is `90fe869fce3b06c33913407ab19f9b407f0e5a063763f9b954d388959d180ebf`. Android's controlled branch and synchronized keyboard avoider are unchanged. Tests/builds stopped before the single-worker Metro and owned simulator resumed.

The retained 77-character B draft was not retyped. On cold start it appears in screenshot 518 and the sole native input has the exact same text/value; after actual B → A → B navigation it remains visible in 519, with all projection layers agreeing. Root inspected both. Screenshot 517 was taken while bundling and is not used as a pass. The obsolete empty-input state in 516 remains in the evidence history, but is no longer an open blocker.

Actual screen-key taps produced `ni`, then `nihao`, followed by selecting the system Chinese candidate (521–523). This is a real composition path, not Unicode injected as a substitute for IME testing. Native long-press selection and the system paste command also worked (520, 524–525); the local QA edit text was cleared without sending. Root inspected the composition states, committed candidate and pasted text.

After exact native/session/project/Preview guards, the atomic single-send action submitted `IOS_CADENCE_FINAL_OK` once. Screenshot 526 shows its completed reply and empty native editor; the readback is ready, with one user and one assistant marker, no running turn and no send failure. Independent offline audit `private/ios-cadence-final-native.json` matches one native user, one exact client-ID echo, one receipt with a unique run, one expected final and one successful task completion, with zero tool calls or aborts. Native input was recorded at 09:34:02.819 UTC. The audit proves persisted execution; the phone screenshot independently establishes delivery.

Screenshot 527 reads back GPT-6-Astra, high thinking and Fast in the model settings sheet. B remains the existing workspace-permission test session; this is not an assertion that full access is the default or that all sessions share permissions. Final background and Android handoff observations are recorded separately below.

### Final iOS background, cleanup and acceptance boundary

Screenshot 528 confirms workspace access is selected for B; the model settings still read high/Fast. A new 31-character unsent local draft survived about 42.15 seconds in the background, measured from the app's actual background/active lifecycle events. Root inspected 529: the text remains visible, Send is available and the keyboard/composer layout is intact. The foreground health operation took 548 ms; its success was observed 859 ms after the active event. A new history request started after the foreground event and its successful commit was verified. The request's start is not its completion time, so this is **not** a measured fresh-history recovery duration. Evidence: `private/ios-final-background-proof.json` and the underlying history/settings readbacks.

After clearing the unsent draft, exact B readback is ready, draft length zero, no active run or send error, and the single marker's user/final each occur once. The owned simulator was shut down, Metro exited and port 8081 had no listener before final documentation checks. The root resource check found no booted simulator or test/build/UI-driver process and 72% memory free. The five isolated QA Bridges remain available for the Android acceptance handoff; user-owned production processes were not changed.

The implemented feature candidate can now be evaluated by the owner. This does not establish release readiness: the original Desktop GUI recovery scenario still requires actual-window verification (`HT-CODEX-DESKTOP-0929`), the selective periodic connection stall has not been attributed to a concrete network/proxy/service component, and the earlier transient model/permission display degradation was not reproduced. Unknown-state display/retry was verified separately and must not be presented as that degradation's root-cause fix. No new mandatory source fix was found in the final independent review, but absence of a reproduced fault is not proof of its elimination.

Release preparation also requires the final selected source revision and its CI/package gates; this shared worktree contains unrelated work. Physical-iPhone behavior, real 5 MiB weak-network throughput, battery/cost impact of increased foreground probing, and capacity or competitive superiority were not established. The local 24-stage compatibility pass and scoped native audits remain valid within their stated boundaries. No version bump, distribution build, production deployment or publication was performed.

### Android owner handoff completed

The independent **Clawket QA** app (`com.p697.clawket.connectionqa`, build 30101) is left on QA Codex A. Final screenshot 532, inspected by root, shows the expected replies, normal docked composer and no test draft. The final readback confirms the original native ID, ready state, Full access without pending confirmation, Fast and high thinking. Screenshot 530 verifies local typing and 531 the settings sheet; the local text was cleared without another model request.

This is not merely a cached ready page: a successfully committed history request began at `1790675243832`, after the launch anchor `1790675190038`, and was verified at `1790675369930`. These observations were collected during manual UI checks and are not cold-start latency measurements. The final 1,185-file source inventory still matches `989d667f…0f9c6`; four local build/configuration hashes are unchanged and all eight known fault/reader globals are absent. Evidence: `private/android-owner-handoff-proof.json` and `private/final-cleanup-audit.json`.

One-worker Metro and the five isolated QA Bridges remain running so the owner can use this development app. The owned iOS simulator and automation/recording processes are stopped. Documentation checks passed for seven AGENTS/CLAUDE pairs and five checker tests; `git diff --check` passed. The private gallery includes success and failure comparisons, with stage labels; unrelated user-title screenshots are excluded. No release or production-state change is implied by this handoff.
