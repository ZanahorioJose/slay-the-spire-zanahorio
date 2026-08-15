// 效果文本生成器：从结构化 Effect 生成中文卡面效果文本。
// 纯逻辑、无 DOM 依赖，供数据库构建（空描述自动填充）与编辑器
// （「从效果自动生成」按钮）使用。措辞对齐现有手写中文卡面。
import type { DamageScaling, Effect, StatusType } from "../core/types";
import { ORB_DEFS, STATUS_DEFS } from "../core/types";

// 用「点」计量的状态（力量/敏捷等属性类），其余用「层」。
const POINT_STATUSES: ReadonlySet<StatusType> = new Set([
  "strength",
  "dexterity",
]);

function statusUnit(status: StatusType): string {
  return POINT_STATUSES.has(status) ? "点" : "层";
}

const SCALING_DESC: Record<DamageScaling["per"], string> = {
  exhaustPile: "消耗堆中每张牌",
  block: "你每有 1 点格挡",
  vulnerable: "敌人身上每层易伤",
  attacksPlayed: "本回合每打出一张攻击牌",
  skillsPlayed: "本回合每打出一张技能牌",
  cardsInHand: "你每有 1 张手牌",
  poisonOnEnemy: "敌人身上每层中毒",
  strikeCards: "你牌组中每张打击牌",
};

const PASSIVE_HOOK_ZH: Record<string, string> = {
  turnStart: "回合开始时",
  turnEnd: "回合结束时",
  cardPlayed: "打出牌时",
  attackPlayed: "打出攻击牌时",
  skillPlayed: "打出技能牌时",
  blockGained: "获得格挡时",
  cardExhausted: "消耗牌时",
  damageDealt: "造成伤害时",
  receiveDamage: "受到伤害时",
  combatEnd: "战斗结束时",
  shuffle: "洗牌时",
  drawCard: "抽牌时",
  statusApplied: "施加状态时",
};

const TOKEN_ZH: Record<string, string> = {
  shiv: "飞刀",
  soul: "灵魂",
  dazed: "眩晕",
  burn: "灼伤",
  wound: "伤口",
  slimed: "黏糊",
  debris: "碎片",
  fuel: "燃料",
};

const CARD_TYPE_ZH: Record<string, string> = {
  attack: "攻击牌",
  skill: "技能牌",
  power: "能力牌",
};

function describeSingle(effect: Effect): string {
  switch (effect.op) {
    case "damage": {
      let s = `造成 ${effect.amount} 点伤害`;
      if (effect.hits && effect.hits > 1) s += ` ${effect.hits} 次`;
      if (effect.scaling) {
        const base = SCALING_DESC[effect.scaling.per] ?? effect.scaling.per;
        s += `（${base}额外 +${effect.scaling.amount}）`;
      }
      return s;
    }
    case "block":
      return `获得 ${effect.amount} 点格挡`;
    case "apply": {
      const unit = statusUnit(effect.status);
      if (effect.target === "allEnemies") {
        return `对所有敌人施加 ${effect.amount} ${unit}${STATUS_DEFS[effect.status].name}`;
      }
      if (effect.target === "enemy") {
        return `施加 ${effect.amount} ${unit}${STATUS_DEFS[effect.status].name}`;
      }
      return `获得 ${effect.amount} ${unit}${STATUS_DEFS[effect.status].name}`;
    }
    case "multiplyStatus": {
      const unit = statusUnit(effect.status);
      const name = `${STATUS_DEFS[effect.status].name}${unit === "层" ? "层数" : ""}`;
      return effect.multiplier === 2
        ? `将${name}翻倍`
        : `将${name}变为 ${effect.multiplier} 倍`;
    }
    case "draw":
      return `抽 ${effect.amount} 张牌`;
    case "energy":
      return effect.amount >= 0
        ? `获得 ${effect.amount} 点能量`
        : `失去 ${-effect.amount} 点能量`;
    case "heal":
      return `回复 ${effect.amount} 点生命`;
    case "loseHp":
      return `失去 ${effect.amount} 点生命`;
    case "damageAll":
      return `对所有敌人造成 ${effect.amount} 点伤害`;
    case "addCard":
      return `将「${TOKEN_ZH[effect.cardId] ?? effect.cardId}」加入手牌${effect.amount && effect.amount > 1 ? ` ×${effect.amount}` : ""}`;
    case "exhaustRandom":
      return `随机消耗 ${effect.amount ?? 1} 张手牌`;
    case "gainGold":
      return `获得 ${effect.amount} 金币`;
    case "gainStars":
      return `获得 ${effect.amount} 点星辰`;
    case "gainSouls":
      return `获得 ${effect.amount} 点灵魂`;
    case "channel":
      return `引导${ORB_DEFS[effect.orb].name}宝珠`;
    case "evoke":
      return `激发 ${effect.amount ?? 1} 颗宝珠`;
    case "focus":
      return `集中 +${effect.amount}`;
    case "summon":
      return `召唤「${effect.name ?? "骷髅护卫"}」（${effect.hp ?? 1} 血 / ${effect.damage ?? 3} 攻）`;
    case "healSummon":
      return `召唤物回复 ${effect.amount} 点生命`;
    case "retrieveFromExhaust":
      return `从消耗堆取回 ${effect.amount ?? 1} 张牌`;
    case "discard":
      return effect.amount === undefined ? "弃置全部手牌" : `弃置 ${effect.amount} 张手牌`;
    case "forge":
      return `锻造 ${effect.amount ?? 1} 张手牌`;
    case "addCountdown":
      return effect.turns === 1
        ? `下回合，${effect.label}`
        : `${effect.turns} 回合后，${effect.label}`;
    case "orbSlots":
      return `宝珠槽上限 ${effect.amount >= 0 ? "+" : ""}${effect.amount}`;
    case "passive":
      return `被动（${PASSIVE_HOOK_ZH[effect.hook] ?? effect.hook}）：${describeEffects(effect.effects).replace(/。$/, "")}`;
    case "retrieveFromDiscard":
      return `从弃牌堆取回 ${effect.amount ?? 1} 张${
        effect.cardType ?? "牌"
      }${effect.upgrade ? "并升级" : ""}`;
    case "addRandomCard":
      return `将 ${effect.amount ?? 1} 张随机${CARD_TYPE_ZH[effect.cardType ?? ""] ?? "卡牌"}加入${
        effect.to === "draw" ? "抽牌堆" : effect.to === "discard" ? "弃牌堆" : "手牌"
      }`;
    case "transformCard":
      return `变形 ${effect.amount ?? 1} 张手牌`;
    case "playTopCard":
      return "将抽牌堆顶的牌抽入手";
  }
}

// 把多个效果拼成一句完整卡面文本（如「造成 5 点伤害，获得 3 点格挡。」）。
export function describeEffects(effects: Effect[]): string {
  if (!effects || effects.length === 0) return "";
  return effects.map(describeSingle).join("，") + "。";
}

// 单个效果的简短描述（编辑器效果行预览用，保留 target 标注）。
export function describeEffectShort(effect: Effect): string {
  return describeSingle(effect);
}
