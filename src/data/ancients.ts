import type { AncientData } from "../core/types";

// 先古角色：目前统一使用一个先古角色池（暂不做「层数 × 角色」的对应）。
// 每层第一个节点是先古事件：先回血（healPercent，难度可覆盖），
// 再随机获得 relicPool 里的一件先古遗物。
export const BASE_ANCIENTS: AncientData[] = [
  {
    id: "ancient_wanderer",
    name: "先古旅人",
    text: "一位来自时间尽头的旅人拦住了你。他审视着你的伤势，缓缓抬起手——温暖的力量涌入你的身体，一枚古老的遗物落入你手中。",
    art: "🧭",
    healPercent: 100,
    relicPool: [
      "ancient_mirror",
      "ancient_core",
      "ancient_totem",
      "ancient_compass",
    ],
  },
];
