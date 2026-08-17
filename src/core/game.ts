import { Combat } from "./combat";
import {
  getNode,
  generateMap,
  randomActBoss,
  randomElite,
  randomNormalEnemies,
  reachableNodes,
  rollGold,
} from "./map";
import { pickOne, weightedPick } from "./rng";
import type {
  AncientData,
  CardData,
  CharacterData,
  EventData,
  EventOption,
  EventOptionResult,
  GameDatabase,
  MapNode,
  MapNodeType,
  PotionData,
  RelicData,
  RelicPool,
  RunSettings,
  RunState,
  StatusType,
} from "./types";

export const STARTING_DECK = [
  "strike",
  "strike",
  "strike",
  "strike",
  "strike",
  "defend",
  "defend",
  "defend",
  "defend",
  "bash",
];

// A card/relic with no `pools` field (or an empty list) is available in every
// pool; otherwise it only appears in the pools it lists.
export function inPool<T extends { pools?: string[] }>(
  item: T,
  pool: string
): boolean {
  return !item.pools || item.pools.length === 0 || item.pools.includes(pool);
}

export class Game {
  db: GameDatabase;
  run: RunState;
  combat: Combat | null = null;
  settings: RunSettings;

  constructor(db: GameDatabase, settings: RunSettings = {}) {
    this.db = db;
    this.settings = settings;
    this.run = this.newRun();
  }

  static fromRun(
    db: GameDatabase,
    settings: RunSettings,
    run: RunState
  ): Game {
    const game = new Game(db, settings);
    game.run = run;
    // Mid-battle snapshots are not persisted; fall back to the map so the
    // run can always resume from a sane state.
    if (run.status === "battle") {
      run.status = "map";
      run.currentNodeId = null;
    }
    return game;
  }

  newRun(): RunState {
    const character = this.currentCharacter();
    return {
      act: 1,
      status: "map",
      player: {
        hp: this.settings.startingHp ?? character?.startingHp ?? 70,
        maxHp: this.settings.startingHp ?? character?.startingHp ?? 70,
        gold: this.settings.startingGold ?? character?.startingGold ?? 99,
        deck: [
          ...(this.settings.startingDeck ??
            character?.startingDeck ??
            STARTING_DECK),
        ],
        relics: [...(character?.startingRelics ?? [])],
        potions: [],
        character: character?.id,
      },
      map: generateMap(1),
      currentNodeId: null,
      statuses: {},
      visitedNodes: [],
    };
  }

  // 当前角色：优先 settings.characterId，否则用默认（第一个）角色。
  currentCharacter(): CharacterData | undefined {
    const specified = this.settings.characterId
      ? this.db.characters[this.settings.characterId]
      : undefined;
    if (specified) return specified;
    return Object.values(this.db.characters)[0];
  }

  reset(): void {
    this.run = this.newRun();
    this.combat = null;
  }

  canMoveTo(nodeId: string): boolean {
    return reachableNodes(this.run.map, this.run.currentNodeId).some(
      (n) => n.id === nodeId
    );
  }

  enterNode(node: MapNode): void {
    this.run.currentNodeId = node.id;
    const visited = this.run.visitedNodes ?? [];
    if (!visited.includes(node.id)) {
      this.run.visitedNodes = [...visited, node.id];
    }
    switch (node.type) {
      case "battle":
      case "elite":
      case "boss":
        this.startCombat(node);
        break;
      case "ancient":
        this.run.status = "ancient";
        break;
      case "event":
        this.run.status = "event";
        break;
      case "shop":
        this.run.status = "shop";
        break;
      case "rest":
        this.run.status = "rest";
        break;
      case "treasure":
        this.run.status = "treasure";
        break;
    }
  }

  startCombat(node: MapNode, enemyIds?: string[]): Combat {
    const combat = new Combat(
      this.db,
      this.run.player.deck,
      this.run.player.relics,
      {
        drawPerTurn: this.settings.drawPerTurn,
        energyPerTurn: this.settings.energyPerTurn,
      }
    );
    combat.setPlayer(this.run.player.maxHp, this.run.player.hp);

    const ids =
      enemyIds ??
      (node.type === "boss"
        ? [randomActBoss(this.run.act)]
        : node.type === "elite"
          ? [randomElite()]
          : randomNormalEnemies(Math.random() < 0.35 ? 2 : 1));
    const enemyIds2 = ids;

    for (const id of enemyIds2) {
      const data = this.db.enemies[id];
      if (data) combat.addEnemy(data);
    }

    const statuses = this.currentStatuses();
    for (const [status, amount] of Object.entries(statuses)) {
      if (amount > 0) {
        combat.player.statuses[status as StatusType] = amount;
      }
    }
    combat.start();
    this.combat = combat;
    this.run.status = "battle";
    return combat;
  }

  startEventFight(enemyId: string): Combat {
    const node: MapNode = {
      id: "event-fight",
      row: 0,
      col: 0,
      type: "battle",
      next: [],
    };
    this.run.currentNodeId = node.id;
    return this.startCombat(node, [enemyId]);
  }

  finishBattle(won: boolean, node: MapNode): void {
    const combat = this.combat;
    this.combat = null;
    if (!won) {
      this.run.status = "defeat";
      return;
    }

    const player = this.run.player;
    if (combat) player.hp = combat.player.hp;
    player.hp = Math.max(1, Math.min(player.hp, player.maxHp));
    const gold = rollGold(node.type);
    player.gold += gold;

    if (node.type === "boss") {
      this.run.status = "victory";
      return;
    }
    this.run.status = "map";
  }

  rollCardReward(quality: "normal" | "elite" | "boss"): CardData[] {
    const rewardPool = quality === "boss" ? "boss" : "reward";
    const characterId = this.run.player.character;
    // 卡牌奖励只出现当前角色专属卡与无色卡。
    const characterOk = (c: CardData): boolean =>
      !c.character || c.character === characterId;
    const restricted = Object.values(this.db.cards).filter(
      (c) =>
        c.rarity !== "starter" &&
        characterOk(c) &&
        inPool(c, rewardPool)
    );
    // If every card is restricted to other pools, fall back to all
    // non-starter cards so rewards never break.
    const pool =
      restricted.length > 0
        ? restricted
        : Object.values(this.db.cards).filter(
            (c) => c.rarity !== "starter" && characterOk(c)
          );
    const picked: CardData[] = [];
    const usedIds = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const candidates = pool.filter((c) => !usedIds.has(c.id));
      if (candidates.length === 0) break;
      const rarityWeights =
        quality === "boss"
          ? { starter: 0, common: 1, uncommon: 2, rare: 3 }
          : quality === "elite"
            ? { starter: 0, common: 3, uncommon: 3, rare: 1 }
            : { starter: 0, common: 5, uncommon: 3, rare: 1 };
      const card = weightedPick(
        candidates.map((c) => ({ ...c, weight: rarityWeights[c.rarity] }))
      );
      picked.push(card);
      usedIds.add(card.id);
    }
    return picked;
  }

  // Roll one unowned relic from the given pool. "reward" is the default
  // normal/elite drop pool; "boss" / "shop" / "event" are opt-in sources.
  rollRelicReward(pool: RelicPool = "reward"): RelicData | undefined {
    const restricted = Object.values(this.db.relics).filter(
      (r) => !this.run.player.relics.includes(r.id) && inPool(r, pool)
    );
    const candidates =
      restricted.length > 0
        ? restricted
        : Object.values(this.db.relics).filter(
            (r) => !this.run.player.relics.includes(r.id)
          );
    if (candidates.length === 0) return undefined;
    return pickOne(candidates);
  }

  addCardToDeck(cardId: string): void {
    this.run.player.deck.push(cardId);
  }

  removeCardFromDeck(cardId: string): void {
    const index = this.run.player.deck.indexOf(cardId);
    if (index >= 0) this.run.player.deck.splice(index, 1);
  }

  removeCardAt(index: number): void {
    if (index >= 0 && index < this.run.player.deck.length) {
      this.run.player.deck.splice(index, 1);
    }
  }

  // Upgrade exactly one deck instance (one copy), never all cards with the
  // same id. Returns the upgraded card id, or null when not upgradable.
  upgradeCardAt(index: number): string | null {
    if (index < 0 || index >= this.run.player.deck.length) return null;
    const id = this.run.player.deck[index];
    if (id.endsWith("+") || !this.db.cards[id]?.upgrade) return null;
    this.run.player.deck[index] = `${id}+`;
    return id;
  }

  upgradeRandomCard(): string | null {
    const upgradableIndexes: number[] = [];
    this.run.player.deck.forEach((id, index) => {
      if (!id.endsWith("+") && this.db.cards[id]?.upgrade) {
        upgradableIndexes.push(index);
      }
    });
    if (upgradableIndexes.length === 0) return null;
    const index = pickOne(upgradableIndexes);
    const id = this.run.player.deck[index];
    this.run.player.deck[index] = `${id}+`;
    return id;
  }

  gainGold(amount: number): void {
    this.run.player.gold = Math.max(0, this.run.player.gold + amount);
  }

  heal(amount: number): void {
    this.run.player.hp = Math.min(
      this.run.player.maxHp,
      this.run.player.hp + amount
    );
  }

  loseHp(amount: number): void {
    this.run.player.hp = Math.max(0, this.run.player.hp - amount);
    if (this.run.player.hp <= 0) this.run.status = "defeat";
  }

  addRelic(relicId: string): void {
    if (!this.run.player.relics.includes(relicId)) {
      this.run.player.relics.push(relicId);
    }
  }

  applyEventOption(option: EventOption): EventOptionResult | null {
    if (option.goldCost && this.run.player.gold < option.goldCost) return null;
    if (option.goldCost) this.gainGold(-option.goldCost);
    let upgradedCard: string | null = null;
    const gainedRelics: string[] = [];
    for (const effect of option.effects) {
      switch (effect.op) {
        case "heal":
          this.heal(effect.amount);
          break;
        case "loseHp":
          this.loseHp(effect.amount);
          break;
        case "gainGold":
          this.gainGold(effect.amount);
          break;
        case "apply":
          // Strength / dexterity etc. from events persist for the run.
          if (effect.target === "self") {
            this.runPersistentStatus(effect.status, effect.amount);
          }
          break;
        default:
          break;
      }
    }
    for (const cardId of option.addCards ?? []) {
      this.addCardToDeck(cardId);
    }
    for (const potionId of option.addPotions ?? []) {
      this.addPotion(potionId);
    }
    if (option.addRelic) {
      this.addRelic(option.addRelic);
      gainedRelics.push(option.addRelic);
    }
    if (option.addRelicPool && option.addRelicPool.length > 0) {
      // Random relic from the configured pool; already-owned relics are
      // skipped, so duplicate relics can never be granted.
      const candidates = option.addRelicPool.filter(
        (id) => this.db.relics[id] && !this.run.player.relics.includes(id)
      );
      if (candidates.length > 0) {
        const relicId = pickOne(candidates);
        this.addRelic(relicId);
        gainedRelics.push(relicId);
      }
    }
    if (option.removeCards) {
      for (let i = 0; i < option.removeCards; i++) {
        const removable = this.run.player.deck.filter(
          (id) => !id.endsWith("+")
        );
        if (removable.length > 0) {
          this.removeCardFromDeck(pickOne(removable));
        }
      }
    }
    if (option.loseMaxHp) {
      this.run.player.maxHp = Math.max(
        1,
        this.run.player.maxHp - option.loseMaxHp
      );
      this.run.player.hp = Math.min(this.run.player.hp, this.run.player.maxHp);
    }
    if (option.upgradeRandomCard) {
      upgradedCard = this.upgradeRandomCard();
    }
    return { upgradedCard, gainedRelics };
  }

  runPersistentStatus(status: string, amount: number): void {
    this.run.statuses[status] = (this.run.statuses[status] ?? 0) + amount;
  }

  currentStatuses(): Record<string, number> {
    return { ...this.run.statuses };
  }

  advanceAct(): void {
    this.run.act += 1;
    this.run.map = generateMap(this.run.act);
    this.run.currentNodeId = null;
    this.run.visitedNodes = [];
    this.run.status = "map";
  }

  pickEvent(): EventData | undefined {
    const events = Object.values(this.db.events);
    if (events.length === 0) return undefined;
    return pickOne(events);
  }

  // 当前先古角色：优先使用 settings.ancientId 指定的角色，否则用默认
  // （本版本统一一个先古角色池，暂不做「层数 × 角色」的对应）。
  currentAncient(): AncientData | undefined {
    const specified = this.settings.ancientId
      ? this.db.ancients[this.settings.ancientId]
      : undefined;
    if (specified) return specified;
    return Object.values(this.db.ancients)[0];
  }

  rollAncientRelic(): RelicData | undefined {
    const ancient = this.currentAncient();
    if (!ancient) return undefined;
    const candidates = ancient.relicPool.filter(
      (id) => this.db.relics[id] && !this.run.player.relics.includes(id)
    );
    if (candidates.length === 0) return undefined;
    return this.db.relics[pickOne(candidates)];
  }

  rollPotion(): PotionData | undefined {
    const potions = Object.values(this.db.potions);
    if (potions.length === 0) return undefined;
    return pickOne(potions);
  }

  addPotion(potionId: string): void {
    if (this.run.player.potions.length < 3) {
      this.run.player.potions.push(potionId);
    }
  }

  // 先古事件：先回复缺失生命值的 X%（默认 100 = 满血，难度可覆盖），
  // 再随机获得一件先古遗物。
  applyAncientBlessing(): {
    healed: number;
    relic: RelicData | undefined;
  } {
    const ancient = this.currentAncient();
    const percent =
      this.settings.ancientHealPercent ?? ancient?.healPercent ?? 100;
    const missing = this.run.player.maxHp - this.run.player.hp;
    const healed = Math.floor((missing * percent) / 100);
    if (healed > 0) this.heal(healed);
    const relic = this.rollAncientRelic();
    if (relic) this.addRelic(relic.id);
    return { healed, relic };
  }

  currentNode(): MapNode | undefined {
    if (!this.run.currentNodeId) return undefined;
    return getNode(this.run.map, this.run.currentNodeId);
  }

  nodeTypeLabel(type: MapNodeType): string {
    switch (type) {
      case "ancient":
        return "先古";
      case "battle":
        return "战斗";
      case "elite":
        return "精英";
      case "event":
        return "事件";
      case "shop":
        return "商店";
      case "rest":
        return "篝火";
      case "treasure":
        return "宝箱";
      case "boss":
        return "首领";
    }
  }
}
