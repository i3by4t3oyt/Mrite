# Mrite v2.2

数学建模论文 AI 自动生成桌面应用，基于 Electron + Claude AI。

## 功能特性

- AI 驱动的数学建模论文自动生成
- 支持多种 AI 提供商（Claude、GPT、DeepSeek、通义千问等）
- 内置 LaTeX 编译环境（TinyTeX）
- 内置 Python 运算环境
- 项目模板管理（华数杯、高教社杯等）
- 实时进度展示与任务控制
- 历史记录管理

## 项目结构

```
mrite-v2/
├── main.js                 # Electron 主进程入口
├── preload.js              # 渲染进程预加载桥接
├── package.json            # 项目配置
├── src/                    # 主进程后端代码
│   ├── core/               # 核心模块（配置、窗口、数据库、工作区）
│   ├── ipc/                # IPC 通信处理器
│   └── services/           # 业务服务层（API代理、任务、认证）
├── renderer/               # 渲染进程前端代码
│   ├── index.html          # 主页面
│   ├── panels/             # UI 面板组件
│   └── styles/             # 样式文件
├── projects/               # 项目模板
└── assets/                 # 静态资源（图标、配置）
```

## 开发环境

### 前置要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 开发模式运行

```bash
npm run dev
```

### 生产模式运行

```bash
npm start
```

## 构建打包

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

构建产物输出在 `dist/` 目录。

## 运行时环境

打包时需要在 `assets/` 下准备：

- `assets/TinyTeX/` — TinyTeX LaTeX 发行版（按平台准备）
- `assets/python-env/` — 嵌入式 Python 环境（含 `python-requirements-base.txt` 中的依赖）

## 技术栈

- **框架**: Electron
- **后端**: Node.js + better-sqlite3
- **前端**: 原生 HTML/CSS/JS + Tailwind CSS
- **AI**: Anthropic Claude SDK / OpenAI 兼容接口
- **排版**: XeLaTeX (TinyTeX)
- **计算**: 嵌入式 Python (numpy, scipy, sympy 等)

## License

MIT
