# 3.1 会话预览

首页的 Codex、Claude Code、Pi Agent 行应优先显示最近活跃会话的最后一条**可见用户或助手消息**，而不是会话标题或第一条提示词。这三种 Agent 直接显示消息摘要；标题仍在会话面板。旧 Bridge 没有摘要时，Codex/Claude Code 退回标题。OpenClaw/Hermes 的首页文案路径不变。

Bridge 在接受用户发送后更新预览，助手完成后用最后一条非空回复覆盖。工具、系统事件、思考内容不能成为预览；纯图片消息统一用 `📷`。摘要去除常见 Markdown/多余空白，最多 160 个 Unicode 字符，`lastActivityAt` 跟随该消息。`preview` 仍是可选字符串，旧 App 可以忽略。

Codex 原生线程只对最近 12 个读取最多 3 个尾部回合；Claude Code 原生列表只为最近 12 个及最近 8 个 Bridge 持有会话读取历史，按原生更新时间缓存，不在每次 `sessions.list` 重读。Claude 小于等于 8 MiB 的会话沿用官方 SDK 的历史投影；更大的原生 JSONL 只读最后 4 MiB，并忽略工具和子代理记录，避免首页为百兆级转录全量解析。尾部找不到可见消息时退回标题。Pi 原生会话复用现有的有界 JSONL 解析。原生读取失败只丢失该会话的摘要，不中断整个列表。Claude Code 的实时摘要只保存在内存里，不把原生转录写入 Clawket 元数据。
