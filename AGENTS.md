# AGENTS.md —— 杀戮尖塔 DIY（Slay the Spire DIY）

本文件是 Codex 在本仓库工作的项目级指令，优先于全局配置。开始任何改动前，先完整阅读本文档，并按「文档地图」阅读相关文档。

## 项目是什么

- 网页端、数据驱动的卡牌构筑游戏（杀戮尖塔 DIY）
- 技术栈：Vite + TypeScript + 原生 DOM/CSS；纯前端，无后端、无游戏引擎、无第三方运行时依赖
- 核心目标：玩家可自由 DIY 卡牌/怪物/遗物/事件，数据通过 `data/` 文件夹随身携带

## 文档地图

| 文档 | 定位 | 更新时机 |
| --- | --- | --- |
| `README.md` | 功能手册（面向玩家） | 功能上线后 |
| `GETTING_STARTED.md` | 新设备初始化教程（面向玩家） | 启动/安装方式变化时 |
| `docs/animation-guide.md` | 动画方案（CSS vs Sprite Sheet） | 动画方案变化时 |
| `docs/art-style.md` | 美术风格设计规范（像素角色 + 3D 材质界面） | 风格/材质设计变化时 |
| `docs/art-*.html` | 材质演示页（卡牌/怪物/背景） | 素材/材质调整时 |
| `CHANGELOG.md` | 开发日志（Keep a Changelog 格式） | 每次完成改动后追加 |

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务器（http://localhost:5173） |
| `npm run build` | 类型检查 + 生产构建 + 复制 `data/` 到 `dist/` |
| `npx tsc --noEmit` | 类型检查（要求 0 错误） |
| `npx esbuild scripts/core_test.ts --bundle --platform=node --format=esm --outfile=scripts/core_test.mjs && node scripts/core_test.mjs` | 核心逻辑测试 |
| `python scripts/e2e_test.py` | 浏览器端到端测试（可选，需 Playwright，需先启动 dev） |

## 目录结构

```text
src/
├── core/    游戏逻辑，禁止依赖 DOM（types / combat / game / map / rng）
├── data/    内置数据与合并/存取（index / store + cards|enemies|relics|events|ancients）
└── ui/      界面层（battleView2 / editorView / mapView / ...）
data/        玩家正式数据（data/*.json 入库；save.json 是运行时存档，不入库）
scripts/     测试与工具（core_test.ts / e2e_test.py / copy-data.mjs / start_game.bat）
docs/        设计文档与规范讨论（animation-guide.md / art-style.md / 预览与测试页）
assets/      实际美术素材（卡图/精灵表/UI 贴图/背景/材质包，规范见 docs/art-style.md §10）

根目录文档：`README.md`（功能手册）、`GETTING_STARTED.md`（初始化教程）、`CHANGELOG.md`（开发日志）、`AGENTS.md`（本文档）
```

## 关键架构约束（改代码前必读）

1. **数据三层加载**：内置（`src/data/*.ts`）→ 正式层（`data/*.json`）→ 临时层（localStorage），后者覆盖前者；核心逻辑统一从 `buildDatabase()` 拿合并后的 `GameDatabase`，不要绕过分层直接读文件。
2. **卡牌实例 ID**：游戏外用静态卡牌 id（`strike`）；战斗中实例化分配 uid（`c1`、`c2`…），牌堆/手牌/弃牌堆存 uid，经 `uid → cardId` 映射解析。新增卡牌相关逻辑时区分「静态 id」与「战斗实例」。
3. **升级卡派生**：`<id>+` 一律由基础卡在 `buildDatabase()` 时动态派生，`upgrade` 字段只存覆盖项（费用/描述/效果/消耗）。禁止显式存储 `<id>+` 卡数据；升级/移除只作用于单张实例。
4. **战斗事件严格串行**：不存在「同时结算」；同一时机多个遗物按获得顺序执行；遗物效果产生的伤害/格挡不得递归触发钩子（`hookDepth` 防递归）。新增触发时机/遗物时遵守此模型。
5. **数据驱动**：核心逻辑不得硬编码具体卡牌/怪物/遗物；新机制优先扩展 `types.ts` 的 `Effect` 与数据字段，再在编辑器里暴露配置。
6. **池子系统**：`CardData` / `RelicData` 的 `pools`（`reward`/`shop`/`boss`/`event`）留空 = 全部池可用；按池过滤结果为空时回退全量，保证游戏可玩。
7. **UI 交互**：所有卡牌「先选中、再确认」（防误触）；数字键只选中不出牌；新增快捷键需保持现有映射一致。

## 代码风格

- TypeScript strict 模式；`noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch` 已开启，新代码不允许出现未使用变量/参数
- 缩进 4 空格，不使用 Tab
- 类型集中定义在 `src/core/types.ts`；数据条目一律带类型标注
- 命名沿用现有风格：函数/变量 camelCase，类型 PascalCase，枚举值小写字符串（如 `"attack"`）
- 注释使用中文，与现有代码一致
- `src/core/` 禁止 import DOM / 浏览器 API；UI 逻辑都在 `src/ui/`

## 工作流要求

1. 改动前：读 `README.md`（功能现状）、`CHANGELOG.md`（近期日志）
2. 改动后验证（按影响范围）：
   - `npx tsc --noEmit` 必须 0 错误
   - 核心逻辑改动：跑核心逻辑测试，全部通过
   - UI/流程改动：`npm run dev` 起服人工验证关键路径
   - 提交前：`npm run build` 成功
3. 完成后更新文档：`CHANGELOG.md` 追加开发日志（Keep a Changelog 格式：日期 + Added/Changed/Fixed/Removed）；功能变化同步 `README.md`；启动/安装方式变化同步 `GETTING_STARTED.md`
4. 提交纪律：只提交源码、配置、文档与正式数据；`node_modules/`、`dist/`、`scripts/core_test.mjs`、`data/save.json`、`.codex/`、`scripts/shots/` 等不入库（见 `.gitignore`）

## 环境注意事项

- 项目级 `.codex/config.toml` 声明了 writable_roots（指向当前机器路径），换机器需更新，但不入库
- 沙箱内无法监听端口/联网：`npm run dev`、`npm install` 需在沙箱外运行
- 「绑定 data 文件夹」（File System Access API）仅 Chromium 内核浏览器支持
- 旧数据迁移：localStorage 旧 key `slay-the-spire-diy-v1` 会自动迁移到正式层，改动数据层时不要破坏该逻辑
