# Python 小小创造师

「Python 小小创造师」是一个少儿 Python 入门互动学习项目，面向大约 10 岁、已经学过 Scratch 的孩子。

课程风格是：

```text
生活主题 + 小助手陪伴 + 轻互动 + 重运用
```

这是一个纯前端静态网页项目，不使用后端、不使用数据库、不接 AI API。

## 技术栈

- React + Vite
- Monaco Editor 代码编辑器
- Pyodide 在浏览器里运行 Python
- localStorage 保存学习进度
- GitHub Pages 静态部署

## 当前内容

项目目前包含 36 关课程，覆盖 Python 入门到综合小作品。

### 第 1-12 关：基础入门

前 12 关重点是把基础语法学扎实：

1. print 输出
2. 字符串
3. 变量
4. 数字运算
5. input 输入
6. int 类型转换
7. if 判断
8. if / elif / else
9. for / range
10. list 列表
11. list + for
12. input + if + 计分小游戏

前 12 关已经加入“基础扎实版”学习内容：

- 本关重点
- 观察问题
- 多个练习任务
- 常见错误
- 复习问题

### 第 13-24 关：基础强化

第 13-24 关是 Python 基础强化和生活化小项目：

- 多条件判断
- True / False
- list append / remove
- dict 字典
- 函数 def
- 函数参数
- return
- 小小记账本
- 任务打卡系统
- 菜单式生活小助手

### 第 25-36 关：小作品过渡

第 25-36 关帮助孩子从“会跟着写代码”过渡到“能做小作品”：

- 字符串拼接
- 关键词判断
- strip 字符串清理
- 故事生成器
- 找 Bug
- 修程序
- 猜数字小游戏
- random 抽任务
- 问卷机
- 成绩统计
- 学习计划表
- 毕业作品：Python 小助手

## 页面结构

页面采用三栏布局：

- 左侧：课程目录、学习记录、徽章
- 中间：课程目标、故事、讲解、任务、练习内容
- 右侧：Python 代码编辑器、运行按钮、检查任务、模拟输入、输出结果

孩子可以：

- 修改 starterCode
- 点击运行代码
- 查看输出结果
- 用模拟输入运行 `input()`
- 点击检查任务
- 通过后保存完成状态
- 获得简单徽章
- 刷新后保留学习进度

## 项目目录结构

```text
../.github/workflows/python-little-creator-pages.yml
                                     # 当前仓库的 GitHub Pages 自动部署流程
python-little-creator/
├── src/
│   ├── data/lessons.json          # 36 关课程数据
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

## 关键文件

- `src/data/lessons.json`：保存 36 关课程数据、starterCode、任务说明、检查规则和学习加深字段。
- `src/main.jsx`：加载课程、保存 localStorage、初始化 Pyodide、运行 Python、执行检查规则、维护通关进度、模拟输入、徽章和学习记录。
- `src/styles.css`：实现三栏布局、课程卡片、学习模块、编辑器区域、输出区域、徽章和学习记录样式。
- `vite.config.js`：配置 React 插件和 GitHub Pages 部署时需要的 `base`。
- `../.github/workflows/python-little-creator-pages.yml`：GitHub Actions 自动部署到 GitHub Pages。

## 当前限制

- 运行超时目前只是友好提示，暂未把 Pyodide 放进 Web Worker，因此无法安全强制中断所有长时间运行代码。
- Pyodide 首次加载依赖网络 CDN。
- 第 13-36 关暂未加入和前 12 关同等级的“基础扎实版”加深字段。
- 移动端可以使用，但编辑体验仍以桌面端为主。
