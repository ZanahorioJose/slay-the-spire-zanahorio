# TODO · 怪物美术与任务角色美术（单开一轮）

> 2026-08-15 立项。背景美术已推进（舞台剧式三景别，见
> `docs/art-background-material.html`）；怪物与角色美术暂缓，先记录待办。
> 规范唯一权威：`docs/art-style.md`（像素规格 §2、角色 §4、UI §3）；
> 动画方案见 `docs/animation-guide.md`。

## 背景：现状与目标

- 怪物已有代码侧占位：`docs/art-monster-material.html`（两帧待机 canvas +
  卡框材质 + 本地图片替换）、9 种怪物各有 CSS 双姿态待机动画
  （`EnemyData.anim` 字段已预留）。
- 角色目前是 emoji / 文字占位（`CharacterData` 无立绘字段）。
- **目标**：像素风 Sprite Sheet（行=动作、列=帧），接入游戏与两个演示页，
  替换 CSS/emoji 占位。

## A. 怪物美术

1. **像素精灵表**：为 9 种怪物出 16×16 像素图（透明底、≤12 色、整数倍放大），
   每怪至少 3 行：待机（2~4 帧）/ 受击（2 帧）/ 攻击（3~4 帧）；
   规范见 `art-style.md §2`，命名 `<id>_sprite.png` 放 `assets/enemies/`。
2. **引擎接入**：`EnemyData.art` / `sprite` 字段引用精灵表，
   `battleView2.ts` 按动作行切帧（替换现有 CSS 动画）；
   动画回退：缺帧时沿用 CSS 双姿态。
3. **演示页**：`art-monster-material.html` 从 canvas 占位升级为真实精灵表预览，
   支持换帧速度与动作切换。
4. **Boss 与精英**：优先 6 个 Boss（墨影幽灵/仪式兽/深渊巨龙/知识恶魔/帝皇蟹/
   女王/实验体等），普通怪次之。

## B. 任务角色美术

1. **立绘 / 像素 sprite**：5 个初始角色（铁甲战士/静默猎手/储君/亡灵契约师/
   故障机器人），风格统一（像素角色 + 3D 材质界面的 HD-2D 反差，见 §4）；
   尺寸建议 48×48 或 64×64 立绘 + 32×32 头像，放 `assets/characters/`（目录待建）。
2. **数据字段**：`CharacterData` 增加 `art`（立绘）/ `icon`（头像）字段，
   主菜单选角色、战斗面板、存档界面接入。
3. **待机动画**：主菜单/战斗内角色待机 2~4 帧（复用怪物精灵表机制）。

## 验收标准

1. 所有怪物/角色有正式像素素材，无 emoji/文字占位。
2. `assets/` 素材命名与规范一致；游戏零控制台错误。
3. `npx tsc --noEmit` 0 错误；`npm run build` 成功。
4. 演示页（monster / background）与游戏内表现一致。

## 相关约束

- `src/core/` 禁止依赖 DOM；素材路径走数据字段，不硬编码。
- 像素图 ≤12 色、整数倍放大、单帧统一尺寸（art-style §2）。
- 改完补 `CHANGELOG.md`（Keep a Changelog）并同步 `dialogue.md`。
