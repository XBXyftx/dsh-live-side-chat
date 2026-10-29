# 侧边对话（Side Chat）

> 中文 | [English](README.md)

给 DeepSeek Harness 加上 **Codex 风格的侧边对话**：在右侧栏里开一条当前会话的**临时只读分支**，边工作边问「现在进展如何」「刚才那个结论确认一下」，不打断主会话；关闭标签页即销毁。

它和「分支 / fork」不完全一样：

- **共享上下文**：创建时把主会话已完成的轮次复制给侧边会话（和 fork 同一套种子），所以它知道你之前做过什么。
- **只读**：侧边会话跑在只读沙箱里（`sandbox/mode: read-only` + 审批策略 `never` + 工具守卫），只能查询、不能改文件。
- **临时**：侧边会话在左侧会话列表里**隐藏**，只活在右侧栏；关闭标签页会确认，确认后销毁（Agent 释放 + 会话文件删除）。
- **不打扰**：主会话照常工作；侧边对话可以按需读取主会话**创建之后**的新进展，只有在你明确要求或确有必要时，才会把结论作为**后续轮次**排给主会话（不会打断当前轮）。

## 功能

| 能力 | 说明 |
|---|---|
| 侧边栏入口 | 右侧栏引导页新增「侧边对话」入口 |
| `/btw` | 在输入框输入 `/btw` 直接拉起侧边对话 |
| 上下文共享 | 以主会话最近一个已完成轮次为切点复制历史 |
| 只读 | 沙箱只读 + 审批关闭 + 写类工具守卫（三层） |
| 进展查询 | 内置 `side_chat_progress` 工具，读取主会话创建之后的新事件（用户请求、助手回复、工具调用、任务清单） |
| 结果汇报 | 内置 `side_chat_report` 工具，把结论排到主会话的后续轮次；可在设置面板关闭 |
| 关闭确认 | 「关闭侧边聊天？」弹窗 + 「不再询问」记忆；取消则重新打开标签页 |
| 关闭销毁 | 释放 Agent 并删除该会话的 JSONL 目录；删除结果经持久化层校验后才报告成功 |

## 安装

```sh
dsh plugin add dsh-side-chat
```

或从本地目录安装（开发时）：

```sh
dsh plugin add /absolute/path/to/dsh-side-chat
```

装好后刷新 Web 页面；插件卡片会出现在设置 → 插件列表里。

## 使用

1. 在左侧选中一个会话（侧边对话属于**当前打开的会话**）。
2. 打开右侧栏，点引导页里的「侧边对话」；或直接在输入框输入 `/btw`。
3. 在右侧输入你的问题。侧边对话能看到主会话到此为止的历史，也能用 `side_chat_progress` 拉取之后的进展。
4. 想让它把结论交给主会话时，直接说「把这个结论告诉主会话」。
5. 关闭标签页 → 弹出确认框 → 确认后该侧边对话被销毁。

## 设置

右侧栏面板 →「侧边对话」：

- **允许向主会话发送消息**（默认开启）：关闭后，`side_chat_report` 会被拒绝，侧边对话只能本地回答。

插件行还支持这些部署配置（`cordis.patch.yml` / profile 里覆盖 `side-chat` 行）：

| 字段 | 默认 | 含义 |
|---|---|---|
| `readOnly` | `true` | 侧边对话是否强制只读 |
| `allowReportToMain` | `true`（volatile） | 是否允许向主会话汇报 |
| `progressEventLimit` | `60` | 一次进度读取最多返回的事件条数 |
| `preset` | `""` | 侧边对话使用的 Agent preset；空表示继承主会话 |
| `sessionsRoot` | `""` | 会话存储根目录，仅用于销毁时删除文件；空表示 `$DSH_HOME/sessions` |

## 实现要点（给维护者）

- **Host 侧**（`src/`）：用 `ctx.agents.create({ seed, inheritedEventCount, meta: { origin: 'subagent', parentSession, isSeeded: true }, setup })` 创建隐藏子会话；`setup` 里挂载主会话的 preset、注册只读守卫与两个工具、写入 `sandbox/mode`、`approval/policy`、`subagent/descriptor`。
  - 为什么必须有 `subagent/descriptor`：Web 端对 `origin: 'subagent'` 的会话会拒绝普通历史读取，只有带 descriptor 投影的子会话才能通过 `subagent` 路由读取历史。
  - 为什么自建输入框：一旦子会话带上 subagent 地址，内置输入框会把 prompt 路由到 subagent 投递（需要父会话激活），因此侧边对话用自己的 Connection RPC 通道 `ask` 把消息直接投进子 Agent 的 inbox。
- **Client 侧**（`client/client.js`）：两种标签页（草稿页 / 会话页）、资源提供者（retain 会话）、`conversation.composer` 链条目（替换输入框）、`shell.overlay` 关闭确认弹窗、`/btw` 客户端命令、设置面板。
- **通信**：第三方插件无法生成 Typert Remote，Connection 的通用通道又会把路由归属到服务自身上下文，因此本插件直接在 Host Web 服务器上挂一条受鉴权保护的 `POST /side-chat/<endpoint>` 路由（`connection.requestRejection` 做 Host/Origin 与浏览器凭据校验），明文 JSON、仅本机 owner 可达。

## 已知限制

- 关闭确认是「先关闭、后确认」：右侧栏没有标签页关闭否决钩子，关闭后弹窗；点「取消」会把标签页重新打开（会有一瞬的关闭/重开）。
- 销毁依赖会话目录布局（`$DSH_HOME/sessions/<projectKey>/<sessionId>/`）。换用非 JSONL 持久化后端或自定义根目录时，需通过 `sessionsRoot` 配置；删除结果会经 `sessionPersistence.stat()` 校验，失败会在弹窗里如实报错。
- 应用重启后，旧的侧边对话会话仍以隐藏会话形式留在磁盘上；再次 `/btw` 会创建新的侧边对话（旧的不再出现在界面里）。
- 侧边对话复用宿主 `subagent` 的 descriptor 语义属于「借用机制」：上游升级 descriptor 版本时需同步。基线 dsh `0.2.1-rc.2`（commit `687f282e`）。
- 插件依赖 `webServer` 与 `connection`，只适用于 Web/桌面端部署；headless 等无 Web 服务的 profile 不会激活 Host 半。
- `sandbox/mode: read-only` 只保证写不进去；`bash` 仍可执行只读命令。

## 开发

```sh
npm install
npm run typecheck
npm test
npm run build    # 产出 lib/，供 dsh plugin add 安装
```

## 许可证

MIT © 2026 XBXyftx
