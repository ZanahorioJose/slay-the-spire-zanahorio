import { shuffle, randomInt, pickOne } from "./rng";
import type {
  CardData,
  CombatUnit,
  DamageScaling,
  Effect,
  EnemyCombatState,
  EnemyData,
  GameDatabase,
  OrbState,
  OrbType,
  PlayerCombatState,
  PassiveHook,
  RelicTrigger,
  StatusType,
} from "./types";
import { ORB_DEFS, STATUS_DEFS } from "./types";

export type CombatStatus = "playerTurn" | "enemyTurn" | "won" | "lost";

export type PileName = "draw" | "discard" | "exhaust" | "removed" | "hand";

// 牌堆间的转移事件（供 UI 播放动画）。
export interface PileMoveEvent {
  from: PileName;
  to: PileName;
  count: number;
  reason?: "play" | "endTurn" | "discard" | "shuffle" | "draw" | "retrieve";
}

const DOOM_THRESHOLD = 10;

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
  "doom",
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
  private attacksPlayedThisTurn = 0;
  private skillsPlayedThisTurn = 0;
  // UI 动画标记：本轮抽牌过程中发生过洗牌（弃牌堆洗回抽牌堆）。
  justShuffled = false;
  // 自上次 UI 读取以来的牌堆转移事件。
  pileMoves: PileMoveEvent[] = [];

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
      stars: 0,
      souls: 0,
      focus: 0,
      orbSlots: 3,
      orbs: [],
      summon: null,
      passives: [],
      pending: [],
      attacksPlayedThisTurn: 0,
      skillsPlayedThisTurn: 0,
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
      anim: data.anim,
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
    // 壁垒：拥有该状态时格挡保留到回合开始。
    if (!((this.player.statuses.barricade ?? 0) > 0)) {
      this.player.block = 0;
    }
    this.attacksPlayedThisTurn = 0;
    this.skillsPlayedThisTurn = 0;

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
    this.resolvePendingEffects();
    this.drawCards(this.drawPerTurn + drawBonus);
    this.applyRelicTrigger("turnStart");
    this.applyPassiveHook("turnStart");
  }

  endPlayerTurn(): void {
    if (this.status !== "playerTurn") return;
    this.status = "enemyTurn";

    // 保留：回合结束时保留 retain 层数的手牌不弃置。
    const retain = this.player.statuses.retain ?? 0;
    const retained = new Set(
      [...this.player.hand].slice(0, Math.min(retain, this.player.hand.length))
    );
    const discarded = [...this.player.hand].filter((uid) => !retained.has(uid));
    this.player.hand = [...retained];
    for (const uid of discarded) {
      this.player.discardPile.push(uid);
      // 奇巧（Sly）：被弃置的牌触发其弃牌效果。
      this.triggerSly(this.getCardId(uid));
    }
    if (discarded.length > 0) {
      this.pileMoves.push({
        from: "hand",
        to: "discard",
        count: discarded.length,
        reason: "endTurn",
      });
    }

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
      // 灾厄处决：累计满层数的敌人在行动前直接死亡。
      if ((enemy.statuses.doom ?? 0) >= DOOM_THRESHOLD) {
        enemy.hp = 0;
        this.log.push(`「${enemy.name}」被灾厄处决！`);
        continue;
      }
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
    if ((card.starsCost ?? 0) > this.player.stars) return false;
    if ((card.soulsCost ?? 0) > this.player.souls) return false;
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
    this.player.stars = Math.max(0, this.player.stars - (card.starsCost ?? 0));
    this.player.souls = Math.max(0, this.player.souls - (card.soulsCost ?? 0));

    const target =
      card.target === "enemy" || card.target === "allEnemies"
        ? this.aliveEnemies().find((e) => e.id === enemyId)?.id ??
          this.aliveEnemies()[0]?.id
        : undefined;

    for (const effect of card.effects) {
      this.applyEffect(effect, target);
    }
    // 本回合打出计数（供「本回合已打出 N 张攻击/技能」类增伤使用）。
    if (card.type === "attack") this.attacksPlayedThisTurn += 1;
    else if (card.type === "skill") this.skillsPlayedThisTurn += 1;

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
      this.applyRelicTrigger("cardExhausted");
      this.applyPassiveHook("cardExhausted");
      this.pileMoves.push({
        from: "hand",
        to: "removed",
        count: 1,
        reason: "play",
      });
    } else if (card.exhaust) {
      this.player.exhaustPile.push(cardId);
      this.applyRelicTrigger("cardExhausted");
      this.applyPassiveHook("cardExhausted");
      this.pileMoves.push({
        from: "hand",
        to: "exhaust",
        count: 1,
        reason: "play",
      });
    } else {
      this.player.discardPile.push(cardId);
      this.pileMoves.push({
        from: "hand",
        to: "discard",
        count: 1,
        reason: "play",
      });
    }

    this.log.push(`打出「${card.name}」`);
    this.applyRelicTrigger("cardPlayed");
    this.applyPassiveHook("cardPlayed");
    if (card.type === "attack") this.applyPassiveHook("attackPlayed");
    else if (card.type === "skill") this.applyPassiveHook("skillPlayed");
    this.checkEnd();
  }

  // ------------------------------------------------------------------
  // Effects
  // ------------------------------------------------------------------

  applyEffect(effect: Effect, enemyId?: string): void {
    switch (effect.op) {
      case "damage": {
        const target = this.aliveEnemies().find((e) => e.id === enemyId);
        if (target) {
          this.dealDamage(
            target,
            effect.amount,
            effect.hits ?? 1,
            effect.scaling
          );
        }
        break;
      }
      case "damageAll": {
        for (const enemy of this.aliveEnemies()) {
          this.dealDamage(enemy, effect.amount, 1, effect.scaling);
        }
        break;
      }
      case "block": {
        this.gainBlock(this.player, effect.amount);
        break;
      }
      case "apply": {
        if (effect.target === "self") {
          this.applyStatus(this.player, effect.status, effect.amount);
        } else if (effect.target === "allEnemies") {
          for (const enemy of this.aliveEnemies()) {
            this.applyStatus(enemy, effect.status, effect.amount);
          }
        } else if (effect.target === "enemy") {
          const target = this.aliveEnemies().find((e) => e.id === enemyId);
          if (target) {
            this.applyStatus(target, effect.status, effect.amount);
          }
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
      case "gainStars":
        this.player.stars += effect.amount;
        this.log.push(`获得 ${effect.amount} 点星辰`);
        break;
      case "gainSouls":
        this.player.souls += effect.amount;
        this.log.push(`获得 ${effect.amount} 点灵魂`);
        break;
      case "channel":
        this.channelOrb(effect.orb);
        break;
      case "evoke":
        this.evokeOrbs(effect.amount ?? 1);
        break;
      case "focus":
        this.player.focus += effect.amount;
        this.log.push(
          `集中${effect.amount >= 0 ? "+" : ""}${effect.amount}`
        );
        break;
      case "orbSlots":
        this.player.orbSlots = Math.max(
          1,
          (this.player.orbSlots ?? 3) + effect.amount
        );
        this.log.push(`宝珠槽上限变为 ${this.player.orbSlots}`);
        break;
      case "summon": {
        const existing = this.player.summon;
        if (!existing) {
          this.player.summon = {
            hp: effect.hp ?? 1,
            maxHp: effect.hp ?? 1,
            block: 0,
            statuses: {},
            name: effect.name ?? "骷髅护卫",
            art: effect.art ?? "🦴",
            damage: effect.damage ?? 3,
          };
          this.log.push(`召唤「${this.player.summon.name}」`);
        } else {
          existing.hp = Math.min(
            existing.maxHp,
            existing.hp + (effect.hp ?? 1)
          );
          this.log.push(`「${existing.name}」的伤势被治愈`);
        }
        break;
      }
      case "healSummon": {
        const summon = this.player.summon;
        if (summon) {
          summon.hp = Math.min(summon.maxHp, summon.hp + effect.amount);
          this.log.push(`「${summon.name}」回复 ${effect.amount} 点生命`);
        }
        break;
      }
      case "retrieveFromExhaust": {
        const count = Math.min(
          effect.amount ?? 1,
          this.player.exhaustPile.length
        );
        for (let i = 0; i < count; i++) {
          const idx = randomInt(0, this.player.exhaustPile.length - 1);
          const [uid] = this.player.exhaustPile.splice(idx, 1);
          this.player.hand.push(uid);
        }
        if (count > 0) {
          this.log.push(`从消耗堆取回 ${count} 张牌`);
          this.pileMoves.push({
            from: "exhaust",
            to: "hand",
            count,
            reason: "retrieve",
          });
        }
        break;
      }
      case "discard": {
        const count =
          effect.amount === undefined
            ? this.player.hand.length
            : Math.min(effect.amount, this.player.hand.length);
        const picks = shuffle(this.player.hand).slice(0, count);
        for (const uid of picks) {
          this.player.hand = this.player.hand.filter((c) => c !== uid);
          this.player.discardPile.push(uid);
          this.triggerSly(this.getCardId(uid));
        }
        if (picks.length > 0) {
          this.log.push(`弃置了 ${picks.length} 张手牌`);
          this.pileMoves.push({
            from: "hand",
            to: "discard",
            count: picks.length,
            reason: "discard",
          });
        }
        break;
      }
      case "forge": {
        const count = Math.min(effect.amount ?? 1, this.player.hand.length);
        const picks = shuffle(this.player.hand).slice(0, count);
        let forged = 0;
        for (const uid of picks) {
          const cid = this.instances.get(uid);
          if (!cid) continue;
          if (this.db.cards[`${cid}+`]) {
            this.instances.set(uid, `${cid}+`);
            forged += 1;
          }
        }
        if (forged > 0) this.log.push(`锻造升级了 ${forged} 张手牌`);
        break;
      }
      case "addCountdown": {
        this.player.pending.push({
          label: effect.label,
          turns: effect.turns,
          icon: effect.icon,
          effects: effect.effects,
          target: effect.target ?? "player",
        });
        this.log.push(`设置计数器：${effect.label}（${effect.turns} 回合后）`);
        break;
      }
      case "passive": {
        this.player.passives.push({
          hook: effect.hook,
          effects: effect.effects,
        });
        this.log.push("注册被动效果");
        break;
      }
      case "retrieveFromDiscard": {
        const count = Math.min(
          effect.amount ?? 1,
          this.player.discardPile.length
        );
        let picked = 0;
        for (let i = 0; i < count; i++) {
          const pool = effect.cardType
            ? this.player.discardPile.filter((uid) => {
                const card = this.db.cards[this.getCardId(uid)];
                return card && card.type === effect.cardType;
              })
            : this.player.discardPile;
          if (pool.length === 0) break;
          const idx = randomInt(0, pool.length - 1);
          const uid = pool[idx]!;
          this.player.discardPile = this.player.discardPile.filter(
            (c) => c !== uid
          );
          if (effect.upgrade) {
            const cid = this.getCardId(uid);
            if (this.db.cards[`${cid}+`]) this.instances.set(uid, `${cid}+`);
          }
          this.player.hand.push(uid);
          picked++;
        }
        if (picked > 0) this.log.push(`从弃牌堆取回 ${picked} 张牌`);
        break;
      }
      case "addRandomCard": {
        const count = effect.amount ?? 1;
        const pool = Object.values(this.db.cards).filter((c) => {
          if (c.rarity === "starter") return false;
          if (effect.cardType && c.type !== effect.cardType) return false;
          if (effect.rarity && c.rarity !== effect.rarity) return false;
          return true;
        });
        for (let i = 0; i < count && pool.length > 0; i++) {
          const card = pickOne(pool);
          const uid = this.createInstance(card.id);
          if (effect.to === "hand") this.player.hand.push(uid);
          else if (effect.to === "draw") this.player.drawPile.push(uid);
          else this.player.discardPile.push(uid);
        }
        if (count > 0) {
          this.log.push(`加入 ${count} 张随机${effect.cardType ?? "卡牌"}`);
        }
        break;
      }
      case "transformCard": {
        const count = Math.min(
          effect.amount ?? 1,
          this.player.hand.length
        );
        const picks = shuffle(this.player.hand).slice(0, count);
        const pool = Object.values(this.db.cards).filter(
          (c) => c.rarity !== "starter"
        );
        for (const uid of picks) {
          if (pool.length === 0) break;
          const card = pickOne(pool);
          this.player.hand = this.player.hand.filter((c) => c !== uid);
          this.player.hand.push(this.createInstance(card.id));
        }
        if (picks.length > 0) this.log.push(`变形了 ${picks.length} 张手牌`);
        break;
      }
      case "playTopCard": {
        if (this.player.drawPile.length === 0) {
          if (this.player.discardPile.length > 0) {
            const shuffled = this.player.discardPile.length;
            this.player.drawPile = shuffle(this.player.discardPile);
            this.player.discardPile = [];
            this.justShuffled = true;
            this.pileMoves.push({
              from: "discard",
              to: "draw",
              count: shuffled,
              reason: "shuffle",
            });
            this.applyPassiveHook("shuffle");
          }
        }
        if (this.player.drawPile.length > 0) {
          const uid = this.player.drawPile.pop()!;
          this.player.hand.push(uid);
          this.log.push("从抽牌堆顶抽牌并入手");
        }
        break;
      }
    }
  }

  private dealDamage(
    enemy: EnemyCombatState,
    amount: number,
    hits: number,
    scaling?: DamageScaling
  ): void {
    const strength = this.player.statuses.strength ?? 0;
    const weakMult = (this.player.statuses.weak ?? 0) > 0 ? 0.75 : 1;
    const vigor = this.player.statuses.vigor ?? 0;
    const bonus = scaling ? this.scalingBonus(scaling, enemy) : 0;
    let total = 0;
    for (let i = 0; i < hits; i++) {
      let dmg = (amount + strength + vigor + bonus) * weakMult;
      if ((enemy.statuses.vulnerable ?? 0) > 0) dmg *= 1.5;
      if ((enemy.statuses.intangible ?? 0) > 0) dmg = 1;
      dmg = Math.max(0, Math.floor(dmg));
      this.hitUnit(enemy, dmg);
      total += dmg;
      // 敌方荆棘：玩家攻击带荆棘的敌人时，自己受到反伤。
      const enemyThorns = enemy.statuses.thorns ?? 0;
      if (dmg > 0 && enemyThorns > 0) {
        this.hitUnit(this.player, enemyThorns);
        this.log.push(`「${enemy.name}」荆棘反伤 ${enemyThorns} 点`);
        if (this.status === "lost") return;
      }
      if (dmg > 0 && this.hookDepth === 0) {
        this.applyRelicTrigger("damageDealt");
        this.applyPassiveHook("damageDealt");
        if (this.status === "lost") return;
      }
    }
    // 活力：本次攻击消耗后归零。
    if (vigor > 0) {
      delete this.player.statuses.vigor;
      this.log.push(`活力耗尽（+${vigor} 伤害）`);
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
      // 召唤物挡刀：存活时替玩家承受这次伤害（超出部分仍由玩家承担）。
      const summon = this.player.summon;
      if (summon && summon.hp > 0) {
        const absorbed = Math.min(summon.hp, dmg);
        summon.hp -= absorbed;
        const overkill = dmg - absorbed;
        this.log.push(`「${summon.name}」承受了 ${absorbed} 点伤害`);
        if (summon.hp <= 0) {
          this.log.push(`「${summon.name}」被击碎`);
        }
        if (overkill > 0) {
          this.hitUnit(this.player, overkill);
          total += overkill;
        }
        continue;
      }
      this.hitUnit(this.player, dmg);
      total += dmg;
      // 玩家荆棘：怪物攻击玩家时，怪物自己受到反伤。
      const playerThorns = this.player.statuses.thorns ?? 0;
      if (dmg > 0 && playerThorns > 0) {
        this.hitUnit(enemy, playerThorns);
        this.log.push(`荆棘反伤 ${playerThorns} 点`);
      }
    }
    if (total > 0) this.log.push(`「${enemy.name}」攻击你，造成 ${total} 点伤害`);
  }

  private hitUnit(unit: CombatUnit, damage: number): void {
    let remaining = damage;
    // 装甲：优先扣除装甲层数。
    if (unit === this.player) {
      const plating = unit.statuses.plating ?? 0;
      if (plating > 0) {
        const absorbed = Math.min(plating, remaining);
        unit.statuses.plating = plating - absorbed;
        if (unit.statuses.plating <= 0) delete unit.statuses.plating;
        remaining -= absorbed;
        this.log.push(`装甲吸收了 ${absorbed} 点伤害`);
      }
    }
    const absorbed = Math.min(unit.block, remaining);
    unit.block -= absorbed;
    remaining -= absorbed;
    unit.hp = Math.max(0, unit.hp - remaining);
    if (unit === this.player && unit.hp <= 0) {
      this.status = "lost";
      this.log.push("你倒下了……");
      return;
    }
    // 玩家实际掉血后触发 receiveDamage 遗物（hook 内产生的伤害不递归）。
    if (unit === this.player && remaining > 0 && this.hookDepth === 0) {
      this.applyRelicTrigger("receiveDamage");
      this.applyPassiveHook("receiveDamage");
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
      this.applyPassiveHook("blockGained");
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
    this.applyPassiveHook("statusApplied");
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
    if (unit !== this.player) return;
    const player = this.player;
    // 星辉 / 灵魂涌动：回合开始获得对应资源。
    if ((player.statuses.starlight ?? 0) > 0) {
      player.stars += 1;
      this.log.push("星辉流转，获得 1 点星辰");
    }
    if ((player.statuses.soulflow ?? 0) > 0) {
      player.souls += 1;
      this.log.push("灵魂涌动，获得 1 点灵魂");
    }
    this.resolveOrbPassives();
    this.resolveSummonAttack();
  }

  // ------------------------------------------------------------------
  // Orbs / summon / potions (STS2 mechanics)
  // ------------------------------------------------------------------

  private channelOrb(type: OrbType): void {
    const orb: OrbState = {
      type,
      passive: type === "glass" ? 3 : 0,
    };
    this.player.orbs.push(orb);
    if (this.player.orbs.length > (this.player.orbSlots ?? 3)) {
      // 槽满时最左侧宝珠蒸发（不触发效果）。
      this.player.orbs.shift();
      this.log.push("宝珠槽已满，最左侧宝珠蒸发");
    }
    this.log.push(`引导 ${ORB_DEFS[type].name}宝珠`);
  }

  private evokeOrbs(count: number): void {
    const n = Math.min(count, this.player.orbs.length);
    for (let i = 0; i < n; i++) {
      const orb = this.player.orbs.shift()!;
      const focus = this.player.focus;
      switch (orb.type) {
        case "lightning": {
          const enemy = pickOne(this.aliveEnemies());
          if (enemy) {
            this.hitUnit(enemy, 8 + focus);
            this.log.push(`打出闪电宝珠，造成 ${8 + focus} 点伤害`);
          }
          break;
        }
        case "frost":
          this.gainBlock(this.player, 5 + focus);
          this.log.push("打出冰霜宝珠，获得格挡");
          break;
        case "dark": {
          const enemy = pickOne(this.aliveEnemies());
          if (enemy) {
            this.hitUnit(enemy, orb.passive);
            this.log.push(`打出黑暗宝珠，造成 ${orb.passive} 点伤害`);
          }
          break;
        }
        case "glass": {
          for (const enemy of this.aliveEnemies()) {
            this.hitUnit(enemy, 4 + focus);
          }
          this.log.push(`打出玻璃宝珠，对所有敌人造成 ${4 + focus} 点伤害`);
          break;
        }
      }
      if (this.status === "lost") return;
    }
  }

  private resolveOrbPassives(): void {
    const focus = this.player.focus;
    for (let i = this.player.orbs.length - 1; i >= 0; i--) {
      const orb = this.player.orbs[i]!;
      switch (orb.type) {
        case "lightning": {
          const enemy = pickOne(this.aliveEnemies());
          if (enemy) {
            this.hitUnit(enemy, 3 + focus);
            this.log.push(`闪电宝珠造成 ${3 + focus} 点伤害`);
          }
          break;
        }
        case "frost":
          this.gainBlock(this.player, 2 + focus);
          break;
        case "dark":
          orb.passive += 6 + focus;
          this.log.push(`黑暗宝珠蓄力至 ${orb.passive}`);
          break;
        case "glass": {
          orb.passive -= 1;
          for (const enemy of this.aliveEnemies()) {
            this.hitUnit(enemy, 3 + focus);
          }
          this.log.push(`玻璃宝珠对所有敌人造成 ${3 + focus} 点伤害`);
          if (orb.passive <= 0) {
            this.player.orbs.splice(i, 1);
            this.log.push("玻璃宝珠碎裂消散");
          }
          break;
        }
      }
    }
  }

  private resolveSummonAttack(): void {
    const summon = this.player.summon;
    if (!summon || summon.hp <= 0) return;
    const enemy = pickOne(this.aliveEnemies());
    if (!enemy) return;
    const strength = this.player.statuses.strength ?? 0;
    const dmg = Math.max(1, summon.damage + strength);
    this.hitUnit(enemy, dmg);
    this.log.push(`「${summon.name}」攻击「${enemy.name}」，造成 ${dmg} 点伤害`);
  }

  usePotion(potionId: string): boolean {
    const potion = this.db.potions[potionId];
    if (!potion) return false;
    for (const effect of potion.effects) {
      this.applyEffect(effect);
    }
    this.log.push(`使用药水「${potion.name}」`);
    return true;
  }

  // 奇巧（Sly）：牌被弃置时触发其弃牌效果。
  private triggerSly(cardId: string): void {
    const card = this.db.cards[cardId];
    if (!card?.sly || card.sly.length === 0) return;
    for (const effect of card.sly) {
      this.applyEffect(effect);
    }
    this.log.push(`触发「${card.name}」的奇巧`);
  }

  // 延迟效果（计数器）：每回合开始倒计时，归零时结算。
  private resolvePendingEffects(): void {
    for (let i = this.player.pending.length - 1; i >= 0; i--) {
      const pending = this.player.pending[i]!;
      pending.turns -= 1;
      if (pending.turns > 0) continue;
      this.player.pending.splice(i, 1);
      this.log.push(`结算：${pending.label}`);
      for (const effect of pending.effects) {
        this.applyEffect(effect);
      }
    }
  }

  // 条件增伤：按对应计数/数值计算额外伤害。
  private scalingBonus(
    scaling: DamageScaling,
    enemy: EnemyCombatState
  ): number {
    switch (scaling.per) {
      case "exhaustPile":
        return this.player.exhaustPile.length * scaling.amount;
      case "block":
        return this.player.block * scaling.amount;
      case "vulnerable":
        return (enemy.statuses.vulnerable ?? 0) * scaling.amount;
      case "attacksPlayed":
        return this.attacksPlayedThisTurn * scaling.amount;
      case "skillsPlayed":
        return this.skillsPlayedThisTurn * scaling.amount;
      case "cardsInHand":
        return this.player.hand.length * scaling.amount;
      case "poisonOnEnemy":
        return (enemy.statuses.poison ?? 0) * scaling.amount;
      case "strikeCards":
        return (
          [...this.instances.values()].filter((id) => id.includes("strike"))
            .length * scaling.amount
        );
    }
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

  // 被动效果触发（能力牌注册的钩子）：与遗物共用 hookDepth 防递归——
  // 被动效果产生的伤害/格挡/状态不会再次触发任何钩子。
  private applyPassiveHook(hook: PassiveHook): void {
    if (this.hookDepth > 0) return;
    const passives = [...this.player.passives];
    this.hookDepth += 1;
    try {
      for (const passive of passives) {
        if (passive.hook !== hook) continue;
        for (const effect of passive.effects) {
          this.applyEffect(effect);
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
        const shuffled = this.player.discardPile.length;
        this.player.drawPile = shuffle(this.player.discardPile);
        this.player.discardPile = [];
        this.justShuffled = true;
        this.pileMoves.push({
          from: "discard",
          to: "draw",
          count: shuffled,
          reason: "shuffle",
        });
        this.applyPassiveHook("shuffle");
      }
      const cardId = this.player.drawPile.pop()!;
      this.player.hand.push(cardId);
      this.pileMoves.push({
        from: "draw",
        to: "hand",
        count: 1,
        reason: "draw",
      });
      this.applyPassiveHook("drawCard");
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
        this.applyPassiveHook("combatEnd");
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
