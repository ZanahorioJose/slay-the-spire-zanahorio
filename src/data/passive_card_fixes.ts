// 未实现卡效果修正表（2026-08-15 全卡体检修复）。
// 这些卡此前 effects 为空（打出后无效果）。此处用被动钩子/新机制补全
// 可观察效果；多人与 Sovereign Blade 等未实现体系以近似效果替代，
// 描述同步中文并注明近似。数据驱动：只补数据，不硬编码逻辑。
import type { CardData } from "../core/types";

export const PASSIVE_CARD_FIXES: Record<string, Partial<CardData>> = {
  // ---- 铁甲战士 ----
  aggression: {
    description: "每回合开始时，从弃牌堆随机取 1 张攻击牌入手并升级它。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [
          {
            op: "retrieveFromDiscard",
            amount: 1,
            cardType: "attack",
            upgrade: true,
          },
        ],
      },
    ],
  },
  barricade: {
    description: "获得壁垒：你的格挡不会在回合开始时被清除。",
    effects: [{ op: "apply", status: "barricade", amount: 1, target: "self" }],
  },
  corruption: {
    description: "每当你打出技能牌，随机消耗 1 张手牌（近似腐化效果）。",
    effects: [
      {
        op: "passive",
        hook: "skillPlayed",
        effects: [{ op: "exhaustRandom", amount: 1 }],
      },
    ],
  },
  cruelty: {
    description: "每当你造成伤害，对所有敌人造成 1 点额外伤害（近似：易伤增伤）。",
    effects: [
      {
        op: "passive",
        hook: "damageDealt",
        effects: [{ op: "damageAll", amount: 1 }],
      },
    ],
  },
  hellraiser: {
    description: "每当你抽到打击类牌，对随机敌人造成 3 点伤害（近似）。",
    effects: [
      {
        op: "passive",
        hook: "drawCard",
        effects: [{ op: "damage", amount: 3 }],
      },
    ],
  },
  juggling: {
    description: "每回合结束时，将 1 张随机攻击牌加入手牌（近似：抛接复制）。",
    effects: [
      {
        op: "passive",
        hook: "turnEnd",
        effects: [
          { op: "addRandomCard", cardType: "attack", to: "hand", amount: 1 },
        ],
      },
    ],
  },
  stampede: {
    description: "每回合结束时，对随机敌人造成 5 点伤害（近似：攻击自动打出）。",
    effects: [
      {
        op: "passive",
        hook: "turnEnd",
        effects: [{ op: "damage", amount: 5 }],
      },
    ],
  },
  stone_armor: {
    description: "获得 4 层装甲（受到伤害时优先扣除装甲）。",
    effects: [{ op: "apply", status: "plating", amount: 4, target: "self" }],
  },
  tank: {
    description: "获得 6 层装甲（暂无队友系统，以装甲近似坦克承伤）。",
    effects: [{ op: "apply", status: "plating", amount: 6, target: "self" }],
  },
  unmovable: {
    description: "每当你获得格挡，额外获得 1 点格挡（近似：格挡翻倍）。",
    effects: [
      {
        op: "passive",
        hook: "blockGained",
        effects: [{ op: "block", amount: 1 }],
      },
    ],
  },
  // ---- 静默猎手 ----
  accelerant: {
    description: "每回合开始时，对所有敌人施加 2 层中毒（近似：毒加速触发）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "apply", status: "poison", amount: 2, target: "allEnemies" }],
      },
    ],
  },
  accuracy: {
    description: "每回合开始时获得 1 点力量（近似：飞刀增伤）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "apply", status: "strength", amount: 1, target: "self" }],
      },
    ],
  },
  master_planner: {
    description: "每当你打出技能牌，抽 1 张牌（近似：技能附奇巧）。",
    effects: [
      {
        op: "passive",
        hook: "skillPlayed",
        effects: [{ op: "draw", amount: 1 }],
      },
    ],
  },
  phantom_blades: {
    description: "每回合开始时，将 1 张飞刀加入手牌（近似：幻影刀锋）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "addCard", cardId: "shiv", amount: 1 }],
      },
    ],
  },
  tracking: {
    description: "每当你造成伤害，对所有敌人造成 2 点额外伤害（近似：虚弱增伤）。",
    effects: [
      {
        op: "passive",
        hook: "damageDealt",
        effects: [{ op: "damageAll", amount: 2 }],
      },
    ],
  },
  well_laid_plans: {
    description: "获得保留：回合结束时保留 1 张手牌不弃置。",
    effects: [{ op: "apply", status: "retain", amount: 1, target: "self" }],
  },
  // ---- 故障机器人 ----
  capacitor: {
    description: "宝珠槽上限 +2。",
    effects: [{ op: "orbSlots", amount: 2 }],
  },
  creative_ai: {
    description: "每回合开始时，将 1 张随机能力牌加入手牌。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [
          { op: "addRandomCard", cardType: "power", to: "hand", amount: 1 },
        ],
      },
    ],
  },
  echo_form: {
    description: "每回合开始时抽 1 张牌（近似：首张卡重复效果）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "draw", amount: 1 }],
      },
    ],
  },
  feral: {
    description: "每回合开始时，将 1 张随机攻击牌加入手牌（近似：0 费攻击回手）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [
          { op: "addRandomCard", cardType: "attack", to: "hand", amount: 1 },
        ],
      },
    ],
  },
  loop: {
    description: "每回合开始时打出最左侧宝珠（近似：循环触发宝珠）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "evoke", amount: 1 }],
      },
    ],
  },
  subroutine: {
    description: "每回合开始时抽 1 张牌（近似：子程序运转）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "draw", amount: 1 }],
      },
    ],
  },
  trash_to_treasure: {
    description: "每回合开始时引导 1 颗闪电宝珠（近似：状态牌变废为宝）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "channel", orb: "lightning" }],
      },
    ],
  },
  one_for_all: {
    description: "从弃牌堆取回 2 张牌并升级它们。",
    effects: [{ op: "retrieveFromDiscard", amount: 2, upgrade: true }],
  },
  // ---- 亡灵契约师 ----
  calcify: {
    description: "每回合开始时为骷髅护卫回复 4 点生命（近似：钙化强化）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "healSummon", amount: 4 }],
      },
    ],
  },
  call_of_the_void: {
    description: "每回合开始时，将 1 张随机卡牌加入手牌。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "addRandomCard", to: "hand", amount: 1 }],
      },
    ],
  },
  capture_spirit: {
    description: "造成 3 点伤害，获得 3 点灵魂。",
    effects: [
      { op: "damage", amount: 3 },
      { op: "gainSouls", amount: 3 },
    ],
  },
  forbidden_grimoire: {
    description: "战斗结束时回复 3 点生命（近似：禁书收获）。",
    effects: [
      {
        op: "passive",
        hook: "combatEnd",
        effects: [{ op: "heal", amount: 3 }],
      },
    ],
  },
  glimpse_beyond: {
    description: "获得 3 点灵魂，抽 1 张牌（近似：窥见彼岸）。",
    effects: [
      { op: "gainSouls", amount: 3 },
      { op: "draw", amount: 1 },
    ],
  },
  lethality: {
    description: "每回合开始时获得 2 点活力（下次攻击伤害 +2）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "apply", status: "vigor", amount: 2, target: "self" }],
      },
    ],
  },
  reaper_form: {
    description: "每当你造成伤害，对所有敌人施加 1 层灾厄。",
    effects: [
      {
        op: "passive",
        hook: "damageDealt",
        effects: [{ op: "apply", status: "doom", amount: 1, target: "allEnemies" }],
      },
    ],
  },
  sentry_mode: {
    description: "每回合开始时，将 1 张随机攻击牌加入手牌（近似：哨兵自动攻击）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [
          { op: "addRandomCard", cardType: "attack", to: "hand", amount: 1 },
        ],
      },
    ],
  },
  sleight_of_flesh: {
    description: "每当你施加状态效果，对所有敌人造成 1 点伤害（近似：血肉戏法）。",
    effects: [
      {
        op: "passive",
        hook: "statusApplied",
        effects: [{ op: "damageAll", amount: 1 }],
      },
    ],
  },
  soulbound: {
    description: "每回合开始时获得 1 点灵魂。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "gainSouls", amount: 1 }],
      },
    ],
  },
  cacophony: {
    description: "每回合开始时，对所有敌人造成 2 点伤害（近似：刺耳噪音）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "damageAll", amount: 2 }],
      },
    ],
  },
  // ---- 储君 ----
  furnace: {
    description: "每回合开始时锻造 4（升级手牌中 4 张随机牌）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "forge", amount: 4 }],
      },
    ],
  },
  hammer_time: {
    description: "每回合结束时锻造 2（近似：队友协锻暂以自锻替代）。",
    effects: [
      {
        op: "passive",
        hook: "turnEnd",
        effects: [{ op: "forge", amount: 2 }],
      },
    ],
  },
  monarchs_gaze: {
    description: "每当你打出攻击牌，对所有敌人施加 1 层虚弱（近似：君主凝视）。",
    effects: [
      {
        op: "passive",
        hook: "attackPlayed",
        effects: [{ op: "apply", status: "weak", amount: 1, target: "allEnemies" }],
      },
    ],
  },
  neutron_aegis: {
    description: "消耗 5 点星辰，获得 8 层装甲。",
    starsCost: 5,
    effects: [{ op: "apply", status: "plating", amount: 8, target: "self" }],
  },
  royalties: {
    description: "战斗结束时回复 3 点生命（近似：王室贡金收益）。",
    effects: [
      {
        op: "passive",
        hook: "combatEnd",
        effects: [{ op: "heal", amount: 3 }],
      },
    ],
  },
  seeking_edge: {
    description: "锻造 7（升级手牌中 7 张随机牌）。",
    effects: [{ op: "forge", amount: 7 }],
  },
  spectrum_shift: {
    description: "每回合开始时，将 1 张随机无色牌加入手牌。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "addRandomCard", to: "hand", amount: 1 }],
      },
    ],
  },
  sword_sage: {
    description: "每回合开始时获得 1 点力量（近似：剑圣武艺精进）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "apply", status: "strength", amount: 1, target: "self" }],
      },
    ],
  },
  // ---- 无色 ----
  beacon_of_hope: {
    description: "每回合开始时回复 2 点生命（暂无队友系统，以自愈近似）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "heal", amount: 2 }],
      },
    ],
  },
  calamity: {
    description: "每当你打出攻击牌，将 1 张随机攻击牌加入手牌。",
    effects: [
      {
        op: "passive",
        hook: "attackPlayed",
        effects: [
          { op: "addRandomCard", cardType: "attack", to: "hand", amount: 1 },
        ],
      },
    ],
  },
  entropy: {
    description: "每回合开始时，变形手牌中的 1 张牌。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "transformCard", amount: 1 }],
      },
    ],
  },
  eternal_armor: {
    description: "获得 7 层装甲。",
    effects: [{ op: "apply", status: "plating", amount: 7, target: "self" }],
  },
  fasten: {
    description: "每回合开始时获得 3 点格挡（近似：加固防御）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "block", amount: 3 }],
      },
    ],
  },
  mayhem: {
    description: "每回合开始时，将抽牌堆顶的牌抽入手（近似：混乱打出）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "playTopCard" }],
      },
    ],
  },
  nostalgia: {
    description: "每回合开始时，从弃牌堆取回 1 张牌（近似：怀旧回收）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "retrieveFromDiscard", amount: 1 }],
      },
    ],
  },
  prep_time: {
    description: "每回合开始时获得 4 点活力（下次攻击伤害 +4）。",
    effects: [
      {
        op: "passive",
        hook: "turnStart",
        effects: [{ op: "apply", status: "vigor", amount: 4, target: "self" }],
      },
    ],
  },
  stratagem: {
    description: "每当洗牌时，抽 1 张牌（近似：计谋选牌）。",
    effects: [
      {
        op: "passive",
        hook: "shuffle",
        effects: [{ op: "draw", amount: 1 }],
      },
    ],
  },
};
