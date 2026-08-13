import type { EventData } from "../core/types";

export const BASE_EVENTS: EventData[] = [
  {
    id: "spring",
    name: "神秘泉水",
    text: "一汪清澈的泉水在黑暗中闪烁微光，空气中飘着淡淡的草药味。",
    art: "⛲",
    options: [
      {
        label: "喝下泉水",
        description: "回复 15 点生命",
        effects: [{ op: "heal", amount: 15 }],
      },
      {
        label: "舀一瓶带走",
        description: "回复 8 点生命，获得 10 金币",
        effects: [
          { op: "heal", amount: 8 },
          { op: "gainGold", amount: 10 },
        ],
      },
      {
        label: "无视它",
        description: "什么也不做",
        effects: [],
      },
    ],
  },
  {
    id: "shrine",
    name: "无名祭坛",
    text: "一座古老的祭坛矗立于此，上面刻着模糊的符文。献上什么，或许会得到什么。",
    art: "🏛️",
    options: [
      {
        label: "献上生命",
        description: "失去 6 点生命，获得 1 点力量",
        effects: [
          { op: "loseHp", amount: 6 },
          { op: "apply", status: "strength", amount: 1, target: "self" },
        ],
      },
      {
        label: "献上金币",
        description: "失去 30 金币，获得 1 件遗物",
        goldCost: 30,
        effects: [],
        addRelicPool: [
          "jade_pendant",
          "tactical_manual",
          "thorn_armor",
          "war_drum",
          "blood_vial",
        ],
      },
      {
        label: "离开",
        description: "什么也不做",
        effects: [],
      },
    ],
  },
  {
    id: "merchant_ghost",
    name: "幽灵商人",
    text: "一个半透明的身影推着一辆手推车，车上堆满了奇异的物件。",
    art: "👻",
    options: [
      {
        label: "购买力量（30 金币）",
        description: "获得 2 点力量",
        goldCost: 30,
        effects: [{ op: "apply", status: "strength", amount: 2, target: "self" }],
      },
      {
        label: "购买敏捷（30 金币）",
        description: "获得 2 点敏捷",
        goldCost: 30,
        effects: [{ op: "apply", status: "dexterity", amount: 2, target: "self" }],
      },
      {
        label: "离开",
        description: "什么也不做",
        effects: [],
      },
    ],
  },
  {
    id: "bonfire",
    name: "篝火旁的旅人",
    text: "一个疲惫的旅人正围着篝火取暖。他愿意分享自己的战斗经验。",
    art: "🔥",
    options: [
      {
        label: "聆听教诲",
        description: "随机升级一张牌",
        effects: [],
      },
      {
        label: "分享干粮",
        description: "失去 5 金币，回复 10 点生命",
        effects: [{ op: "heal", amount: 10 }],
      },
      {
        label: "道别",
        description: "什么也不做",
        effects: [],
      },
    ],
  },
];
