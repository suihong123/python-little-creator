# Python 小小创造师

这是「Python 小小创造师」的 MVP 第 3 阶段：一个纯前端的 React + Vite + Monaco Editor + Pyodide 小项目。当前包含 36 关课程框架，其中前 12 关可学习，13-36 关锁定待开放。

## 功能范围

- 三栏页面布局：左侧课程目录、中间课程任务卡、右侧代码编辑器和输出结果。
- 课程内容使用本地 JSON 管理。
- 使用 Monaco Editor 编辑 Python 代码。
- 使用 Pyodide 在浏览器中运行 Python。
- 支持运行代码、检查任务、显示输出、重置代码。
- 支持基础自动判题：运行成功、输出包含、代码包含、代码不包含、输出行数、代码包含任一关键词。
- 支持通关状态保存、当前关卡保存、每关代码保存、运行次数保存。
- 左侧目录显示 36 关、当前关高亮、已完成标记、锁定关卡提示。
- 使用可编辑模拟输入区支持 input 相关关卡运行，并保存每关输入内容。
- Python 报错时保留原始错误，并显示儿童化中文解释。
- 支持简单徽章系统和学习记录面板。
- 输出最多显示 100 行，过长会自动截断提示。
- 纯前端静态项目，不使用后端、不使用数据库、不接 AI API。
- 已配置 GitHub Pages 所需的 Vite base 和 GitHub Actions。

## 项目目录结构

```text
../.github/workflows/python-little-creator-pages.yml
                                     # 当前仓库的 GitHub Pages 自动部署流程
python-little-creator/
├── src/
│   ├── data/lessons.json          # 本地课程数据
│   ├── main.jsx                   # React 应用入口和核心交互
│   └── styles.css                 # 页面布局和样式
├── index.html                     # Vite HTML 入口
├── package.json                   # 前端依赖和脚本
├── vite.config.js                 # Vite 配置，包含 GitHub Pages base
└── README.md                      # 项目说明
```

## 本地运行

进入项目目录：

```bash
cd python-little-creator
```

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

浏览器打开终端提示的本地地址，通常是：

```text
http://localhost:5173
```

第一次运行 Python 代码时，浏览器会从 Pyodide CDN 加载 Python 运行环境。

## 构建

```bash
npm run build
```

构建结果会生成在：

```text
python-little-creator/dist/
```

本地预览构建结果：

```bash
npm run preview
```

## 部署到 GitHub Pages

1. 把代码推送到 GitHub 仓库的 `main` 分支。
2. 打开 GitHub 仓库页面，进入 `Settings`。
3. 进入 `Pages`。
4. 在 `Build and deployment` 中选择 `GitHub Actions`。
5. 之后每次推送到 `main` 分支，仓库根目录的 `.github/workflows/python-little-creator-pages.yml` 会自动安装依赖、构建项目并部署到 GitHub Pages。

部署 workflow 会自动把 Vite 的 `base` 设置为仓库名，例如仓库名是 `python-little-creator` 时，base 会是：

```text
/python-little-creator/
```

如果你的仓库是用户主页仓库，例如 `username.github.io`，可以把 workflow 里的构建命令改成：

```bash
VITE_BASE_PATH="/" npm run build
```

## 关键文件作用

- `src/data/lessons.json`：保存 36 关课程数据、前 12 关任务内容和检查规则。
- `src/main.jsx`：加载课程、保存 localStorage、初始化 Pyodide、运行 Python、执行检查规则、维护通关进度、模拟输入、徽章和学习记录。
- `src/styles.css`：实现三栏布局、进度条、目录状态、任务卡、编辑器区域、结果区域、徽章和学习记录样式。
- `vite.config.js`：配置 React 插件和 GitHub Pages 部署时需要的 `base`。
- `../.github/workflows/python-little-creator-pages.yml`：GitHub Actions 自动部署到 GitHub Pages。GitHub 只读取仓库根目录下的 workflow，所以这个文件放在前端项目目录外层。

## 当前课程

- 第 1-12 关：可学习，包含完整课程内容和检查规则。
- 第 13-36 关：锁定状态，仅显示标题、知识点和“即将解锁”。

## 示例关卡

关卡名：让电脑说你好

默认代码：

```python
print("你好，Python！")
```

点击「运行代码」后，输出区会显示：

```text
你好，Python！
```

## 还未完成的功能

- 还没有完整 36 关课程内容。
- 第 13-36 关还没有完整课程正文和检查规则。
- 还没有评分系统。
- 还没有移动端专门优化的编辑体验。
- 运行超时目前只是友好提示，暂未把 Pyodide 放进 Web Worker，因此无法安全强制中断所有长时间运行代码。
- 还没有离线缓存 Pyodide 资源，首次运行仍需要网络加载 Pyodide。
