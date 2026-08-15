import type { CharacterData } from "../core/types";
import { STS2_PACK } from "../core/types";

// 杀戮尖塔 2 的 5 个初始角色。起始牌组/生命/初始遗物参考 STS2 资料；
// 星辰/灵魂/宝珠等 STS2 机制尚未实现，相关效果以现有机制近似。
export const BASE_CHARACTERS: CharacterData[] = [
  {
    id: "warrior",
    name: "铁甲战士",
    art: "⚔️",
    color: "#c0553f",
    pack: STS2_PACK,
    startingHp: 80,
    startingGold: 99,
    startingDeck: ["strike", "strike", "strike", "strike", "strike", "defend", "defend", "defend", "defend", "bash"],
    startingRelics: ["burning_blood"],
  },
  {
    id: "silent",
    name: "静默猎手",
    art: "🏹",
    color: "#4f7fc4",
    pack: STS2_PACK,
    startingHp: 70,
    startingGold: 99,
    startingDeck: ["strike", "strike", "strike", "strike", "strike", "defend", "defend", "defend", "defend", "defend", "neutralize", "survivor"],
    startingRelics: ["ring_of_the_snake"],
  },
  {
    id: "regent",
    name: "储君",
    art: "👑",
    color: "#f0d98a",
    pack: STS2_PACK,
    startingHp: 75,
    startingGold: 99,
    startingDeck: ["strike", "strike", "strike", "strike", "defend", "defend", "defend", "defend", "falling_star", "venerate"],
    startingRelics: ["divine_right"],
  },
  {
    id: "necrobinder",
    name: "亡灵契约师",
    art: "💀",
    color: "#8a5fc0",
    pack: STS2_PACK,
    startingHp: 66,
    startingGold: 99,
    startingDeck: ["strike", "strike", "strike", "strike", "defend", "defend", "defend", "defend", "bodyguard", "unleash"],
    startingRelics: ["bound_phylactery"],
  },
  {
    id: "defect",
    name: "故障机器人",
    art: "🤖",
    color: "#5a7ab0",
    pack: STS2_PACK,
    startingHp: 75,
    startingGold: 99,
    startingDeck: ["strike", "strike", "strike", "strike", "defend", "defend", "defend", "defend", "zap", "dualcast"],
    startingRelics: ["cracked_core"],
  },
];
