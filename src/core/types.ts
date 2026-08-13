// ---------------------------------------------------------------------------
// Core data models. Everything a player can DIY lives here as plain data,
// so the game logic never hard-codes a specific card or enemy.
// ---------------------------------------------------------------------------

export type EffectTarget = "self" | "enemy" | "allEnemies" | "none";

export type StatusType =
  | "strength"
  | "dexterity"
  | "vulnerable"
  | "weak"
  | "poison"
  | "frail"
  | "thorns"
  | "ritual"
  | "metallicize"
  | "intangible"
  | "artifact";

export interface StatusDef {
  id: StatusType;
  name: string;
  description: string;
  positive: boolean;
}

export const STATUS_DEFS: Record<StatusType, StatusDef> = {
  strength: {
    id: "strength",
    name: "力量",
    description: "每层使攻击伤害 +1",
    positive: true,
  },
  dexterity: {
    id: "dexterity",
    name: "敏捷",
    description: "每层使获得的格挡 +1",
    positive: true,
  },
  vulnerable: {
    id: "vulnerable",
    name: "易伤",
    description: "受到攻击伤害 +50%，回合结束 -1",
    positive: false,
  },
  weak: {
    id: "weak",
    name: "虚弱",
    description: "造成攻击伤害 -25%，回合结束 -1",
    positive: false,
  },
  poison: {
    id: "poison",
    name: "中毒",
    description: "回合开始受到等同层数的伤害，然后 -1",
    positive: false,
  },
  frail: {
    id: "frail",
    name: "脆弱",
    description: "获得的格挡 -25%，回合结束 -1",
    positive: false,
  },
  thorns: {
    id: "thorns",
    name: "荆棘",
    description: "每次受到攻击反伤 3 点",
    positive: true,
  },
  ritual: {
    id: "ritual",
    name: "仪式",
    description: "每回合结束获得 +1 力量",
    positive: true,
  },
  metallicize: {
    id: "metallicize",
    name: "金属化",
    description: "每回合结束获得 +1 格挡",
    positive: true,
  },
  intangible: {
    id: "intangible",
    name: "虚无",
    description: "本回合受到的伤害降为 1，回合结束 -1",
    positive: true,
  },
  artifact: {
    id: "artifact",
    name: "人工制品",
    description: "免疫下一次负面状态，随后 -1",
    positive: true,
  },
};

export type Effect =
  | { op: "damage"; amount: number; hits?: number }
  | { op: "block"; amount: number }
  | { op: "apply"; status: StatusType; amount: number; target: EffectTarget }
  | {
      op: "multiplyStatus";
      status: StatusType;
      multiplier: number;
      target: EffectTarget;
    }
  | { op: "draw"; amount: number }
  | { op: "energy"; amount: number }
  | { op: "heal"; amount: number }
  | { op: "loseHp"; amount: number }
  | { op: "damageAll"; amount: number }
  | { op: "addCard"; cardId: string; amount?: number }
  | { op: "exhaustRandom"; amount?: number }
  | { op: "gainGold"; amount: number };

export type CardType = "attack" | "skill" | "power";
export type CardRarity = "starter" | "common" | "uncommon" | "rare";
export type CardTarget = "enemy" | "allEnemies" | "self" | "none";

// Pools decide where a card can appear. A card without `pools` (or with an
// empty list) is available everywhere.
export type CardPool = "reward" | "boss" | "shop" | "event";

export interface CardData {
  id: string;
  name: string;
  type: CardType;
  cost: number;
  rarity: CardRarity;
  target: CardTarget;
  description: string;
  effects: Effect[];
  pools?: CardPool[];
  // 游戏版本/拓展包标记（如 "基础版"、"DLC1"），留空 = 基础内容。
  version?: string;
  exhaust?: boolean;
  ethereal?: boolean;
  art?: string;
  color?: string;
  upgrade?: {
    cost?: number;
    description?: string;
    effects?: Effect[];
    exhaust?: boolean;
  };
}

export type EnemyPattern = "loop" | "random";

export interface EnemyMove {
  name: string;
  type: "attack" | "defend" | "buff" | "debuff" | "special";
  damage?: number;
  hits?: number;
  block?: number;
  statuses?: {
    status: StatusType;
    amount: number;
    target: "self" | "player";
  }[];
  heal?: number;
}

export interface EnemyData {
  id: string;
  name: string;
  maxHp: number;
  pattern: EnemyPattern;
  moves: EnemyMove[];
  art?: string;
  color?: string;
  isBoss?: boolean;
}

export type RelicTrigger =
  | "combatStart"
  | "turnStart"
  | "turnEnd"
  | "cardPlayed"
  | "damageDealt"
  | "blockGained"
  | "battleEnd";

// Pools decide where a relic can appear (reward = 普通/精英掉落,
// boss = 首领遗物, shop = 商店, event = 事件). Absent/empty = everywhere.
export type RelicPool = "reward" | "boss" | "shop" | "event";

export interface RelicData {
  id: string;
  name: string;
  description: string;
  art?: string;
  trigger: RelicTrigger;
  effects: Effect[];
  pools?: RelicPool[];
  // 游戏版本/拓展包标记（如 "基础版"、"DLC1"），留空 = 基础内容。
  version?: string;
  energyBonus?: number;
  drawBonus?: number;
}

// 先古角色：每层第一个节点是「先古事件」，进入后先回血再随机给一件
// 该角色专属池里的先古遗物。不同难度可覆盖回血比例。
export interface AncientData {
  id: string;
  name: string;
  text: string;
  art?: string;
  // 回复缺失生命值的百分比，默认 100（满血）。
  healPercent?: number;
  // 先古遗物池：跟着先古角色走。
  relicPool: string[];
}

export interface EventOption {
  label: string;
  description?: string;
  goldCost?: number;
  effects: Effect[];
  addCards?: string[];
  addRelic?: string;
  // Pick one random relic from this id pool (skips relics already owned).
  addRelicPool?: string[];
  removeCards?: number;
  loseMaxHp?: number;
  fightEnemy?: string;
  upgradeRandomCard?: boolean;
}

export interface EventOptionResult {
  upgradedCard: string | null;
  gainedRelics: string[];
}

export interface EventData {
  id: string;
  name: string;
  text: string;
  art?: string;
  options: EventOption[];
}

export interface StatusMap {
  strength?: number;
  dexterity?: number;
  vulnerable?: number;
  weak?: number;
  poison?: number;
  frail?: number;
  thorns?: number;
  ritual?: number;
  metallicize?: number;
  intangible?: number;
  artifact?: number;
}

export interface CombatUnit {
  hp: number;
  maxHp: number;
  block: number;
  statuses: StatusMap;
}

export interface CardInstance {
  uid: string;
  cardId: string;
}

// Piles hold combat-local instance uids. The combat maps each uid back to a
// static card id so identical cards stay distinguishable during a fight and
// cards generated mid-battle get their own instance.
export interface PlayerCombatState extends CombatUnit {
  energy: number;
  maxEnergy: number;
  drawPile: string[];
  hand: string[];
  discardPile: string[];
  exhaustPile: string[];
  // 本场战斗中暂时移除的牌（目前只放打出的能力牌）。独立于消耗堆，
  // 这样未来「从消耗堆拉回牌」的机制不会误伤能力牌；下一场战斗照常可用。
  removedPile: string[];
}

export interface EnemyCombatState extends CombatUnit {
  id: string;
  name: string;
  art?: string;
  moveIndex: number;
  isBoss: boolean;
}

export type MapNodeType =
  | "battle"
  | "elite"
  | "event"
  | "shop"
  | "rest"
  | "treasure"
  | "boss"
  | "ancient";

export interface MapNode {
  id: string;
  row: number;
  col: number;
  type: MapNodeType;
  next: string[];
}

export interface PlayerRunState {
  hp: number;
  maxHp: number;
  gold: number;
  deck: string[];
  relics: string[];
}

export type RunStatus =
  | "menu"
  | "map"
  | "battle"
  | "ancient"
  | "event"
  | "shop"
  | "rest"
  | "treasure"
  | "victory"
  | "defeat";

export interface RunSettings {
  startingHp?: number;
  startingGold?: number;
  startingDeck?: string[];
  drawPerTurn?: number;
  energyPerTurn?: number;
  // 先古事件回血比例（回复缺失生命值的百分比），覆盖先古角色默认值。
  ancientHealPercent?: number;
  // 指定使用哪个先古角色（留空 = 使用默认先古角色）。
  ancientId?: string;
}

export interface RunState {
  act: number;
  status: RunStatus;
  player: PlayerRunState;
  map: MapNode[];
  currentNodeId: string | null;
  statuses: Record<string, number>;
}

export interface GameDatabase {
  cards: Record<string, CardData>;
  enemies: Record<string, EnemyData>;
  relics: Record<string, RelicData>;
  events: Record<string, EventData>;
  ancients: Record<string, AncientData>;
}
