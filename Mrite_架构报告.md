# Mrite v2.1 软件架构报告

## 一、整体架构概览

Mrite 是一个基于 **Electron** 的桌面应用，核心功能是**自动化数学建模论文生成**。它通过内嵌的 **Claude Agent SDK**（`@anthropic-ai/claude-agent-sdk`）调用 AI 模型，在本地工作区内自动完成：读题 → 求解 → 编写论文 → 编译 PDF 的全流程。

```
┌──────────────────────────────────────────────────────────────────┐
│                        Electron 主进程                            │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ auth-service│  │ task-service  │  │    api-proxy           │  │
│  │ (激活/心跳) │  │ (核心执行引擎)│  │ (Anthropic↔OpenAI转译) │  │
│  └─────────────┘  └──────┬───────┘  └────────────────────────┘  │
│                          │                                       │
│  ┌──────────┐  ┌─────────▼─────────┐  ┌───────────────────┐    │
│  │ workspace │  │ Claude Agent SDK  │  │  process-manager  │    │
│  │ (工作区)  │  │ → claude.exe 子进程│  │  (进程管理/清理)  │    │
│  └──────────┘  └───────────────────┘  └───────────────────┘    │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ python-env│  │ latex-env │  │ database │  │ file-service │   │
│  │ (内置Py) │  │(内置TeX) │  │ (SQLite) │  │ (文件I/O)    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                              │ IPC (contextBridge)
┌──────────────────────────────────────────────────────────────────┐
│                        Electron 渲染进程                          │
│                                                                  │
│  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐   │
│  │ Dashboard │  │ Task Panel│  │View Panel│  │Settings    │   │
│  │ (首页统计)│  │(任务执行) │  │(结果查看)│  │(配置管理)  │   │
│  └───────────┘  └───────────┘  └──────────┘  └────────────┘   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ agent-events.js (接收 Claude 实时事件流 → 更新 UI)         │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 二、核心执行流程：从用户点击"运行"到生成论文

### 2.1 用户操作阶段

```
用户上传题目文件（PDF/图片）+ 数据文件（Excel/CSV）
    ↓
点击「继续」按钮触发 Mrite.onRun()
    ↓
前端收集参数：API 配置 + 项目路径 + 输出路径
    ↓
调用 window.electronAPI.launchTask(projectPath, apiConfig)
```

### 2.2 主进程启动阶段

```
task-handlers.js 路由 → taskService.launch(opts)
    ↓
验证 API 配置（baseURL, apiKey, model）
    ↓
判断 API 格式：Anthropic 原生 or OpenAI 兼容？
    ├── Anthropic (api.anthropic.com / /anthropic): 直连
    └── OpenAI 格式 (DeepSeek/Kimi/GLM 等): 启动本地代理 (port 3456)
    ↓
创建/恢复工作区目录（时间戳命名）
    ├── 题目/     ← 用户上传的题目文件
    ├── 数据/     ← 用户上传的数据文件
    ├── 求解/     ← AI 生成的代码和结果
    └── 论文/     ← AI 生成的 LaTeX 论文
    ↓
预读输入文件（PDF→文本, Excel→CSV摘要）
    ↓
启动文件监听器（实时推送新生成的图片/表格）
    ↓
构建 Prompt 并调用 Claude Agent SDK
```

### 2.3 Claude Agent SDK 调用

这是整个系统的核心。Mrite 使用 `@anthropic-ai/claude-agent-sdk` 的 `query()` 函数：

```javascript
const { query } = await import('@anthropic-ai/claude-agent-sdk');

const q = query({
  prompt: effectivePrompt,    // 系统提示 + 用户指令
  options: {
    model: 'deepseek-v4-pro', // 用户选择的模型
    cwd: workDir,             // 工作目录（AI 在此执行命令）
    pathToClaudeCodeExecutable: 'claude.exe',  // 内置 Claude CLI
    
    // 环境变量注入
    env: {
      ANTHROPIC_BASE_URL: apiConfig.baseURL,
      ANTHROPIC_API_KEY: apiConfig.apiKey,
      ANTHROPIC_MODEL: apiConfig.model,
      HOME: isolatedHome,     // 隔离的 Claude 配置目录
      PATH: effectivePath,    // Python + LaTeX + 系统路径
    },
    
    // 权限与限制
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    maxTurns: 2000,           // 最大对话轮数
    abortController: _ac,     // 外部终止控制
    includePartialMessages: true,  // Token 级流式输出
    toolConfig: { bash: { timeout: 600000 } }, // Bash 工具 10 分钟超时
  },
});
```

**关键设计点：**
- `cwd` 设为工作目录，AI 执行的所有 shell 命令都在此目录下
- `permissionMode: 'bypassPermissions'` — 跳过所有权限确认，全自动执行
- `pathToClaudeCodeExecutable` — 指向内置的 `claude.exe`（位于 `app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/`）
- 环境隔离：用独立的 HOME 目录，避免读取系统 `~/.claude/` 登录凭证

### 2.4 消息流式处理

SDK 返回 async iterable，主进程逐条处理并转发给渲染进程：

```
for await (const msg of q) {
    ├── stream_event (token 增量)
    │   └── text_delta / thinking_delta → send('stream_text')
    │
    ├── assistant (完整消息)
    │   ├── text block → send('text')
    │   └── tool_use block → send('tool_use') + 记录步骤
    │
    ├── user (工具执行结果)
    │   └── tool_result → send('tool_result')
    │       └── 检测 ModuleNotFoundError → 自动 pip install
    │
    ├── result (任务完成)
    │   └── send('done') + 获取 token 用量 + 保存历史
    │
    └── system (系统事件)
        ├── compact_boundary → 上下文压缩通知
        └── session_id → 保存用于恢复会话
}
```

### 2.5 渲染进程实时展示

```
agent-event IPC 消息 → Mrite.handleAgentEvent()
    ├── stream_text → 逐字渲染到聊天面板（16ms 防抖）
    ├── tool_use → 记录步骤列表 + 更新进度条
    ├── tool_result → 显示执行结果（代码输出）
    ├── file_update → 实时展示新图片/表格（左右翻页画廊）
    ├── done → 保存工作区状态 + 显示完成对话框
    └── error → 显示错误提示 + 建议重试
```

---

## 三、API 代理系统（api-proxy.js）

当用户使用非 Anthropic 格式的 API（如 DeepSeek、Kimi、GLM 等 OpenAI 兼容接口），Mrite 会在本地启动一个 HTTP 代理服务器进行协议转译：

```
Claude Agent SDK (Anthropic 格式)
    ↓ POST /v1/messages
本地代理 127.0.0.1:3456
    ↓ 转译请求格式 (anthropicToOpenAIRequest)
目标 API (OpenAI 格式, 如 api.deepseek.com)
    ↓ 接收响应
本地代理
    ↓ 转译响应格式 (openAIToAnthropicResponse)
Claude Agent SDK
```

**流式支持：** 代理同时处理 SSE 流式响应，使用 `AnthropicStreamEncoder` 将 OpenAI 的 `data: {...}` 格式实时转换为 Anthropic 事件格式。

---

## 四、工作区与项目系统

### 4.1 目录结构

```
userData/                         (应用数据目录)
├── projects/                     (项目模板)
│   ├── 数模模板A/               (可加密为 .mrtpl)
│   │   ├── CLAUDE.md            (★ AI 执行流程规范)
│   │   ├── 题目/
│   │   ├── 数据/
│   │   ├── 求解/
│   │   └── 论文/
│   └── 数模模板B/
├── workspace/                    (运行时工作区)
│   ├── 任务1_2026-07-23_14-30-45/
│   │   ├── .mrite-ws.json      (工作区状态)
│   │   ├── CLAUDE.md           (从模板复制)
│   │   ├── 题目/题目内容.txt   (预读文本)
│   │   ├── 数据/数据摘要.txt   (预读摘要)
│   │   ├── 求解/              (AI 生成)
│   │   │   ├── 问题1/
│   │   │   │   ├── solve.py
│   │   │   │   └── result.png
│   │   │   └── 问题2/
│   │   └── 论文/              (AI 生成)
│   │       ├── main.tex
│   │       └── main.pdf
│   └── 任务2_2026-07-23_16-00-00/
├── data/                         (SQLite 数据库)
│   └── mrite.db
└── .claude-home/                 (隔离的 Claude Code 配置)
```

### 4.2 工作区状态文件 (.mrite-ws.json)

```json
{
  "status": "running|completed|error|modify",
  "inputLoaded": true,
  "projectTemplate": "数模模板A",
  "createdAt": "2026-07-23T14:30:45Z",
  "runStartedAt": "2026-07-23T14:31:00Z",
  "runCompletedAt": "2026-07-23T15:20:00Z",
  "taskType": "solve",
  "model": "deepseek-v4-pro",
  "sessionId": "sess_abc123",        // ★ 用于恢复会话
  "currentStage": "writing",
  "durationMs": 2940000,
  "inputTokens": 150000,
  "outputTokens": 85000,
  "steps": [...],
  "fileOps": [...],
  "chatHistory": [...]
}
```

### 4.3 会话恢复机制

当任务中断（API 错误、网络断开、用户暂停）后可恢复：

1. **SDK 级恢复（优先）：** 保存 `sessionId`，下次传入 `resume: sessionId`，SDK 自动恢复上下文
2. **手动上下文恢复（降级）：** 读取 `steps`、`fileOps`、`chatHistory`，拼接为恢复提示词
3. **文件恢复：** 中断前的所有文件保留在工作区，AI 通过 `ls` 命令自动发现已有进度

---

## 五、CLAUDE.md — AI 的执行规范

每个项目模板包含 `CLAUDE.md`，这是 Claude Agent SDK 的项目级指令文件。AI 在工作目录中读取此文件后按照其中的流程执行：

**典型内容（推测）：**
- 读题流程：先读 `题目/` 下的所有文件，理解题意
- 求解流程：分问题创建子目录，编写 Python 代码求解
- 论文流程：按学术论文规范撰写 LaTeX，包含摘要/建模/求解/结论
- 编译要求：使用 XeLaTeX 编译，确保 PDF 生成成功
- 约束规则：不访问工作区外路径、中文交流、禁止删除输入文件

Mrite 在运行前还会向 `CLAUDE.md` 注入赛题信息（队伍编号、题号、学校等）。

---

## 六、内置环境

### 6.1 Python 环境
- 内置完整 Python（位于 `assets/python-env/`）
- 自动检测缺少的库并 `pip install`
- 支持手动安装包（设置页）
- PATH 优先级最高，避免调用系统 Python

### 6.2 LaTeX 环境（TinyTeX）
- 内置 TinyTeX（XeLaTeX 引擎）
- 位于 `assets/tinytex/`
- 过滤系统 PATH 中的外部 TeX 安装
- 编译命令：`xelatex -interaction=nonstopmode -halt-on-error`

### 6.3 Claude Code 可执行文件
- 位于 `app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe`
- 这是 Claude Agent SDK 的本地 CLI，负责实际与 AI 模型通信
- Mrite 通过 SDK 的 `query()` API 启动它为子进程

---

## 七、数据持久化

| 存储位置 | 内容 |
|---------|------|
| SQLite (mrite.db) | 设置、任务日志、文件操作记录、历史列表、用量统计 |
| localStorage | 活动模型索引、快速设置缓存、系统配置完成标记 |
| .mrite-ws.json | 工作区状态、聊天历史、进度、session ID |
| ~/.mrite-machine-code | 机器唯一标识（SHA256 前16位） |
| ~/.mrite-pending-report.json | 离线时暂存的上报数据 |

---

## 八、修改模式

除了自动求解，Mrite 还支持"修改模式"——用户可以通过对话指令修改已生成的论文：

```
用户输入："把问题2的图表标题改成英文"
    ↓
构建修改模式 Prompt（包含最近聊天历史作为上下文）
    ↓
Claude 在工作区内定位文件 → 修改 → 编译检查
    ↓
结果实时显示在聊天面板
```

**特殊处理：**
- 检测到"重新编译"类指令时，直接调用本地 XeLaTeX 编译，不经过 AI
- 修改模式最大轮数 500（vs 求解模式 2000）
- 禁止修改 `题目/` 和 `数据/` 目录

---

## 九、超时与安全机制

| 机制 | 配置 | 作用 |
|------|------|------|
| 总超时 | 12 小时 | 防止任务无限运行 |
| 无响应超时 | 1 小时 | 检测 AI 卡死 |
| 工具超时 | 3 小时 (3×stuck) | 长时间运行的 bash 命令 |
| Bash 单次超时 | 10 分钟 | 单个 shell 命令 |
| 最大轮数 | 2000 (求解) / 500 (修改) | 防止无限循环 |
| 路径白名单 | workspace/project/output/Desktop/Documents | 防止越权访问 |
| 进程清理 | 退出时 killAll + killOrphans | 防止僵尸进程 |

---

## 十、完整调用链路图

```
[用户] 上传文件 + 点击运行
    ↓
[renderer/toolbar.js] Mrite.onRun()
    ↓ electronAPI.launchTask(projectPath, apiConfig)
[preload.js] IPC invoke 'launch-task'
    ↓
[src/ipc/task-handlers.js] ipcMain.handle('launch-task')
    ↓
[src/services/task-service.js] launch(opts)
    ├── 验证配置
    ├── 检测 API 格式 → 启动代理（如需）
    ├── 准备工作区
    ├── 预读输入文件
    ├── 注入赛题信息到 CLAUDE.md
    ├── 启动文件监听器
    └── _run()
        ↓
    [Claude Agent SDK] query({ prompt, options })
        ↓ 启动 claude.exe 子进程
    [claude.exe] 连接 API → 执行多轮对话
        ├── 读取 CLAUDE.md 规范
        ├── 读题 (Read 工具)
        ├── 编写求解代码 (Write 工具)
        ├── 运行代码 (Bash 工具 → python)
        ├── 生成图表
        ├── 撰写论文 (Write .tex)
        ├── 编译 PDF (Bash → xelatex)
        └── 自检和修复
        ↓ 流式消息
    [task-service.js] for await (msg of q)
        ↓ win.webContents.send('agent-event')
    [preload.js] → onAgentEvent callback
        ↓
    [renderer/agent-events.js] handleAgentEvent()
        ├── 更新聊天面板（逐字显示）
        ├── 更新步骤列表
        ├── 更新进度条
        ├── 显示实时图片/表格
        └── 任务完成 → 保存历史
```

---

## 十一、支持的 API 供应商

| 供应商 | 格式 | 默认模型 | 端点 |
|--------|------|---------|------|
| DeepSeek | Anthropic | deepseek-v4-pro | api.deepseek.com/anthropic |
| 小米 MiMo | OpenAI | mimo-v2.5-pro | (自定义) |
| Kimi | OpenAI | kimi-k2 | api.moonshot.cn/v1 |
| 智谱 GLM | OpenAI | glm-4-plus | open.bigmodel.cn/api/paas/v4 |
| OpenAI | OpenAI | gpt-4.1 | api.openai.com/v1 |
| Claude | Anthropic | claude-sonnet-4 | api.anthropic.com |
| Gemini | OpenAI | gemini-2.5-flash | generativelanguage.googleapis.com |
| Grok | OpenAI | grok-3 | api.x.ai/v1 |
| 自定义 | auto | (用户填写) | (用户填写) |

**格式检测逻辑：**
- URL 含 `api.anthropic.com` 或 `/anthropic` → Anthropic 格式直连
- 用户手动选择 `apiFormat: 'anthropic'` → 直连
- 其他 → 启动本地代理转译为 OpenAI 格式

---

## 十二、关键文件索引

| 文件路径 | 职责 |
|---------|------|
| `main.js` | Electron 主入口，窗口管理，安全加固 |
| `preload.js` | IPC 桥接，暴露 90+ API 给渲染进程 |
| `src/services/task-service.js` | **核心：任务执行引擎，调用 Claude SDK** |
| `src/services/api-proxy.js` | Anthropic↔OpenAI 协议转译代理 |
| `src/services/auth-service.js` | 激活验证/心跳/上报 |
| `src/core/workspace.js` | 工作区生命周期管理 |
| `src/core/python-env.js` | 内置 Python 环境管理 |
| `src/core/latex-env.js` | 内置 TinyTeX 管理 |
| `src/core/process-manager.js` | 子进程追踪与清理 |
| `src/core/config.js` | 全局配置常量 |
| `src/ipc/task-handlers.js` | 任务相关 IPC 路由 |
| `src/ipc/file-handlers.js` | 文件操作 IPC |
| `src/ipc/project-handlers.js` | 项目/历史/编译 IPC |
| `renderer/agent-events.js` | 接收 AI 事件流 → 更新 UI |
| `renderer/toolbar.js` | 运行控制（开始/暂停/终止） |
| `renderer/panels/upload.js` | 文件上传 |
| `renderer/panels/modify.js` | 修改模式聊天 |
| `renderer/panels/view.js` | 结果文件浏览 |
| `renderer/panels/settings.js` | 配置管理 |
| `renderer/panels/dashboard.js` | 首页统计/公告 |
