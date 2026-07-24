# Mrite v2.2
感谢数学建模某哥与某卖AI电子书割韭菜“老师”。
正是你们对商业闭环的极致追求，对知识付费的深度实践，才让我真正明白：原来一个软件可以把自己关得这么紧，紧到必须把完整源代码全部翻出来，晒给所有人看。
没有你们，这份完整开源根本不会存在。
没有你们，无数学生可能还在排队交保护费。
没有你们，我也不会学会把“价值壁垒”直接变成“全部公开”。
为了照顾广大学生人民，Mrite完整源代码已全部开源。
既然你们那么“爱护”用户，那就帮你们把爱护进行到底。
谢了。
愿你们的电子书永远能卖，韭菜永远够割。

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
