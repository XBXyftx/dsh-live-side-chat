# 实时侧边对话（`dsh-live-side-chat`）

> 中文 | [English](README.md)

给 DeepSeek Harness 加上 **Codex 风格的侧边对话**：在右侧栏里开一条**全新的空会话**，实时跟随当前会话的进展，边工作边问「现在进展如何」「刚才那个结论确认一下」，不打断主会话；关闭标签页即销毁。

它**不是**分支（fork）：侧边对话从不复制主会话的历史，而是从空开始、读取实时摘要。

- **空会话开始**：创建子会话时不传 `seed`、不设 `isSeeded`，标签页打开就是一条真正的空对话；随时可以创建，不再要求主会话先完成一轮。
- **实时摘要，不是日志拷贝**：侧边对话通过插件自己的有界 `sideChatDigest` 会话投影了解主会话，并在每一步重新读取、作为运行时上下文注入。创建之后发生的工作也看得见；摘要天然是片段，模型会先用只读工具核实细节再下结论。
- **只读**：侧边会话跑在只读沙箱里（`sandbox/mode: read-only` + 审批策略 `never` + 工具守卫），只能查询、不能改文件。守卫拦的是**会改变状态的工具**：写文件类（`write`/`edit` 等）、常驻 shell（`terminal`）、后台任务（`job_*`），并按参数拒绝 `run_in_background` 与任何 `sandbox_permissions` 升级。**一次性 shell 查询（`ls`、`git log`）放行**——文件写入本来就由只读沙箱拒绝；`run_code` 也放行，因为 PTC 预设下它是唯一可直接调用的传输。程序内部调用的写类工具仍走同一守卫。这里的"只读"指**没有文件效果**：沙箱这一层不管网络与进程存活，所以 shell 查询可以访问网络；把 `allowShellQueries` 设为 `false` 可以收紧为"只用插件自带只读工具"。
- **临时**：侧边会话在左侧会话列表里**隐藏**，只活在右侧栏；关闭标签页会确认，确认后销毁（Agent 释放 + 会话文件删除）。
- **不打扰**：主会话照常工作；侧边对话随时读取主会话的实时进展，只有在你明确要求或确有必要时，才会把结论作为**后续轮次**排给主会话（不会打断当前轮）。

## 功能

| 能力 | 说明 |
|---|---|
| 侧边栏入口 | 右侧栏引导页新增「侧边对话」入口 |
| `/btw` | 在输入框输入 `/btw` 直接拉起侧边对话 |
| 空会话开始 | 子会话不继承任何历史，标签页打开就是一条真正的空对话 |
| 实时摘要 | `sideChatDigest` 投影：目标、每轮一行、当前轮、任务清单、最近工具、计数器，有界且逐条截断 |
| 实时上下文 | 每一步重新读取并作为运行时上下文注入；创建之后发生的工作也可见 |
| 状态条 | 主会话标题、运行/空闲圆点、第 N 轮、任务进度、最新工具、相对活动时间、当前轮提问 |
| 背景摘要 | 状态条里的折叠面板，展开即是模型读到的原文（与注入共用同一渲染函数） |
| 空会话引导 | 插件自有的引导卡：`已连接主会话「<title>」` + 三个快捷问题 |
| 输入框 | 位于面板底部，样式与主对话输入框一致：同一套浮起圆角卡片、只读胶囊与 34px 圆形发送按钮 |
| 模型胶囊 | 显示下一步请求将使用的模型，点开可列出当前 Host 能路由的全部模型（按 provider 分组）；切换只影响侧边对话下一轮，不影响主会话 |
| 只读工具 | `side_chat_main_status`（最新摘要 + 运行/空闲）与 `side_chat_main_history`（`turn` / `contains` 过滤，有界，真实日志行） |
| 结果汇报 | `side_chat_report` 把结论排给主会话；可在设置面板关闭 |
| 关闭确认 | 「关闭侧边聊天？」弹窗 + 「不再询问」；取消则重新打开标签页 |
| 关闭销毁 | 释放 Agent 并删除该会话的 JSONL 目录；删除结果经持久化层校验后才报告成功 |

## 安装

```sh
dsh plugin add dsh-live-side-chat
```

或从本地目录安装（开发时）：

```sh
dsh plugin add /absolute/path/to/dsh-side-chat
```

装好后刷新 Web 页面；插件卡片会出现在设置 → 插件列表里。

## 使用

1. 在左侧选中一个会话（侧边对话属于**当前打开的会话**）。
2. 打开右侧栏，点引导页里的「侧边对话」；或直接在输入框输入 `/btw`。
3. 标签页以空对话打开，上方是一条实时状态条：主会话标题、运行/空闲圆点、第 N 轮、任务进度、最新工具、相对活动时间，以及当前轮的提问。
4. 在右侧输入你的问题。侧边对话每一步都会重新读取主会话摘要，所以创建之后发生的工作也能看到；细节会用 `side_chat_main_status` / `side_chat_main_history` 核实。
5. 想确认它「知道什么」，展开状态条里的「背景摘要」，看到的就是模型读到的原文。
6. 想让它把结论交给主会话时，直接说「把这个结论告诉主会话」。
7. 关闭标签页 → 弹出确认框 → 确认后该侧边对话被销毁。

## 设置

右侧栏面板 →「侧边对话」：

- **允许向主会话发送消息**（默认开启）：关闭后，`side_chat_report` 会被拒绝，侧边对话只能本地回答。

插件行还支持这些部署配置（`cordis.patch.yml` / profile 里覆盖 `side-chat` 行）：

| 字段 | 默认 | 含义 |
|---|---|---|
| `readOnly` | `true` | 侧边对话是否强制只读 |
| `allowShellQueries` | `true` | 是否允许一次性 shell 查询（`bash`/`pwsh`）；关闭后只能用插件自带只读工具 |
| `allowReportToMain` | `true`（volatile） | 是否允许向主会话汇报；可在设置面板修改 |
| `liveContext` | `true` | 是否把主会话摘要作为运行时上下文注入每一步；关闭后只剩按需调用的状态工具 |
| `digestTurns` | `12`（4–60） | 摘要保留的已结束主会话轮次数量 |
| `historyEventLimit` | `40`（5–200） | 一次历史读取最多返回的主会话日志行数 |
| `preset` | `""` | 侧边对话使用的 Agent preset；空表示继承主会话 |
| `sessionsRoot` | `""` | 会话存储根目录，仅用于销毁时删除文件；空表示 `$DSH_HOME/sessions` |

## 实现要点（给维护者）

```text
主会话（你正在工作的会话）
    │  每条已提交事件 → 纯增量折叠（有界）
    ▼
sideChatDigest（会话投影，由投影缓存持久化）
    ├── 每一步重读的运行时上下文 ──▶ 侧边对话的模型
    └── Host 全局控制流 ──────────▶ 右侧栏状态条
```

- **一次折叠，三方消费**：摘要就是一个普通的 `sideChatDigest` 会话投影（`src/digest.ts`）：框架在每条已提交事件上增量折叠，投影缓存负责持久化，Host 全局控制流把它推给浏览器，所以模型、状态条和重启恢复读的是同一份状态。
- **有界折叠**：每个会话只保留首个用户提问（`goal`）、最近若干已结束轮次（提问、最终回复、工具数、错误数；`digestTurns`，4–60）、当前轮（提问、步数、最新助手文本、最近工具调用、错误数、开始时间）、最新一份任务清单、最近工具调用、最近错误、单调计数器与 `lastActivityAt`。所有字符串都会截断，所有数组都有上限。
- **作为实时上下文注入**：子会话注册 `systemPrompt.context({ name: 'side-chat:main-digest', order: 220, text: () => ... })`，每一步同步重读主会话摘要，并渲染成「Main session live digest (partial; verify any detail with the side_chat_main_history or side_chat_main_status tool before asserting it)」块。创建之后发生的工作因此可见——这正是 fork 做不到的。
- **提示词纪律**：`side-chat:role` 段落会说明摘要只是片段、不是日志，模型必须先调用只读工具核实，才能断言「已完成」「文件已改」「错误已修」。
- **Host 侧**（`src/`）：用 `ctx.agents.create(...)` 创建隐藏子会话，不传 `seed`、不设 `isSeeded`，所以对话从空开始；`setup` 里挂载主会话的 preset，注册角色提示词、摘要上下文、三个工具与只读守卫，并写入 `sandbox/mode`、`approval/policy`、`subagent/descriptor`。
  - 为什么必须有 `subagent/descriptor`：Web 端对 `origin: 'subagent'` 的会话会拒绝普通历史读取，只有带 descriptor 投影的子会话才能通过 `subagent` 路由读取历史。
  - 为什么自建输入框：一旦子会话带上 subagent 地址，内置输入框会把 prompt 路由到 subagent 投递（需要父会话激活），因此侧边对话用自己的 Connection RPC 通道 `ask` 把消息直接投进子 Agent 的 inbox。
- **Client 侧**（`client/client.js`）：两种标签页（草稿页 / 会话页）、资源提供者（retain 会话）、带「背景摘要」面板的实时状态条、插件自有的空会话引导卡（替代 dsh 共享的空白首屏，因为那套工作区装饰不适用于侧边对话）、`conversation.composer` 链条目（替换输入框）、`shell.overlay` 关闭确认弹窗、`/btw` 客户端命令、设置面板。
- **通信**：第三方插件无法生成 Typert Remote，Connection 的通用通道又会把路由归属到服务自身上下文，因此本插件直接在 Host Web 服务器上挂一条受鉴权保护的 `POST /side-chat/<endpoint>` 路由（`create` / `ask` / `digest` / `interrupt` / `destroy`；`connection.requestRejection` 做 Host/Origin 与浏览器凭据校验），明文 JSON、仅本机 owner 可达。
- **重启恢复**：摘要由投影缓存持久化，重启后侧边对话及其「背景摘要」面板会被恢复。

## 为什么摘要不在聊天记录里

dsh 有意在聊天记录里隐藏普通的运行时上下文行：ui-chat 的 `isVisibleChatNode` 会排除 `kind === 'context'`，除非该行携带工具变更。摘要正是以这种上下文行注入的，所以它**不会**出现在聊天记录里。

状态条里的「背景摘要」面板是用户查看它的受支持方式：它由 `/side-chat/digest` RPC 端点提供，并且和注入共用同一个渲染函数，所以面板内容不会与模型读到的内容漂移。这些渲染快照会累积在侧边对话自己的历史里（dsh 采用追加而不是替换），但只在侧边对话自身运行时发生。

## 已知限制

- 进程崩溃或强制退出时，可能留下尚未销毁的 `session-side-chat-*` 会话目录：启动时不会自动清理隐藏会话，需要手动删除。
- 关闭确认是「先关闭、后确认」：右侧栏没有标签页关闭否决钩子，关闭后弹窗；点「取消」会把标签页重新打开（会有一瞬的关闭/重开）。
- 摘要是「有界摘要」而非日志：字符串有截断、数组有上限、更早的轮次每轮只有一行，且不含工具结果、文件内容和大部分中间步骤；细节必须靠只读工具核实。
- 销毁依赖会话目录布局（`$DSH_HOME/sessions/<projectKey>/<sessionId>/`）。换用非 JSONL 持久化后端或自定义根目录时，需通过 `sessionsRoot` 配置；删除结果会经 `sessionPersistence.stat()` 校验，失败会在弹窗里如实报错。
- 侧边对话复用宿主 `subagent` 的 descriptor 语义属于「借用机制」：上游升级 descriptor 版本时需同步。基线 dsh `0.2.1-rc.2`（commit `687f282e`）。
- `sandbox/mode: read-only` 只保证写不进去；`bash` 仍可执行只读命令。
- 插件依赖 `webServer` 与 `connection`，只适用于 Web/桌面端部署；headless 等无 Web 服务的 profile 不会激活 Host 半。

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build    # 产出 lib/，供 dsh plugin add 安装
```

## 许可证

MIT © 2026 XBXyftx
