# 美术素材目录（assets/）

> 与 `docs/` 的分工：`docs/` 只放**规范与讨论**（`art-style.md`、`animation-guide.md`、
> `art-mockup.html`、`art-card-material.html`，未来 `art-monster-material.html` /
> `art-background-material.html`）；本目录放**实际美术素材**——
> 像素精灵表、卡图、UI 贴图、背景分层与材质包。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `cards/` | 卡牌像素卡图（`<卡牌id>.png`）与卡面动态素材 |
| `enemies/` | 怪物 Sprite Sheet（`<角色id>_sprite.png`，行=动作、列=帧） |
| `relics/` | 遗物图标 |
| `events/` | 事件插图 |
| `ui/` | UI 贴图（面板纹理、材质贴图、按钮切图） |
| `backgrounds/` | 战斗/菜单/地图背景分层素材 |
| `packs/` | 材质包 / AI 出图原始批次（原始包、调色板、meta 文件），确认入库后转正到对应分类 |

## 规范

- 像素素材：单图 ≤ 12 色 + 透明底、整数倍放大、命名规范见 `docs/art-style.md` §2
- AI 出图产物先放 `packs/` 验收，确认后再整理到对应分类目录
- 游戏数据 `art` / `sprite` 字段引用相对路径，如 `assets/enemies/slime_sprite.png`
- 演示页（`docs/art-*.html`）通过脚本顶部配置区引用本目录素材：`kind: "image"` 时填 `assets/...` 相对路径
