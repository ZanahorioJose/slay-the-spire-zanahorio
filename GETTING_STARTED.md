# 新设备初始化教程

> 用途：在另一台电脑上开始玩《杀戮尖塔 DIY》。大约 5 分钟即可跑起来。
> 本教程只讲「怎么启动游戏」；游戏功能与 DIY 说明见 `README.md`，项目演进记录见 `CHANGELOG.md`。

## 1. 环境要求

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | >= 18 | 用于启动游戏服务（`npm run dev`） |
| 浏览器 | Chrome / Edge 最新版（推荐） | 「绑定 data 文件夹」需要 Chromium 内核；其他浏览器可玩，但数据只能存 localStorage |
| 网络 | 仅安装依赖时需要 | 安装完成后可离线游玩 |

> 提示：DIY 数据默认放在项目的 `data/` 文件夹（卡牌/怪物/遗物/事件 + 自动存档），整个文件夹拷贝或克隆即随身携带。

## 2. 获取项目

- 方式一（推荐，Git）：`git clone <仓库地址>`
- 方式二（拷贝）：直接拷贝整个项目文件夹（至少包含 `package.json`、`src/`、`data/`、`index.html`）

## 3. 安装依赖（只需一次）

打开终端，进入项目目录：

```bash
cd slay-the-spire-zanahorio
npm install
```

Windows 也可在 Git Bash 或 CMD 中执行同样命令。

## 4. 启动游戏

```bash
npm run dev
```

浏览器访问 http://localhost:5173。

Windows 也可以直接双击 `scripts/start_game.bat` 启动并自动打开浏览器。

## 5. 开始玩

- 主菜单 →「开始新游戏」直接游玩
- 主菜单 →「编辑」DIY 卡牌/怪物/遗物/事件
- 想让数据写入 `data/` 文件夹：主菜单或编辑器里点「绑定 data 文件夹」，选择本项目里的 `data/` 目录（仅 Chrome/Edge）

## 常见问题

- **端口被占用**：修改 `vite.config.ts` 里的 `server.port`，或关闭占用 5173 端口的程序
- **双击 index.html 打不开 / 数据不生效**：请用 `npm run dev` 或 `start_game.bat` 启动；直接打开文件时只能用 localStorage
- **换了浏览器数据不见了**：未绑定 data 文件夹时数据存 localStorage，换浏览器或清缓存会丢；建议先「绑定 data 文件夹」
- **数据文件在哪**：`data/cards.json` 等是正式 DIY 数据，`data/save.json` 是自动存档，两者都随项目携带

## 可选：生产构建

```bash
npm run build
```

产物在 `dist/`（已自带 `data/` 数据），可整体丢到任意静态托管或双击运行。
