# dialogue.md —— 项目对话纪要

本文件记录项目中的重要讨论结论与决策，详细规范以 `docs/` 下对应文档为准
（单一权威原则：同一件事只在一个文档里维护，本文件只做索引与时间线）。

## 2026-08-14 · 全息参数工作台（卡牌美术）

### 结论

- 卡牌美术统一入口：`docs/art-card-studio.html`（材质 / 动画 / 布局 一体，
  本次升级为「全息参数工作台」）。
- 全息采用宝可梦式多层伪立体：彩虹膜 + 跟随鼠标光斑 + 扫光 + 星星 + 塑料光泽，
  技法沉淀在 `docs/emboss.md`。
- 内置 **12 套全息风格预设**，与未来 `CardData.foil` 字段一一对应：
  宝可梦实卡 7 套（稀有 Rare / 宇宙 Cosmos / 反向 Reverse / 光辉 Radiant /
  奇观 Amazing / 金色 Secret / 闪光 Shiny，均对照 pokemon-cards-css 实卡效果）
  + 自定 5 套（落日 / 极光 / 霓虹 / 油膜 / 银河）；
  预设之上可逐项微调（膜 / 光斑 / 扫光 / 星星 / 光泽 / 3D）。
- 混合模式默认「自动」：普通卡 color-dodge、异画卡（方案 E/F/G）overlay，
  可手动覆盖。
- 材质自带的静态镜面高光与全息扫光是两个参数（`--mat-gloss` vs `--gloss-a`），
  已解耦，选材质后扫光滑杆依然有效。

### 踩坑（已修）

- 膜不做绕卡中心旋转（风车观感错误）。对照 pokemon-cards-css 源码后确认正确做法：
  固定斜彩虹（repeating-linear-gradient，颜色平滑插值无硬边）+
  `background-position` 随鼠标视差滑动，
  眩光层（radial-gradient + overlay）随鼠标移动、亮度随离中心距离变化；
  膜图案本身不旋转不漂移。
- 全息膜不能用硬边界色条（c1 0-4%, c2 4-8%）：实心色带边缘锐利 = 强烈线条感；
  必须用平滑插值渐变（纯色列表，regular-holo 风格）。
- 普通卡膜必须区域化：宝可梦卡是全幅画，膜铺满没问题；本项目普通卡是
  「小画窗 + 深色 UI 边框」，膜铺满会变成彩虹条码盖住文字。
  做法：画面区满强度（--art-film=1）、边框轻镀膜（--frame-film≈0.22）、
  扫光/星星保持整卡；异画卡仍整卡铺满。
- 异画卡自动切 overlay 的选择器：
  `body:not(.mix-manual).alt-mode .foil-on .holo-film`
  （alt-mode 在 body、foil-on 在卡面元素，不在同一元素上）。
- range 滑杆 step 会吸附默认值（如 step=0.05 时 0.22 变 0.2），
  需要精确小数时 step 用 0.01。

### 文档索引

- 卡牌表面工艺（浮雕 / 全息）：`docs/emboss.md`
- 美术风格规范（像素角色 + 3D 材质界面）：`docs/art-style.md`
- 材质 / 动画 / 布局演示：`docs/art-card-studio.html`、
  `docs/art-monster-material.html`、`docs/art-background-material.html`

## 2026-08-15 · 效果文本自动生成 + 卡牌趣闻（游戏侧）

### 结论

- 效果文本采用「保留 description 字段 + 生成器辅助」：`src/data/describe.ts`
  从结构化 `effects` 生成中文文本，编辑器提供「从效果自动生成」按钮，
  `buildDatabase` 构建期自动填充空描述。
- 趣闻 `flavor` 平时不显示在卡面；预览弹窗（`showCardPreview`）右侧展示。
- 全卡体检（548 基础卡）：52 张卡 effects 为空且战斗引擎未实现（能力牌白打）、
  293 张描述为英文/混杂、17 张描述为空（已自动填充）。
- 未实现卡与英文本地化单开一轮，开工单见
  `docs/todo-unimplemented-cards.md`。
