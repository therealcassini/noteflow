# NoteFlow

轻量笔记日历应用 — 以日历为核心的个人笔记管理工具。

## 功能

- **四视图切换**：月视图 / 周视图 / 年视图 / 编辑视图
- **富文本编辑**：加粗、斜体、下划线、标题、列表、引用
- **图片粘贴**：Ctrl+V 粘贴剪贴板图片，自动存储到本地 `/upload`
- **标签系统**：动态增删标签，侧边栏一键过滤
- **搜索过滤**：实时搜索标题+正文，支持与标签交叉过滤
- **数据统计**：柱状图（按日期）、饼图（标签分布）、节点图（笔记关联）

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Electron 31 |
| 前端 | 原生 HTML / CSS / JavaScript |
| 存储 | JSON 文件 (`data/noteflow-data.json`) |
| 图表 | ECharts 5.5 |
| 字体 | Inter |

## 快速开始

```bash
# 安装依赖
npm install

# 设置镜像（国内加速）
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

# 启动
npm start
```

## 项目结构

```
noteflow/
├── main.js          # Electron 主进程（窗口、IPC、数据存储）
├── preload.js       # 安全 IPC 桥接
├── start.js         # 启动脚本（绕过 ELECTRON_RUN_AS_NODE）
├── index.html       # 全部视图
├── styles.css       # 样式表
├── app.js           # 前端逻辑
├── data/            # 笔记数据（JSON）
├── upload/          # 图片存储
└── package.json
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+S | 保存笔记 |
| Ctrl+N | 新建笔记 |
| Ctrl+V | 粘贴图片 |

## 数据存储

数据存放在项目根目录 `data/noteflow-data.json`，图片存放在 `upload/` 目录，完全本地化，无需网络。
