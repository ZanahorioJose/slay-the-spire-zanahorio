import type { PotionData } from "../core/types";
import { STS2_PACK } from "../core/types";

// 药水：战斗内使用，效果直接作用于当前战斗。
export const BASE_POTIONS: PotionData[] = ([
  {
    id: "fire_potion",
    name: "烈焰药水",
    description: "对所有敌人造成 8 点伤害。",
    art: "🔥",
    rarity: "common",
    effects: [{ op: "damageAll", amount: 8 }],
  },
  {
    id: "blood_potion",
    name: "鲜血药水",
    description: "回复 10 点生命。",
    art: "🩸",
    rarity: "common",
    effects: [{ op: "heal", amount: 10 }],
  },
  {
    id: "strength_potion",
    name: "力量药水",
    description: "获得 2 点力量。",
    art: "💪",
    rarity: "common",
    effects: [{ op: "apply", status: "strength", amount: 2, target: "self" }],
  },
  {
    id: "dexterity_potion",
    name: "敏捷药水",
    description: "获得 2 点敏捷。",
    art: "🦶",
    rarity: "common",
    effects: [{ op: "apply", status: "dexterity", amount: 2, target: "self" }],
  },
  {
    id: "energy_potion",
    name: "能量药水",
    description: "获得 2 点能量。",
    art: "⚡",
    rarity: "uncommon",
    effects: [{ op: "energy", amount: 2 }],
  },
  {
    id: "draw_potion",
    name: "抽牌药水",
    description: "抽 3 张牌。",
    art: "🃏",
    rarity: "common",
    effects: [{ op: "draw", amount: 3 }],
  },
  {
    id: "poison_potion",
    name: "剧毒药水",
    description: "对所有敌人施加 4 层中毒。",
    art: "🧪",
    rarity: "uncommon",
    effects: [{ op: "apply", status: "poison", amount: 4, target: "allEnemies" }],
  },
  {
    id: "block_potion",
    name: "铁壁药水",
    description: "获得 12 点格挡。",
    art: "🛡️",
    rarity: "common",
    effects: [{ op: "block", amount: 12 }],
  },
] as PotionData[]).map((p) => ({ ...p, pack: p.pack ?? STS2_PACK }));
