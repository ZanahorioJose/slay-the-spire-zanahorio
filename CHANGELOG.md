# CHANGELOG

本文件是项目的**开发日志**，按日期记录每次显著改动（新增/变更/修复/移除），供玩家与开发者快速了解项目演进。

- 格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，日期使用 ISO 8601（YYYY-MM-DD）
- 新条目在上、旧条目在下；每次完成改动后在文件顶部追加
- 同类改动分组：`### Added`（新增）/ `### Changed`（变更）/ `### Fixed`（修复）/ `### Removed`（移除），无内容的分组省略
- 未来发布版本时按 `## [x.y.z] - YYYY-MM-DD` 归档；未发布的新改动先记在 `## [Unreleased]`

## [Unreleased]

### Added

- 美术风格设计规范 v1（`docs/art-style.md`）：定位「像素角色 + 3D 材质界面（HD-2D 混搭）」，
  定义像素 Sprite 规格、卡牌材质分层（普通/罕见/稀有/金卡/闪卡）、UI 材质系统、
  背景三层分层、设计 Token 与 AI 出图 Prompt 模板
- 材质预览页 `docs/art-mockup.html`：浏览器直接打开即可查看，含五种稀有度卡牌、
  像素史莱姆待机动画、皮革面板/宝石条/金属按钮、三层背景主题示例
- 金卡（`.gold`）与闪卡（`.foil`）材质 class 预留：与稀有度字段解耦，未来掉落机制可独立设计
- 卡牌材质展示页 `docs/art-card-material.html`（原 `art-material-test.html` 更名）：纯 HTML/CSS/JS（无图片、无 WebGL），
  可实时切换六种材质（粗布/银/合金/金箔/箔面/玻璃）、拖参数调光照、开关 3D 跟随鼠标倾斜，
  并内置压力测试（30/60/120 张卡 + FPS 读数）。无头 Edge 实测：120 张全闪卡同时动画稳定 60 FPS；
  提供「高性能模式」开关（箔面不旋转只扫光）作为兜底
- 卡面素材支持配置切换：演示页脚本顶部素材配置区，`kind: "pixel"` 用内置占位像素画、
  `kind: "image"` 引用 `assets/` 实际图片；定下演示页命名约定
  `docs/art-<对象>-material.html`（未来怪物/背景演示页沿用）
- 卡牌材质展示页新增「选择本地图片」：文件选择器直接填充卡面
  （Object URL 加载，本地照片平滑显示不套像素锐化），可一键恢复占位像素画
- 卡牌材质展示页新增卡图缩放与 X/Y 轴微调：缩放 25%–400%、X/Y 偏移 -120px~120px，
  换图自动重置、可一键复位（CSS 变量驱动 transform，GPU 合成层不卡顿）
- 卡牌材质展示页材质库扩展至 18 种 CSS 材质技术：新增拉丝金属、液态铬、黄铜、碳纤维、
  珠光、油膜全息、大理石、木纹、石板、岩浆、星云、霓虹（重复渐变 / conic+混合模式 /
  动画背景层 / 扫光等技法），并新增「材质参考墙」一次对比全部材质、点卡片即切到主卡
- 新增 `docs/art-monster-material.html`（怪物材质演示）：像素精灵占位（两帧待机 canvas，
  可换本地图片 + 缩放/XY 微调）、待机/受击/攻击 CSS 动作占位、卡框复用 18 种材质 + 参考墙
- 新增 `docs/art-background-material.html`（背景材质演示）：三层纵深舞台
  （远景/中景/近景）、5 种场景主题（地牢/沼泽/熔岩/星云/大理石）、中景可换本地图片 + 缩放/XY
- 素材目录分工：新增 `assets/`（cards/enemies/relics/events/ui/backgrounds/packs），
  `docs/` 只放规范与讨论，实际素材与材质包统一进 `assets/`（见 `docs/art-style.md` §10）
- 修复 `docs/art-mockup.html` 与 `docs/art-card-material.html` 卡图溢出：
  16×16 像素画由放大 8 倍（128px）改为 6 倍（96px）并加 `overflow: hidden` 保护
- `docs/art-mockup.html` 卡牌 3D 倾斜改为跟随鼠标：双轴 `rotateX`/`rotateY`，
  镜面高光中心（`--lx`/`--ly`）同步移动，鼠标移出回正
- 修复闪卡箔面旋转角部超出卡面：旋转层由整块方框改为圆角裁剪容器内的伪元素
  （`overflow: hidden`），`conic-gradient` 绕卡面中心旋转，角部不再甩出

## 2026-08-14

### Added

- 移除池机制：`PlayerCombatState` 新增 `removedPile`，能力牌打出后进入独立的
  「移除池」（本场战斗暂时移除，下一场照常可用），与消耗堆完全分离——
  未来「从消耗堆拉回牌」类机制不会误伤能力牌；战斗界面新增「移除」牌堆按钮可查看
- 磨砂玻璃卡面：全部卡牌统一改为磨砂玻璃材质（`backdrop-filter` 模糊 +
  半透明白渐变 + 高光带 + 类型色边框/内辉光），颜色沿用卡牌当前的
  `--card-accent`；与 `docs/art-card-material.html` 的 `.mat-glass` 语言一致
- 版本/拓展包字段：`CardData` / `RelicData` 新增 `version`（字符串，如
  「基础版」「DLC1」），编辑器卡牌/遗物表单可配置，为未来拓展包（DLC）铺路
- 先古事件：每层第一个节点固定为先古事件（地图入口节点），进入后先回复缺失
  生命值的 X%（默认 100 = 满血，全局设置可覆盖），再随机获得一件先古遗物
- 先古角色数据：新增 `AncientData` 与 `ancients` 数据段（`data/ancients.json`），
  内置「先古旅人」角色与 4 件先古遗物（先古之镜/核心/图腾/罗盘，仅进先古池）；
  DIY 编辑器新增「先古」页签，可配置角色、回血比例与遗物池
- 全局设置新增「先古回血比例 %」与「先古角色」两项

### Changed

- 能力牌落点调整：由「进消耗堆」改为「进独立移除池」，卡面标签改为「打出后移除」；
  消耗堆从此只放显式标记 `exhaust` 的卡牌

## 2026-08-13

### Added

- 能力牌机制：`type: "power"` 的卡牌打出后不进入弃牌堆（08-14 起进独立「移除池」，见上）
- 事件选项 `addRelicPool`：从指定池随机获得一件未拥有的遗物
- 池子系统：`CardData` / `RelicData` 新增 `pools`（`reward` / `shop` / `boss` / `event`），奖励、商店、Boss 按池过滤，池空回退全量
- 精英遗物奖励：击败精英后随机获得一件遗物（reward 池），再选卡牌
- Boss 卡牌奖励：击败首领后先选一张 Boss 稀有度加权的卡牌，再进入下一层
- 项目文档：新增 `AGENTS.md`（项目级 Codex 指令）、`GETTING_STARTED.md`（新设备初始化教程）、`.gitignore`；开发日志改用 CHANGELOG 规范

### Changed

- 环境：项目迁移至 Mac 并接入 Git 托管，Node v25.9.0 / npm 11.12.1，`.codex/config.toml` 的 writable_roots 更新为当前路径
- 文档：`README.md` 环境说明改为引用初始化教程；原有跨设备交接文档拆分职责（玩家向 → `GETTING_STARTED.md`，开发者向 → `AGENTS.md`）

### Fixed

- `README.md` 已完成功能列表编号重复（两个 8），已重新编号为 1-12

### Removed

- 废弃 `dialogue.md`（命名不规范，开发日志迁移至本文件）
- 删除交接文档 `DEV_HANDOVER.md`（内容按玩家/开发者职责拆分到 `GETTING_STARTED.md` 与 `AGENTS.md`）
