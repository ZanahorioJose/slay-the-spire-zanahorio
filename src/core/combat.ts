import { shuffle, randomInt } from "./rng";
import type {
  CardData,
  CombatUnit,
  Effect,
  EnemyCombatState,
  EnemyData,
  GameDatabase,
  PlayerCombatState,
  RelicTrigger,
  StatusType,
} from "./types";
import { STATUS_DEFS } from "./types";

export type CombatStatus = "playerTurn" | "enemyTurn" | "won" | "lost";

// ---------------------------------------------------------------------------
// Battle event ordering (strictly serial — nothing ever resolves "at the
// same time"; every visible simultaneity is decomposed into a fixed order):
//
// 1. Combat start (combatStart)
//    shuffle draw pile -> combatStart relics (in acquisition order) -> turn 1
//
// 2. Turn start (turnStart)
//    clear player block -> reset energy -> poison tick -> draw cards
//    -> turnStart relics (acquisition order)
//
// 3. Playing a card (cardPlayed)
//    pay cost -> resolve effects one by one in array order:
//      damage: per hit: damage -> thorns counter-hit -> damageDealt relics
//              (recursion-guarded, see hookDepth)
//      block:  compute -> gain block -> blockGained relics (player only)
//      other:  resolve directly
//    -> move card to discard/exhaust -> cardPlayed relics -> end check
//
// 4. Turn end (turnEnd)
//    discard hand -> decay negative statuses -> turnEnd relics
//    -> end-of-turn statuses (ritual, then metallicize) -> enemy turn
//
// 5. Enemy turn (one enemy at a time, in spawn order)
//    poison tick -> execute move (attacks resolve hit by hit with thorns)
//    -> decay negative statuses -> clear own block
//    player death ends the fight immediately
//
// 6. Battle end (battleEnd)
//    win: battleEnd relics (acquisition order) once, then rewards
//    loss: end
// ---------------------------------------------------------------------------

export interface CombatSnapshot {
  status: CombatStatus;
  player: PlayerCombatState;
  enemies: EnemyCombatState[];
  turn: number;
  log: string[];
}

const NEGATIVE_STATUSES: StatusType[] = [
  "vulnerable",
  "weak",
  "frail",
  "poison",
];

export class Combat {
  player: PlayerCombatState;
  enemies: EnemyCombatState[];
  status: CombatStatus = "playerTurn";
  turn = 1;
  log: string[] = [];
  drawPerTurn: number;
  energyPerTurn: number;

  private db: GameDatabase;
  private relics: string[];
  private victory = false;
  // > 0 while a relic/status hook is resolving. Damage or block generated
  // inside a hook must not re-trigger damageDealt / blockGained, otherwise a
  // relic like "deal 1 damage whenever you deal damage" would recurse forever.
  private hookDepth = 0;
  private instances = new Map<string, string>();
  private nextUid = 1;

  constructor(
    db: GameDatabase,
    deck: string[],
    relics: string[],
    options?: { drawPerTurn?: number; energyPerTurn?: number }
  ) {
    this.db = db;
    this.relics = relics;
    this.drawPerTurn = options?.drawPerTurn ?? 5;
    this.energyPerTurn = options?.energyPerTurn ?? 3;
    this.player = {
      hp: 0,
      maxHp: 0,
      block: 0,
      statuses: {},
      energy: 3,
      maxEnergy: 3,
      drawPile: [],
      hand: [],
      discardPile: [],
      exhaustPile: [],
      removedPile: [],
    };
    this.enemies = [];
    this.player.drawPile = shuffle(
      deck.map((cardId) => this.createInstance(cardId))
    );
  }

  private createInstance(cardId: string): string {
    const uid = `c${this.nextUid++}`;
    this.instances.set(uid, cardId);
    return uid;
  }

  getCardId(uid: string): string {
    return this.instances.get(uid) ?? uid;
  }

  setPlayer(maxHp: number, hp: number): void {
    this.player.maxHp = maxHp;
    this.player.hp = hp;
  }

  addEnemy(data: EnemyData): EnemyCombatState {
    const enemy: EnemyCombatState = {
      id: data.id,
      name: data.name,
      art: data.art,
      maxHp: data.maxHp,
      hp: data.maxHp,
      block: 0,
      statuses: {},
      moveIndex: 0,
      isBoss: data.isBoss ?? false,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  start(): void {
    this.applyRelicTrigger("combatStart");
    for (const enemy of this.enemies) {
      if (enemy.moveIndex >= this.enemyMoveCount(enemy.id)) {
        enemy.moveIndex = 0;
      }
    }
    this.startPlayerTurn();
  }

  // ------------------------------------------------------------------
  // Turn flow
  // ------------------------------------------------------------------

  private startPlayerTurn(): void {
    this.status = "playerTurn";
    this.player.block = 0;

    const drawBonus = this.relics.reduce(
      (sum, id) => sum + (this.db.relics[id]?.drawBonus ?? 0),
      0
    );
    const energyBonus = this.relics.reduce(
      (sum, id) => sum + (this.db.relics[id]?.energyBonus ?? 0),
      0
    );
    this.player.maxEnergy = this.energyPerTurn + energyBonus;
    this.player.energy = this.player.maxEnergy;

    if (this.turn > 1) {
      this.resolvePoison(this.player);
      if (this.player.hp <= 0) {
        this.status = "lost";
        return;
      }
    }
    this.resolveTurnStartStatuses(this.player);
    this.drawCards(this.drawPerTurn + drawBonus);
    this.applyRelicTrigger("turnStart");
  }

  endPlayerTurn(): void {
    if (this.status !== "playerTurn") return;
    this.status = "enemyTurn";

    for (const cardId of this.player.hand) {
      this.player.discardPile.push(cardId);
    }
    this.player.hand = [];

    this.decayPlayerStatuses();
    this.applyRelicTrigger("turnEnd");
    this.resolveEndTurnStatuses(this.player);

    this.enemyTurn();
  }

  private enemyTurn(): void {
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      // Block gained last turn was already consumed by the player's attacks
      // (or wasted); clear it before the enemy acts again.
      enemy.block = 0;
      this.resolvePoison(enemy);
      this.executeEnemyMove(enemy);
      this.decayEnemyStatuses(enemy);
      if (this.status === "lost") return;
    }
    this.checkEnd();
    if (this.status === "won") return;

    this.turn += 1;
    this.startPlayerTurn();
  }

  // ------------------------------------------------------------------
  // Card playing
  // ------------------------------------------------------------------

  getCard(ref: string): CardData {
    const cardId = this.getCardId(ref);
    const card = this.db.cards[cardId];
    if (!card) {
      throw new Error(`Unknown card: ${cardId}`);
    }
    return card;
  }

  canPlay(cardId: string, enemyId?: string): boolean {
    if (this.status !== "playerTurn") return false;
    const card = this.getCard(cardId);
    if (card.cost > this.player.energy) return false;
    if (card.target === "enemy" || card.target === "allEnemies") {
      if (!enemyId) return true; // caller decides targeting later
      return this.enemies.some((e) => e.id === enemyId && e.hp > 0);
    }
    return true;
  }

  playCard(cardId: string, enemyId?: string): void {
    if (!this.canPlay(cardId, enemyId)) return;
    const card = this.getCard(cardId);
    this.player.energy -= card.cost;

    const target =
      card.target === "enemy" || card.target === "allEnemies"
        ? this.aliveEnemies().find((e) => e.id === enemyId)?.id ??
          this.aliveEnemies()[0]?.id
        : undefined;

    for (const effect of card.effects) {
      this.applyEffect(effect, target);
    }

    const handIndex = this.player.hand.indexOf(cardId);
    if (handIndex >= 0) {
      this.player.hand.splice(handIndex, 1);
    }
    // Power cards are temporarily removed for the rest of this battle: they
    // go to a dedicated removed pile, NOT the exhaust pile, so future cards
    // that interact with the exhaust pile can never resurrect powers.
    // Explicitly-exhaust cards use the regular exhaust pile.
    if (card.type === "power") {
      this.player.removedPile.push(cardId);
    } else if (card.exhaust) {
      this.player.exhaustPile.push(cardId);
    } else {
      this.player.discardPile.push(cardId);
    }

    this.log.push(`打出「${card.name}」`);
    this.applyRelicTrigger("cardPlayed");
    this.checkEnd();
  }

  // ------------------------------------------------------------------
  // Effects
  // ------------------------------------------------------------------

  applyEffect(effect: Effect, enemyId?: string): void {
    switch (effect.op) {
      case "damage": {
        const target = this.aliveEnemies().find((e) => e.id === enemyId);
        if (target) this.dealDamage(target, effect.amount, effect.hits ?? 1);
        break;
      }
      case "damageAll": {
        for (const enemy of this.aliveEnemies()) {
          this.dealDamage(enemy, effect.amount, 1);
        }
        break;
      }
      case "block": {
        this.gainBlock(this.player, effect.amount);
        break;
      }
      case "apply": {
        const target =
          effect.target === "self"
            ? this.player
            : effect.target === "enemy"
              ? this.aliveEnemies().find((e) => e.id === enemyId)
              : undefined;
        if (target) {
          this.applyStatus(target, effect.status, effect.amount);
        }
        break;
      }
      case "multiplyStatus": {
        const target =
          effect.target === "self"
            ? this.player
            : effect.target === "enemy"
              ? this.aliveEnemies().find((e) => e.id === enemyId)
              : undefined;
        if (target) {
          const current = target.statuses[effect.status] ?? 0;
          this.applyStatus(
            target,
            effect.status,
            Math.floor(current * (effect.multiplier - 1))
          );
        }
        break;
      }
      case "draw":
        this.drawCards(effect.amount);
        break;
      case "energy":
        this.player.energy = Math.max(
          0,
          this.player.energy + effect.amount
        );
        break;
      case "heal": {
        const before = this.player.hp;
        this.player.hp = Math.min(
          this.player.maxHp,
          this.player.hp + effect.amount
        );
        const healed = this.player.hp - before;
        if (healed > 0) this.log.push(`回复 ${healed} 点生命`);
        break;
      }
      case "loseHp":
        this.player.hp = Math.max(0, this.player.hp - effect.amount);
        this.log.push(`失去 ${effect.amount} 点生命`);
        this.checkEnd();
        break;
      case "addCard": {
        const count = effect.amount ?? 1;
        for (let i = 0; i < count; i++) {
          this.player.discardPile.push(this.createInstance(effect.cardId));
        }
        const card = this.db.cards[effect.cardId];
        this.log.push(`加入 ${count} 张「${card?.name ?? effect.cardId}」`);
        break;
      }
      case "exhaustRandom": {
        const count = Math.min(effect.amount ?? 1, this.player.hand.length);
        const picks = shuffle(this.player.hand).slice(0, count);
        for (const id of picks) {
          this.player.hand = this.player.hand.filter((c) => c !== id);
          this.player.exhaustPile.push(id);
        }
        if (picks.length > 0) this.log.push(`消耗了 ${picks.length} 张手牌`);
        break;
      }
      case "gainGold":
        this.log.push(`获得 ${effect.amount} 金币`);
        break;
    }
  }

  private dealDamage(
    enemy: EnemyCombatState,
    amount: number,
    hits: number
  ): void {
    const strength = this.player.statuses.strength ?? 0;
    const weakMult = (this.player.statuses.weak ?? 0) > 0 ? 0.75 : 1;
    let total = 0;
    for (let i = 0; i < hits; i++) {
      let dmg = (amount + strength) * weakMult;
      if ((enemy.statuses.vulnerable ?? 0) > 0) dmg *= 1.5;
      if ((enemy.statuses.intangible ?? 0) > 0) dmg = 1;
      dmg = Math.max(0, Math.floor(dmg));
      this.hitUnit(enemy, dmg);
      total += dmg;
      if (dmg > 0 && this.hookDepth === 0) {
        this.applyRelicTrigger("damageDealt");
        if (this.status === "lost") return;
      }
    }
    if (total > 0) this.log.push(`对「${enemy.name}」造成 ${total} 点伤害`);
  }

  private attackPlayer(enemy: EnemyCombatState, amount: number, hits: number): void {
    const enemyStrength = enemy.statuses.strength ?? 0;
    const weakMult = (enemy.statuses.weak ?? 0) > 0 ? 0.75 : 1;
    let total = 0;
    for (let i = 0; i < hits; i++) {
      let dmg = (amount + enemyStrength) * weakMult;
      if ((this.player.statuses.vulnerable ?? 0) > 0) dmg *= 1.5;
      if ((this.player.statuses.intangible ?? 0) > 0) dmg = 1;
      dmg = Math.max(0, Math.floor(dmg));
      this.hitUnit(this.player, dmg);
      total += dmg;
      const thorns = enemy.statuses.thorns ?? 0;
      if (thorns > 0 && dmg > 0) {
        this.hitUnit(enemy, thorns);
        this.log.push(`荆棘反伤 ${thorns} 点`);
      }
    }
    if (total > 0) this.log.push(`「${enemy.name}」攻击你，造成 ${total} 点伤害`);
  }

  private hitUnit(unit: CombatUnit, damage: number): void {
    const absorbed = Math.min(unit.block, damage);
    unit.block -= absorbed;
    const remaining = damage - absorbed;
    unit.hp = Math.max(0, unit.hp - remaining);
    if (unit === this.player && unit.hp <= 0) {
      this.status = "lost";
      this.log.push("你倒下了……");
    }
  }

  private gainBlock(unit: CombatUnit, amount: number): void {
    const dexBonus = unit === this.player ? (unit.statuses.dexterity ?? 0) : 0;
    const frailMult =
      unit === this.player && (unit.statuses.frail ?? 0) > 0 ? 0.75 : 1;
    const gained = Math.max(0, Math.floor((amount + dexBonus) * frailMult));
    unit.block += gained;
    if (unit === this.player && gained > 0 && this.hookDepth === 0) {
      this.applyRelicTrigger("blockGained");
    }
  }

  private applyStatus(
    unit: CombatUnit,
    status: StatusType,
    amount: number
  ): void {
    const def = STATUS_DEFS[status];
    if (!def) return;
    const negative = !def.positive;
    if (negative && (unit.statuses.artifact ?? 0) > 0) {
      unit.statuses.artifact = Math.max(0, (unit.statuses.artifact ?? 0) - 1);
      this.log.push(`人工制品抵消了 ${def.name}`);
      return;
    }
    const current = unit.statuses[status] ?? 0;
    const next = Math.max(0, current + amount);
    if (next === 0) delete unit.statuses[status];
    else unit.statuses[status] = next;
  }

  private resolvePoison(unit: CombatUnit): void {
    const poison = unit.statuses.poison ?? 0;
    if (poison <= 0) return;
    if (unit === this.player) {
      this.hitUnit(unit, poison);
      this.log.push(`中毒造成 ${poison} 点伤害`);
    } else {
      this.hitUnit(unit, poison);
      const enemy = unit as EnemyCombatState;
      this.log.push(`「${enemy.name}」中毒，受到 ${poison} 点伤害`);
    }
    this.applyStatus(unit, "poison", -1);
  }

  private resolveTurnStartStatuses(unit: CombatUnit): void {
    // placeholder for statuses that trigger at turn start besides poison
    void unit;
  }

  private resolveEndTurnStatuses(unit: CombatUnit): void {
    const ritual = unit.statuses.ritual ?? 0;
    if (ritual > 0) this.applyStatus(unit, "strength", ritual);
    const metallicize = unit.statuses.metallicize ?? 0;
    if (metallicize > 0) this.gainBlock(unit, metallicize);
  }

  private decayPlayerStatuses(): void {
    this.decayStatuses(this.player);
    if ((this.player.statuses.intangible ?? 0) > 0) {
      this.applyStatus(this.player, "intangible", -1);
    }
  }

  private decayEnemyStatuses(enemy: EnemyCombatState): void {
    this.decayStatuses(enemy);
    if ((enemy.statuses.intangible ?? 0) > 0) {
      this.applyStatus(enemy, "intangible", -1);
    }
  }

  private decayStatuses(unit: CombatUnit): void {
    for (const status of NEGATIVE_STATUSES) {
      if (status === "poison") continue; // poison handled by resolvePoison
      if ((unit.statuses[status] ?? 0) > 0) {
        this.applyStatus(unit, status, -1);
      }
    }
  }

  // ------------------------------------------------------------------
  // Enemies
  // ------------------------------------------------------------------

  private executeEnemyMove(enemy: EnemyCombatState): void {
    const data = this.db.enemies[enemy.id];
    if (!data || data.moves.length === 0) return;

    const move = data.moves[enemy.moveIndex];
    if (!move) return;

    if (move.type === "attack") {
      this.attackPlayer(enemy, move.damage ?? 0, move.hits ?? 1);
    } else if (move.type === "defend") {
      this.gainBlock(enemy, move.block ?? 0);
      this.log.push(`「${enemy.name}」进入防御姿态`);
    } else if (move.type === "buff" || move.type === "debuff") {
      for (const s of move.statuses ?? []) {
        const target = s.target === "self" ? enemy : this.player;
        this.applyStatus(target, s.status, s.amount);
        this.log.push(
          `「${enemy.name}」使${target === this.player ? "你" : "自己"}获得 ${STATUS_DEFS[s.status].name} ${s.amount}`
        );
      }
    } else if (move.type === "special" && move.heal) {
      const before = enemy.hp;
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + move.heal);
      this.log.push(`「${enemy.name}」回复 ${enemy.hp - before} 点生命`);
    }

    if (data.pattern === "loop") {
      enemy.moveIndex = (enemy.moveIndex + 1) % data.moves.length;
    } else {
      enemy.moveIndex = randomInt(0, data.moves.length - 1);
    }
  }

  enemyMoveCount(id: string): number {
    return this.db.enemies[id]?.moves.length ?? 0;
  }

  getIntent(enemy: EnemyCombatState): string {
    const data = this.db.enemies[enemy.id];
    const move = data?.moves[enemy.moveIndex];
    if (!move) return "思考中……";
    if (move.type === "attack") {
      const hits = move.hits ?? 1;
      const dmg = move.damage ?? 0;
      return hits > 1 ? `攻击 ${dmg} × ${hits}` : `攻击 ${dmg}`;
    }
    if (move.type === "defend") return `防御 ${move.block ?? 0}`;
    if (move.type === "buff" || move.type === "debuff") {
      const parts = (move.statuses ?? []).map(
        (s) => `${STATUS_DEFS[s.status].name} ${s.amount}`
      );
      return `${move.type === "buff" ? "强化" : "削弱"}: ${parts.join("、")}`;
    }
    return move.name;
  }

  private applyRelicTrigger(trigger: RelicTrigger): void {
    this.hookDepth += 1;
    try {
      for (const relicId of this.relics) {
        const relic = this.db.relics[relicId];
        if (relic && relic.trigger === trigger) {
          for (const effect of relic.effects) {
            this.applyEffect(effect);
          }
        }
      }
    } finally {
      this.hookDepth -= 1;
    }
  }

  // ------------------------------------------------------------------
  // Drawing / helpers
  // ------------------------------------------------------------------

  private drawCards(count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.player.drawPile.length === 0) {
        if (this.player.discardPile.length === 0) break;
        this.player.drawPile = shuffle(this.player.discardPile);
        this.player.discardPile = [];
      }
      const cardId = this.player.drawPile.pop()!;
      this.player.hand.push(cardId);
    }
  }

  aliveEnemies(): EnemyCombatState[] {
    return this.enemies.filter((e) => e.hp > 0);
  }

  private checkEnd(): void {
    if (this.player.hp <= 0) {
      this.status = "lost";
      this.log.push("你倒下了……");
      return;
    }
    if (this.aliveEnemies().length === 0) {
      this.status = "won";
      if (!this.victory) {
        this.victory = true;
        this.log.push("敌人被全部消灭！");
        this.applyRelicTrigger("battleEnd");
      }
    }
  }

  isVictory(): boolean {
    return this.victory;
  }

  snapshot(): CombatSnapshot {
    return {
      status: this.status,
      player: this.player,
      enemies: this.enemies,
      turn: this.turn,
      log: [...this.log],
    };
  }
}
