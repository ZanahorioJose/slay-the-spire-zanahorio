# TODO · 未实现卡牌效果与文本本地化（单开一轮）

> 2026-08-15 全卡体检结论。来源：`buildDatabase()` 合并后数据库（548 张基础卡）。
> 本文是给另一轮 Codex 会话的开工单；做完后请更新此文档状态与 `CHANGELOG.md`。

## 状态更新（2026-08-15 第二轮）

- **问题 A（52 张未实现卡）：✅ 已完成**。新增被动钩子系统
  （`Effect.op: "passive"`，12 种触发时机，与遗物共用 `hookDepth` 防递归）、
  新状态（装甲 plating / 活力 vigor / 保留 retain / 壁垒 barricade / 宝珠槽
  orbSlots）、新效果（从弃牌堆取回、加入随机卡、变形、抽顶牌等）。
  52 张卡已在 `src/data/passive_card_fixes.ts` 补全 effects 与中文描述
  （数据驱动，未硬编码逻辑）。多人与 Sovereign Blade 等未实现体系以近似
  效果替代并在描述中注明。验收：全部可打出产生可观察效果，测试覆盖。
- **问题 B（293 张英文/混杂描述本地化）：✅ 已完成（第二轮）**。
  措施：① 效果解析器新增被动结构化（每回合开始/结束、每当/每次 X →
  passive 钩子），让能力牌 effects 结构化；② 翻译器补齐 80+ 条规则与
  触发短语映射（条件句、for each、宝珠 X、Osty、Sovereign Blade、
  Choose/Transform、费用与裸资源等）；③ 46 张特殊机制卡手写中文描述表
  （CARD_DESC_ZH）；④ 数据构建层对仍含英文且效果已结构化的卡用
  `describeEffects` 生成中文（含升级卡），fallback 近似卡由基础中文描述
  兜底。**验收：1040 张卡（548 基础 + 492 升级）描述英文残留 0**，
  并有「全卡中文」回归测试。
- **后续可选（effects 精修）**：仍有部分卡 effects 为费用默认近似
  （fallback），描述中文但机制未完全结构化；可在后续轮次按
  `isFallbackEffects` 清单逐张精修。

## 背景

游戏目前有 **548 张基础卡**（另 492 张为 `<id>+` 升级派生）。体检发现三类问题：

1. **52 张卡 `effects` 为空且战斗引擎无任何实现** —— 打出后只扣能量、什么都不发生（能力牌全成摆设）。
2. **293 张卡效果描述以英文为主或中英混杂** —— 中文游戏里观感差。
3. **17 张卡描述为空** —— 已在数据构建层用「效果文本生成器」自动填充（见下方说明），本轮无需处理。

---

## 问题 A：52 张未实现卡（最高优先）✅ 已完成

这些卡的 `effects: []`，且全仓库搜索（`src/core/`、`src/ui/`）没有任何按 id 的实现逻辑。
其中 **50 张 power + 2 张 skill**。打出后白费费用，属于功能性 BUG。

| id | 名称 | 类型 | 稀有度 | 角色 | 当前描述（部分为英文原文） |
| --- | --- | --- | --- | --- | --- |
| aggression | 好战 | power | rare | warrior | 每回合开始时，put a random attack from your discard pile into your hand，upgrade it |
| barricade | 壁垒 | power | rare | warrior | 你的格挡不会在回合开始时被清除 |
| corruption | 腐化 | power | common | warrior | Skills cost 0 .。每当你打出技能牌，exhaust it |
| cruelty | 残忍 | power | rare | warrior | 易伤敌人额外受到 25% 伤害 |
| hellraiser | 引魔人 | power | rare | warrior | 每当you draw a card containing “strike”，it is played against a random enemy |
| juggling | 抛接 | power | uncommon | warrior | Add a copy of the third Attack you play each turn into your Hand |
| stampede | 践踏 | power | uncommon | warrior | 每回合结束时，1 random attack in your hand is played against a random enemy |
| stone_armor | 石甲 | power | uncommon | warrior | 获得 4 层装甲 |
| tank | 坦克 | power | rare | warrior | Take double damage from enemies.。Allies take half damage from enemies |
| unmovable | 岿然不动 | power | rare | warrior | The first time you gain Block from a card each turn, double the amount gained |
| accelerant | 助燃剂 | power | rare | silent | 中毒每回合多触发 1 次 |
| accuracy | 精准 | power | uncommon | silent | 飞刀额外造成 4 点伤害 |
| master_planner | 谋士 | power | rare | silent | When you play a Skill, it gains Sly |
| phantom_blades | 幻影刀锋 | power | uncommon | silent | Shivs gain Retain.。The first Shiv you play each turn deals 9 additional damage |
| tracking | 追踪 | power | rare | silent | Weak enemies take double damage from Attacks |
| well_laid_plans | 缜密计划 | power | uncommon | silent | 每回合结束时，保留至多 1 张手牌到下一回合 |
| capacitor | 电容器 | power | uncommon | defect | Gain 2 Orb Slots |
| creative_ai | 创造型 AI | power | rare | defect | 每回合开始时，将 1 张随机能力牌加入手牌 |
| echo_form | 回声形态 | power | rare | defect | The first card you play each turn is played an extra time |
| feral | 野性 | power | uncommon | defect | The first 0 times you play a 0 Attack each turn, return it to your Hand |
| loop | 循环 | power | uncommon | defect | 每回合开始时，trigger the passive ability of your rightmost orb |
| subroutine | 子程序 | power | uncommon | defect | 每当你打出一张能力牌，gain |
| trash_to_treasure | 变废为宝 | power | rare | defect | 每当you create a status card，channel 1 random orb |
| one_for_all | 万众一心 | power | rare | defect | （描述也为空，完全空卡） |
| calcify | 钙化 | power | uncommon | necrobinder | Osty's attacks deal 4 additional damage |
| call_of_the_void | 虚空呼唤 | power | rare | necrobinder | 每回合开始时，add 1 random card into your hand。It gains Ethereal |
| capture_spirit | 捕获灵魂 | skill | uncommon | necrobinder | Enemy loses 3 HP.。Add 3 Soul into your Draw Pile |
| forbidden_grimoire | 禁书 | power | common | necrobinder | At the end of combat, you may remove a card from your Deck |
| glimpse_beyond | 窥见彼岸 | skill | rare | necrobinder | ALL players add 3 Soul into their Draw Pile |
| lethality | 致命 | power | uncommon | necrobinder | The first Attack each turn deals 50% additional damage |
| reaper_form | 死神形态 | power | rare | necrobinder | 每当attacks deal damage，they also apply that much doom |
| sentry_mode | 哨兵模式 | power | rare | necrobinder | 每回合开始时，add 1 sweeping gaze into your hand |
| sleight_of_flesh | 血肉戏法 | power | uncommon | necrobinder | 每当you apply a debuff to an enemy，they take 9 damage |
| soulbound | 灵魂绑定 | power | uncommon | necrobinder | （描述也为空，完全空卡） |
| cacophony | 刺耳噪音 | power | rare | necrobinder | （描述也为空，完全空卡） |
| furnace | 熔炉 | power | uncommon | regent | 每回合开始时，锻造 4（升级手牌中 4 张随机牌） |
| hammer_time | 锤击时刻 | power | rare | regent | 每当you forge，all allies forge as well |
| monarchs_gaze | 君主凝视 | power | rare | regent | 每当you attack an enemy，it loses 1 strength this turn |
| neutron_aegis | 中子护盾 | power | rare | regent | 消耗 5 点星辰。获得 8 层装甲 |
| royalties | 王室贡金 | power | rare | regent | At the end of combat, gain 30 Gold |
| seeking_edge | 追刃 | power | rare | regent | 锻造 7（升级手牌中 7 张随机牌）。Sovereign Blade now deals damage to ALL enemies |
| spectrum_shift | 光谱位移 | power | uncommon | regent | 每回合开始时，add 1 random colorless card into your hand |
| sword_sage | 剑圣 | power | rare | regent | Increase the cost of Sovereign Blade by 1.。Sovereign Blade now hits an additional time |
| beacon_of_hope | 希望灯塔 | power | rare | 无色 | 每当you gain block on your turn，other players gain half that much block |
| calamity | 灾难 | power | rare | 无色 | 每当你打出攻击牌，将 1 张随机攻击牌加入手牌 |
| entropy | 熵 | power | rare | 无色 | 每回合开始时，transform 1 card in your hand |
| eternal_armor | 永恒装甲 | power | rare | 无色 | 获得 7 层装甲 |
| fasten | 系紧 | power | uncommon | 无色 | Gain an additional 5 Block from Defend cards |
| mayhem | 混乱 | power | rare | 无色 | 每回合开始时，play the top card of your draw pile |
| nostalgia | 怀旧 | power | rare | 无色 | The first Attack or Skill you play each turn is placed on top of your Draw Pile |
| prep_time | 备战时间 | power | uncommon | 无色 | 每回合开始时，获得 4 点活力 |
| stratagem | 计谋 | power | uncommon | 无色 | 每当you shuffle your draw pile，choose a card from it to put into your hand |

### 实现建议

- **不要硬编码卡 id**（违反项目「数据驱动」约束）。优先扩展 `Effect` 联合类型与
  `Combat` 的触发时机（`src/core/types.ts` + `src/core/combat.ts`）：
  - 新增被动/钩子类效果，例如
    `{ op: "passive", hook: "turnStart" | "cardPlayed" | "blockGained" | "cardExhausted" | "attackPlayed" | "drawPileShuffled" | "turnEnd" | "combatEnd", effects: Effect[] }`；
  - 与遗物触发同构，挂在现有串行事件链上（严格遵守 `hookDepth` 防递归、
    「同一时机按获得顺序执行」约束）；
  - 「装甲 / 活力 / 宝珠槽 / 保留 / Sly」等新状态，先确认 `StatusType` 与
    `CardInstance` 是否有承载，没有则补类型与图标。
- 个别多人与遗物式效果（tank / beacon_of_hope / royalties 等）需要先明确
  本项目是否有"队友"概念；没有的话给出降级实现（如仅对自身生效）并同步描述。
- 3 张完全空卡（one_for_all / soulbound / cacophony）：实现机制后补 `effects`
  与中文描述，或直接删除并清理数据。

### 验收标准

1. 52 张卡逐一可打出且产生可观察效果（对敌/对己/状态/抽弃牌等）。
2. 手牌常态性能不劣化（被动钩子只挂必要时机）。
3. `npx tsc --noEmit` 0 错误；核心逻辑测试全过。
4. 编辑器里这 52 张卡的 `effects` 不再为空，描述改为中文。

---

## 问题 B：293 张英文/混杂描述（本地化）

`sts2_cards.ts` 是脚本从英文 wiki 导入的，`effects` 是"可解析近似"——
很多复杂机制（如「消耗全部手牌，每张 +7 伤害」「本回合打出 X 次额外效果」）
**并没有完整结构化**。因此不能直接拿生成器全覆盖，会丢机制文字。

建议分两步：

1. **先修 effects 完整性**（与问题 A 同步）：把复杂机制补进结构化效果，
   让描述可以完整由 `describeEffects()` 生成；
2. **再批量生成中文描述**：跑一次全卡生成，人工抽检差异；
   无法结构化的少数卡保留手写中文（优先保证中文、措辞统一）。

可复用工具：`src/data/describe.ts`（`describeEffects`）——
已支持全部 `Effect` 类型，编辑器里也有「✨ 从效果自动生成」按钮。

---

## 数据文件说明

- `src/data/cards.ts`：基础经典卡（中文、结构化完整，基本无问题）。
- `src/data/sts2_cards.ts`：STS2 大包（英文混杂、effects 近似，问题集中地）。
  文件头标注"由脚本自动生成，勿手改"——改数据请走
  `scripts/generate_sts2_cards.py` 或正式层 `data/cards.json` 覆盖。
- `data/cards.json`：玩家正式层覆盖（bash 等少量卡）。
- 空描述已在 `buildDatabase()` 构建期自动填充（`src/data/index.ts`），
  编辑器保存/导出的是填充后的文本。

## 相关约束（来自 AGENTS.md）

- 战斗事件严格串行；遗物/被动产生的伤害不得递归触发钩子（`hookDepth`）。
- `src/core/` 禁止依赖 DOM；新增类型进 `src/core/types.ts`。
- 数据驱动：新机制先扩 `Effect` 与数据字段，再在编辑器暴露配置。
- 改完补 `CHANGELOG.md`（日期 + Added/Changed/Fixed）并同步 `dialogue.md`。
