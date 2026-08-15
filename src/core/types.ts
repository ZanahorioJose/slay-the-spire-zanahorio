// ---------------------------------------------------------------------------
// Core data models. Everything a player can DIY lives here as plain data,
// so the game logic never hard-codes a specific card or enemy.
// ---------------------------------------------------------------------------

// 基础拓展包代号：杀戮尖塔 2。未来 DLC 用各自代号命名。
export const STS2_PACK = "STS2";

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
  | "artifact"
  | "starlight"
  | "soulflow"
  | "doom"
  | "plating"
  | "vigor"
  | "retain"
  | "barricade";

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
  starlight: {
    id: "starlight",
    name: "星辉",
    description: "每回合开始获得 1 点星辰",
    positive: true,
  },
  soulflow: {
    id: "soulflow",
    name: "灵魂涌动",
    description: "每回合开始获得 1 点灵魂",
    positive: true,
  },
  doom: {
    id: "doom",
    name: "灾厄",
    description: "累计 10 层时被处决，回合结束 -1",
    positive: false,
  },
  plating: {
    id: "plating",
    name: "装甲",
    description: "受到伤害时优先扣除装甲层数",
    positive: true,
  },
  vigor: {
    id: "vigor",
    name: "活力",
    description: "下一次攻击伤害提升等同层数，随后归零",
    positive: true,
  },
  retain: {
    id: "retain",
    name: "保留",
    description: "回合结束时保留等量手牌（不弃置）",
    positive: true,
  },
  barricade: {
    id: "barricade",
    name: "壁垒",
    description: "你的格挡不会在回合开始时被清除",
    positive: true,
  },
};

// 状态图标：状态条上以图标 + 层数显示，鼠标悬停显示 STATUS_DEFS 的解释。
export const STATUS_ICONS: Record<StatusType, string> = {
  strength: "💪",
  dexterity: "🦶",
  vulnerable: "🎯",
  weak: "💫",
  poison: "☠️",
  frail: "🕸️",
  thorns: "🌵",
  ritual: "🔮",
  metallicize: "⚙️",
  intangible: "👻",
  artifact: "🛡️",
  starlight: "⭐",
  soulflow: "🌀",
  doom: "💀",
  plating: "🛡️",
  vigor: "🔥",
  retain: "📌",
  barricade: "🧱",
};

export type Effect =
  | { op: "damage"; amount: number; hits?: number; scaling?: DamageScaling }
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
  | { op: "damageAll"; amount: number; scaling?: DamageScaling }
  | { op: "addCard"; cardId: string; amount?: number }
  | { op: "exhaustRandom"; amount?: number }
  | { op: "gainGold"; amount: number }
  | { op: "gainStars"; amount: number }
  | { op: "gainSouls"; amount: number }
  | { op: "channel"; orb: OrbType }
  | { op: "evoke"; amount?: number }
  | { op: "focus"; amount: number }
  | { op: "orbSlots"; amount: number }
  | { op: "summon"; hp?: number; damage?: number; name?: string; art?: string }
  | { op: "healSummon"; amount: number }
  | { op: "retrieveFromExhaust"; amount?: number }
  | { op: "discard"; amount?: number }
  | { op: "forge"; amount?: number }
  | {
      op: "addCountdown";
      turns: number;
      label: string;
      icon?: string;
      effects: Effect[];
      target?: "player" | "enemies";
    }
  | { op: "passive"; hook: PassiveHook; effects: Effect[] }
  | {
      op: "retrieveFromDiscard";
      amount?: number;
      cardType?: "attack" | "skill" | "power";
      upgrade?: boolean;
    }
  | {
      op: "addRandomCard";
      cardType?: "attack" | "skill" | "power";
      rarity?: CardRarity;
      to?: "hand" | "discard" | "draw";
      amount?: number;
    }
  | { op: "transformCard"; amount?: number }
  | { op: "playTopCard" };

// 被动效果触发时机（能力牌注册，与遗物同构、防递归）。
export type PassiveHook =
  | "turnStart"
  | "turnEnd"
  | "cardPlayed"
  | "attackPlayed"
  | "skillPlayed"
  | "blockGained"
  | "cardExhausted"
  | "damageDealt"
  | "receiveDamage"
  | "combatEnd"
  | "shuffle"
  | "drawCard"
  | "statusApplied";

export type OrbType = "lightning" | "frost" | "dark" | "glass";

export const ORB_DEFS: Record<OrbType, { name: string; art: string }> = {
  lightning: { name: "闪电", art: "⚡" },
  frost: { name: "冰霜", art: "❄️" },
  dark: { name: "黑暗", art: "🌑" },
  glass: { name: "玻璃", art: "🪟" },
};

// 条件增伤：伤害随某计数/数值线性提升（如「每张消耗牌 +3 伤害」）。
export interface DamageScaling {
  per:
    | "exhaustPile"
    | "block"
    | "vulnerable"
    | "attacksPlayed"
    | "skillsPlayed"
    | "cardsInHand"
    | "poisonOnEnemy"
    | "strikeCards";
  amount: number;
}

// 延迟效果（计数器）：若干回合后结算（「下回合 / X 回合后」）。
export interface PendingEffect {
  label: string;
  turns: number;
  icon?: string;
  effects: Effect[];
  target: "player" | "enemies";
}

export interface OrbState {
  type: OrbType;
  // 黑暗/玻璃宝珠的蓄力值（闪电/冰霜不用）。
  passive: number;
}

// 亡灵契约师的召唤物（Osty 骷髅左手）：回合开始自动攻击随机敌人。
export interface SummonState extends CombatUnit {
  name: string;
  art?: string;
  damage: number;
}

export type CardType = "attack" | "skill" | "power";
export type CardRarity = "starter" | "common" | "uncommon" | "rare";
export type CardTarget = "enemy" | "allEnemies" | "self" | "none";
// 卡面材质（与稀有度解耦）：缺省时按稀有度派生
// （starter→粗布、common→银、uncommon→合金、rare→合金辉光），
// gold/foil 为预留的特殊材质（金卡/闪卡）。
export type CardMaterial = "cloth" | "silver" | "alloy" | "gold" | "foil";
// 卡面布局：normal = 普通卡（画窗内卡图 + 边框 UI），
// alt = 异画卡（满版卡图 + 悬浮 UI）。缺省 normal。
export type CardArtStyle = "normal" | "alt";

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
  // 卡面材质（可选，缺省按稀有度派生）。
  material?: CardMaterial;
  // 卡面布局（普通卡 / 异画卡）。
  artStyle?: CardArtStyle;
  // 卡面方案代号（对应 docs/art-card-layout_v4.html 的 A-G 方案，可选）。
  scheme?: string;
  // 卡图编号（如 "NO.102"，v4 底部编号条）。
  number?: string;
  // 卡图定位参数（v4 画窗微调，渲染层使用）。
  artScale?: number;
  artX?: number;
  artY?: number;
  // 打出需要的星辰/灵魂（STS2 资源），缺省 0。
  starsCost?: number;
  soulsCost?: number;
  // 奇巧（Sly）：这张牌被弃置时触发的效果。
  sly?: Effect[];
  pools?: CardPool[];
  // 所属角色 id（留空 = 无色，任意角色可用）。
  character?: string;
  // 所属拓展包代号（如 STS2 / 未来 DLC 代号），留空 = 基础包。
  pack?: string;
  // 游戏版本标记（如 "基础版"、"DLC1"），留空 = 基础内容。
  version?: string;
  // 风味文案：卡面底部的趣味描述（不参与游戏逻辑）。
  flavor?: string;
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
  // 两帧待机动画名（squish / breathe / rock / sway / bob / hover / float），
  // 对应 styles.css 的 .enemy-anim-*；留空使用默认浮动。未来像素帧图
  // 就绪后，anim 可直接映射 sprite sheet 的待机行。
  anim?: string;
  pack?: string;
  art?: string;
  color?: string;
  isBoss?: boolean;
}

export type RelicTrigger =
  | "combatStart"
  | "turnStart"
  | "turnEnd"
  | "cardPlayed"
  | "cardExhausted"
  | "receiveDamage"
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
  // 所属角色 id（留空 = 通用遗物）。
  character?: string;
  // 所属拓展包代号（如 STS2 / 未来 DLC 代号），留空 = 基础包。
  pack?: string;
  // 游戏版本标记（如 "基础版"、"DLC1"），留空 = 基础内容。
  version?: string;
  energyBonus?: number;
  drawBonus?: number;
}

// 角色：决定开局生命/金币/牌组/初始遗物，以及卡牌奖励与商店的可用卡池。
export interface CharacterData {
  id: string;
  name: string;
  art?: string;
  color?: string;
  pack?: string;
  startingHp: number;
  startingGold?: number;
  startingDeck: string[];
  startingRelics: string[];
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
  addPotions?: string[];
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
  starlight?: number;
  soulflow?: number;
  doom?: number;
  plating?: number;
  vigor?: number;
  retain?: number;
  barricade?: number;
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
  stars: number;
  souls: number;
  focus: number;
  // 宝珠槽上限（默认 3，电容器等可提升）。
  orbSlots: number;
  orbs: OrbState[];
  summon: SummonState | null;
  // 已注册的被动效果（能力牌打出时登记）。
  passives: { hook: PassiveHook; effects: Effect[] }[];
  // 延迟效果计数器（「下回合 / X 回合后」）。
  pending: PendingEffect[];
  attacksPlayedThisTurn: number;
  skillsPlayedThisTurn: number;
  drawPile: string[];
  hand: string[];
  discardPile: string[];
  exhaustPile: string[];
  // 本场战斗中暂时移除的牌（目前只放打出的能力牌）。独立于消耗堆，
  // 这样未来「从消耗堆拉回牌」的机制不会误伤能力牌；下一场战斗照常可用。
  removedPile: string[];
}

export interface PotionData {
  id: string;
  name: string;
  description: string;
  art?: string;
  rarity?: "common" | "uncommon" | "rare";
  pack?: string;
  character?: string;
  effects: Effect[];
}

export interface EnemyCombatState extends CombatUnit {
  id: string;
  name: string;
  art?: string;
  anim?: string;
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
  potions: string[];
  // 当前角色 id（决定起始牌组/遗物与卡池过滤）。
  character?: string;
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
  characterId?: string;
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
  characters: Record<string, CharacterData>;
  potions: Record<string, PotionData>;
}
