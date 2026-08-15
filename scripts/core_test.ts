import { Game } from "../src/core/game";
import { buildDatabase } from "../src/data";
import { PASSIVE_CARD_FIXES } from "../src/data/passive_card_fixes";

function playOneRun(runId: number): void {
  const db = buildDatabase();
  const game = new Game(db);

  // Walk from the entry node and fight whatever comes.
  let steps = 0;
  while (steps < 20) {
    steps += 1;
    const node = game.currentNode() ?? game.run.map.find((n) => n.row === 0);
    if (!node) throw new Error("no node");
    game.enterNode(node);

    // Row 0 is the ancient event: accept the blessing, then keep walking.
    if (game.run.status === "ancient") {
      game.applyAncientBlessing();
      game.run.status = "map";
      const next = game.run.map
        .filter(
          (n) =>
            n.row > node.row &&
            (n.type === "battle" || n.type === "elite" || n.type === "boss") &&
            node.next.includes(n.id)
        )
        .sort((a, b) => a.row - b.row)[0];
      if (!next) {
        console.log(`run ${runId}: no more nodes after ${steps} battles (ok)`);
        return;
      }
      game.run.currentNodeId = next.id;
      continue;
    }

    if (game.run.status !== "battle" || !game.combat) {
      throw new Error(`expected battle, got ${game.run.status}`);
    }

    let guard = 0;
    while (game.combat.status === "playerTurn" && guard < 100) {
      guard += 1;
      const combat = game.combat;
      const playable = combat.player.hand.find((id) => combat.canPlay(id));
      if (playable) {
        combat.playCard(playable);
      } else {
        combat.endPlayerTurn();
      }
    }

    const result = game.combat.status;
    if (result === "lost") {
      console.log(`run ${runId}: lost after ${steps} battles (ok)`);
      return;
    }
    if (result !== "won") {
      throw new Error(`combat stuck in ${result}`);
    }

    game.finishBattle(true, node);
    if (game.run.status === "victory") {
      console.log(`run ${runId}: cleared act ${game.run.act} (ok)`);
      return;
    }

    // Pick first reward card, then move to the next reachable node.
    const reward = game.rollCardReward("normal");
    if (reward.length > 0) game.addCardToDeck(reward[0].id);

    const next = game.run.map
      .filter(
        (n) =>
          n.row > node.row &&
          (n.type === "battle" || n.type === "elite" || n.type === "boss") &&
          (game.run.currentNodeId === null ||
            game.run.map
              .find((m) => m.id === game.run.currentNodeId)
              ?.next.includes(n.id))
      )
      .sort((a, b) => a.row - b.row)[0];
    if (!next) {
      console.log(`run ${runId}: no more nodes after ${steps} battles (ok)`);
      return;
    }
    game.run.currentNodeId = next.id;
  }
  console.log(`run ${runId}: finished walk (ok)`);
}

for (let i = 0; i < 5; i++) {
  playOneRun(i);
}

// Player death must end the fight immediately, including self-inflicted
// damage via a loseHp effect.
{
  const db = buildDatabase();
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["strike"];
  const combat = game.startCombat(entry, ["slime"]);
  if (!combat) throw new Error("no combat");
  combat.player.hp = 1;
  combat.applyEffect({ op: "loseHp", amount: 5 });
  if (combat.status !== "lost") {
    throw new Error("player should die from loseHp");
  }
  console.log("player death on loseHp (ok)");
}

// Upgraded cards are derived from their base card: editing base numbers
// carries over to the `+` form, and legacy explicit `+` entries are dropped.
{
  const customDb = buildDatabase({
    cards: {
      strike: {
        id: "strike",
        name: "打击",
        type: "attack",
        cost: 1,
        rarity: "starter",
        target: "enemy",
        description: "造成 7 点伤害。",
        effects: [{ op: "damage", amount: 7 }],
        upgrade: { effects: [{ op: "damage", amount: 10 }] },
      },
    },
  });
  const upgraded = customDb.cards["strike+"];
  if (!upgraded) throw new Error("upgraded card should exist");
  const effect = upgraded.effects[0];
  if (effect.op !== "damage" || effect.amount !== 10) {
    throw new Error("upgrade effects should use the upgrade override");
  }
  if (upgraded.name !== "打击+") throw new Error("upgrade name suffix missing");

  const legacyDb = buildDatabase({
    cards: {
      strike: {
        id: "strike",
        name: "打击",
        type: "attack",
        cost: 1,
        rarity: "starter",
        target: "enemy",
        description: "造成 6 点伤害。",
        effects: [{ op: "damage", amount: 6 }],
        upgrade: { effects: [{ op: "damage", amount: 9 }] },
      },
      // Legacy snapshot format: an explicit upgraded card. Must be ignored
      // and replaced by the derived form.
      "strike+": {
        id: "strike+",
        name: "打击·特制",
        type: "attack",
        cost: 2,
        rarity: "starter",
        target: "enemy",
        description: "完全自定义。",
        effects: [{ op: "damage", amount: 15 }],
      },
    },
  });
  const custom = legacyDb.cards["strike+"];
  if (!custom || custom.name !== "打击+" || custom.effects[0].amount !== 9) {
    throw new Error(
      "legacy explicit + cards must be dropped; derived form wins"
    );
  }
  console.log("legacy + card cleanup (ok)");
}

// Battle events are strictly serial: card effects resolve first, then
// cardPlayed relics, and multiple relics fire in acquisition order.
{
  const db = buildDatabase({
    cards: {
      strike: {
        id: "strike",
        name: "打击",
        type: "attack",
        cost: 1,
        rarity: "starter",
        target: "enemy",
        description: "造成 6 点伤害。",
        effects: [{ op: "damage", amount: 6 }],
      },
    },
    relics: {
      relicA: {
        id: "relicA",
        name: "A",
        description: "",
        trigger: "cardPlayed",
        effects: [{ op: "heal", amount: 1 }],
      },
      relicB: {
        id: "relicB",
        name: "B",
        description: "",
        trigger: "cardPlayed",
        effects: [{ op: "loseHp", amount: 1 }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["strike"];
  game.run.player.relics.push("relicA", "relicB");
  const combat = game.startCombat(entry, ["slime"]);
  if (!combat) throw new Error("no combat");
  combat.player.hp = 50;
  const uid = combat.player.hand.find((c) => combat.getCardId(c) === "strike");
  if (!uid) throw new Error("no strike in hand");
  combat.playCard(uid);
  const dmgIdx = combat.log.findIndex((l) => l.includes("造成"));
  const healIdx = combat.log.findIndex((l) => l.includes("回复"));
  const loseIdx = combat.log.findIndex((l) => l.includes("失去"));
  if (!(dmgIdx >= 0 && dmgIdx < healIdx && healIdx < loseIdx)) {
    console.log("DEBUG relics:", combat.relics);
    console.log("DEBUG log:", combat.log);
    throw new Error(`bad order dmg=${dmgIdx} heal=${healIdx} lose=${loseIdx}`);
  }
  console.log("battle event order (ok)");
}

// damageDealt fires once per damaging hit and does not recurse into itself.
{
  const db = buildDatabase({
    cards: {
      strike: {
        id: "strike",
        name: "打击",
        type: "attack",
        cost: 1,
        rarity: "starter",
        target: "enemy",
        description: "造成 6 点伤害。",
        effects: [{ op: "damage", amount: 6 }],
      },
    },
    relics: {
      rage: {
        id: "rage",
        name: "怒气",
        description: "",
        trigger: "damageDealt",
        effects: [{ op: "block", amount: 1 }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["strike"];
  game.run.player.relics.push("rage");
  const combat = game.startCombat(entry, ["slime"]);
  if (!combat) throw new Error("no combat");
  const uid = combat.player.hand.find((c) => combat.getCardId(c) === "strike");
  if (!uid) throw new Error("no strike in hand");
  combat.playCard(uid);
  if (combat.player.block !== 1) {
    throw new Error(`damageDealt should grant 1 block once, got ${combat.player.block}`);
  }
  console.log("damageDealt relic (ok)");
}

// blockGained fires once (no recursion) when a card gains block.
{
  const db = buildDatabase({
    cards: {
      defend: {
        id: "defend",
        name: "防御",
        type: "skill",
        cost: 1,
        rarity: "starter",
        target: "self",
        description: "获得 5 点格挡。",
        effects: [{ op: "block", amount: 5 }],
      },
    },
    relics: {
      anchor: {
        id: "anchor",
        name: "锚",
        description: "",
        trigger: "blockGained",
        effects: [{ op: "block", amount: 1 }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["defend"];
  game.run.player.relics.push("anchor");
  const combat = game.startCombat(entry, ["slime"]);
  if (!combat) throw new Error("no combat");
  const uid = combat.player.hand.find((c) => combat.getCardId(c) === "defend");
  if (!uid) throw new Error("no defend in hand");
  combat.playCard(uid);
  if (combat.player.block !== 6) {
    throw new Error(`blockGained should add 1 block once, got ${combat.player.block}`);
  }
  console.log("blockGained relic (ok)");
}

// battleEnd relics fire once on victory (and can heal the player).
{
  const db = buildDatabase({
    cards: {
      strike: {
        id: "strike",
        name: "打击",
        type: "attack",
        cost: 1,
        rarity: "starter",
        target: "enemy",
        description: "造成 999 点伤害。",
        effects: [{ op: "damage", amount: 999 }],
      },
    },
    relics: {
      victoryHeal: {
        id: "victoryHeal",
        name: "胜利回春",
        description: "",
        trigger: "battleEnd",
        effects: [{ op: "heal", amount: 5 }],
      },
    },
    enemies: {
      testEnemy: {
        id: "testEnemy",
        name: "测试怪",
        maxHp: 30,
        pattern: "loop",
        moves: [{ name: "待机", type: "special" }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["strike"];
  // 覆盖角色默认遗物，只保留测试遗物，避免燃烧之血叠加治疗。
  game.run.player.relics = ["victoryHeal"];
  const combat = game.startCombat(entry, ["testEnemy"]);
  if (!combat) throw new Error("no combat");
  combat.player.hp = 1;
  const uid = combat.player.hand.find((c) => combat.getCardId(c) === "strike");
  if (!uid) throw new Error("no strike in hand");
  combat.playCard(uid);
  if (combat.status !== "won" || combat.player.hp !== 6) {
    throw new Error(`battleEnd relic should heal on victory: ${combat.status} hp=${combat.player.hp}`);
  }
  console.log("battleEnd relic (ok)");
}

// Upgrading a card must touch exactly one deck instance, never all copies.
{
  const db = buildDatabase();
  const game = new Game(db);
  game.run.player.deck = ["strike", "strike", "defend"];
  const upgraded = game.upgradeCardAt(1);
  if (upgraded !== "strike") throw new Error("upgradeCardAt should return base id");
  if (game.run.player.deck[0] !== "strike") {
    throw new Error("first strike must stay unupgraded");
  }
  if (game.run.player.deck[1] !== "strike+") {
    throw new Error("second strike must be upgraded");
  }
  if (game.run.player.deck[2] !== "defend") {
    throw new Error("defend must stay untouched");
  }
  if (game.upgradeCardAt(1) !== null) {
    throw new Error("already upgraded instance must not upgrade again");
  }
  console.log("single-instance upgrade (ok)");
}

// Random upgrade (events) also upgrades exactly one instance.
{
  const db = buildDatabase();
  const game = new Game(db);
  game.run.player.deck = ["strike", "strike", "defend"];
  const before = [...game.run.player.deck];
  game.upgradeRandomCard();
  const upgradedCount = game.run.player.deck.filter((c) => c.endsWith("+")).length;
  if (upgradedCount !== 1 || game.run.player.deck.length !== before.length) {
    throw new Error(
      `random upgrade must touch exactly one copy: +${upgradedCount}`
    );
  }
  console.log("random single-instance upgrade (ok)");
}

// Removing a card removes exactly one deck instance.
{
  const db = buildDatabase();
  const game = new Game(db);
  game.run.player.deck = ["strike", "strike", "defend"];
  game.removeCardAt(0);
  if (
    game.run.player.deck.length !== 2 ||
    game.run.player.deck[0] !== "strike" ||
    game.run.player.deck[1] !== "defend"
  ) {
    throw new Error("removeCardAt must remove exactly one instance");
  }
  console.log("single-instance remove (ok)");
}

// Enemy block persists into the player's turn and absorbs attacks; it is
// cleared right before the enemy acts again.
{
  const db = buildDatabase({
    enemies: {
      shieldGuy: {
        id: "shieldGuy",
        name: "盾怪",
        maxHp: 30,
        pattern: "loop",
        moves: [
          { name: "防御", type: "defend", block: 10 },
          { name: "攻击", type: "attack", damage: 5 },
        ],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["strike"];
  const combat = game.startCombat(entry, ["shieldGuy"]);
  const enemy = combat.enemies[0];

  // Enemy turn 1: defends and keeps the block for the player's turn.
  combat.endPlayerTurn();
  if (enemy.block !== 10) {
    throw new Error(`enemy should keep 10 block, got ${enemy.block}`);
  }

  // Player attacks: block absorbs the damage, HP stays untouched.
  const uid = combat.player.hand.find((c) => combat.getCardId(c) === "strike");
  if (!uid) throw new Error("no strike in hand");
  combat.playCard(uid);
  if (enemy.hp !== 30 || enemy.block !== 4) {
    throw new Error(
      `block should absorb strike: hp=${enemy.hp} block=${enemy.block}`
    );
  }

  // Enemy turn 2: old block is cleared before it attacks.
  const hpBeforeHit = combat.player.hp;
  combat.endPlayerTurn();
  if (enemy.block !== 0) {
    throw new Error(`enemy block should reset before acting, got ${enemy.block}`);
  }
  if (combat.player.hp !== hpBeforeHit - 5) {
    throw new Error(
      `player should take 5 damage, hp=${combat.player.hp} before=${hpBeforeHit}`
    );
  }
  console.log("enemy block absorb (ok)");
}

// Power cards are REMOVED when played (temporarily out of this battle): they
// go to a dedicated removed pile — never the discard pile and never the
// exhaust pile, so future exhaust-interaction cards cannot resurrect them.
{
  const db = buildDatabase({
    cards: {
      powerTest: {
        id: "powerTest",
        name: "测试能力",
        type: "power",
        cost: 1,
        rarity: "rare",
        target: "self",
        description: "",
        effects: [],
      },
    },
    enemies: {
      testEnemy: {
        id: "testEnemy",
        name: "测试怪",
        maxHp: 30,
        pattern: "loop",
        moves: [{ name: "待机", type: "special" }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["powerTest"];
  const combat = game.startCombat(entry, ["testEnemy"]);
  const uid = combat.player.hand.find((c) => combat.getCardId(c) === "powerTest");
  if (!uid) throw new Error("no power in hand");
  combat.playCard(uid);
  if (
    combat.player.removedPile.length !== 1 ||
    combat.player.exhaustPile.length !== 0 ||
    combat.player.discardPile.length !== 0
  ) {
    throw new Error(
      `power must go to removed pile: removed=${combat.player.removedPile.length} discard=${combat.player.discardPile.length} exhaust=${combat.player.exhaustPile.length}`
    );
  }
  console.log("power card removed (ok)");
}

// Relic pools: a relic restricted to "shop" never drops from elite rewards.
{
  const baseRelicNulls = Object.fromEntries(
    Object.keys(buildDatabase().relics).map((id) => [id, null])
  );
  const db = buildDatabase({
    relics: {
      ...baseRelicNulls,
      shopOnly: {
        id: "shopOnly",
        name: "商店限定",
        description: "",
        trigger: "combatStart",
        effects: [],
        pools: ["shop"],
      },
      anyRelic: {
        id: "anyRelic",
        name: "通用遗物",
        description: "",
        trigger: "combatStart",
        effects: [],
      },
    },
  });
  const game = new Game(db);
  const reward = game.rollRelicReward("reward");
  if (!reward || reward.id !== "anyRelic") {
    throw new Error(`reward relic must come from the reward pool, got ${reward?.id}`);
  }
  game.run.player.relics.push("anyRelic");
  const shopRoll = game.rollRelicReward("shop");
  if (!shopRoll || shopRoll.id !== "shopOnly") {
    throw new Error(`shop relic pool should return the shop relic, got ${shopRoll?.id}`);
  }
  console.log("relic pool filter (ok)");
}

// Card pools: a card restricted to "shop" never appears in card rewards.
{
  const baseCardNulls = Object.fromEntries(
    Object.keys(buildDatabase().cards).map((id) => [id, null])
  );
  const db = buildDatabase({
    cards: {
      ...baseCardNulls,
      shopCard: {
        id: "shopCard",
        name: "商店牌",
        type: "skill",
        cost: 0,
        rarity: "common",
        target: "self",
        description: "",
        effects: [],
        pools: ["shop"],
      },
      rewardCard: {
        id: "rewardCard",
        name: "奖励牌",
        type: "attack",
        cost: 1,
        rarity: "common",
        target: "enemy",
        description: "",
        effects: [{ op: "damage", amount: 1 }],
      },
    },
  });
  const game = new Game(db);
  const rewards = game.rollCardReward("normal");
  if (rewards.some((c) => c.id === "shopCard")) {
    throw new Error("shop-only card must not appear in card rewards");
  }
  if (!rewards.some((c) => c.id === "rewardCard")) {
    throw new Error("reward pool card should appear in card rewards");
  }
  console.log("card pool filter (ok)");
}

// Events can grant a random relic from a pool and skip owned relics.
{
  const db = buildDatabase({
    relics: {
      relicOne: {
        id: "relicOne",
        name: "遗物一",
        description: "",
        trigger: "combatStart",
        effects: [],
      },
      relicTwo: {
        id: "relicTwo",
        name: "遗物二",
        description: "",
        trigger: "combatStart",
        effects: [],
      },
    },
  });
  const game = new Game(db);
  game.run.player.relics.push("relicOne");
  const result = game.applyEventOption({
    label: "随机遗物",
    effects: [],
    addRelicPool: ["relicOne", "relicTwo"],
  });
  if (!result || result.gainedRelics.length !== 1) {
    throw new Error(`event should grant exactly one relic, got ${JSON.stringify(result)}`);
  }
  if (result.gainedRelics[0] !== "relicTwo") {
    throw new Error("already-owned relic must be skipped in the random pool");
  }
  if (!game.run.player.relics.includes("relicTwo")) {
    throw new Error("random relic should be added to the run");
  }
  console.log("event random relic (ok)");
}

// Ancient: the first node of every act is an ancient event; the blessing
// heals missing HP (default 100%) and grants a relic from the ancient pool.
{
  const db = buildDatabase();
  const game = new Game(db, { startingHp: 70 });
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  if (entry.type !== "ancient") {
    throw new Error(`first node must be ancient, got ${entry.type}`);
  }
  game.run.player.hp = 40;
  const result = game.applyAncientBlessing();
  if (result.healed !== 30 || game.run.player.hp !== 70) {
    throw new Error(
      `ancient blessing should heal 30, healed=${result.healed} hp=${game.run.player.hp}`
    );
  }
  if (!result.relic || !game.run.player.relics.includes(result.relic.id)) {
    throw new Error("ancient blessing should grant a relic");
  }
  const ancient = game.currentAncient();
  if (!ancient || !ancient.relicPool.includes(result.relic.id)) {
    throw new Error("granted relic must come from the ancient relic pool");
  }
  // Every act starts with an ancient node too.
  game.advanceAct();
  const nextEntry = game.run.map.find((n) => n.row === 0);
  if (!nextEntry || nextEntry.type !== "ancient") {
    throw new Error(`act 2 first node must be ancient, got ${nextEntry?.type}`);
  }
  console.log("ancient blessing (ok)");
}

// Difficulty overrides the ancient heal percentage (e.g. 50% of missing HP).
{
  const game = new Game(buildDatabase(), {
    startingHp: 70,
    ancientHealPercent: 50,
  });
  game.run.player.hp = 40;
  const result = game.applyAncientBlessing();
  if (result.healed !== 15 || game.run.player.hp !== 55) {
    throw new Error(
      `50% heal should heal 15, healed=${result.healed} hp=${game.run.player.hp}`
    );
  }
  console.log("ancient heal percent override (ok)");
}

// Version tags on cards/relics survive the data pipeline.
{
  const customDb = buildDatabase({
    cards: {
      strike: {
        id: "strike",
        name: "打击",
        type: "attack",
        cost: 1,
        rarity: "starter",
        target: "enemy",
        description: "造成 6 点伤害。",
        effects: [{ op: "damage", amount: 6 }],
        version: "DLC1",
      },
    },
    relics: {
      testRelic: {
        id: "testRelic",
        name: "测试遗物",
        description: "",
        trigger: "combatStart",
        effects: [],
        version: "测试包",
      },
    },
  });
  if (customDb.cards.strike.version !== "DLC1") {
    throw new Error("card version tag should survive the pipeline");
  }
  if (customDb.relics.testRelic.version !== "测试包") {
    throw new Error("relic version tag should survive the pipeline");
  }
  console.log("version tag pipeline (ok)");
}

// Thorns: a player with thorns reflects damage back onto attacking enemies;
// an enemy with thorns damages the player when attacked.
{
  const db = buildDatabase({
    cards: {
      strike: {
        id: "strike",
        name: "打击",
        type: "attack",
        cost: 1,
        rarity: "starter",
        target: "enemy",
        description: "造成 6 点伤害。",
        effects: [{ op: "damage", amount: 6 }],
      },
      defend: {
        id: "defend",
        name: "防御",
        type: "skill",
        cost: 1,
        rarity: "starter",
        target: "self",
        description: "获得 5 点格挡。",
        effects: [{ op: "block", amount: 5 }],
      },
    },
    enemies: {
      thornGuy: {
        id: "thornGuy",
        name: "荆棘怪",
        maxHp: 40,
        pattern: "loop",
        moves: [{ name: "攻击", type: "attack", damage: 7 }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["strike", "strike", "strike", "defend"];
  const combat = game.startCombat(entry, ["thornGuy"]);
  const enemy = combat.enemies[0];

  // Player casts thorns, then the enemy attacks: the enemy must take the
  // reflected damage (player thorns, not enemy thorns).
  combat.player.statuses.thorns = 3;
  combat.endPlayerTurn();
  if (enemy.hp !== 37) {
    throw new Error(
      `enemy should take 3 thorns damage, hp=${enemy.hp} log=${combat.log.slice(-3).join(" | ")}`
    );
  }

  // Enemy with thorns: player's strike reflects damage back onto the player.
  enemy.statuses.thorns = 4;
  const playerHpBefore = combat.player.hp;
  const uid = combat.player.hand.find((c) => combat.getCardId(c) === "strike");
  if (!uid) throw new Error("no strike in hand");
  combat.playCard(uid);
  if (combat.player.hp !== playerHpBefore - 4) {
    throw new Error(
      `player should take 4 thorns damage, hp=${combat.player.hp}`
    );
  }
  console.log("thorns reflection both ways (ok)");
}

// Characters: starting HP/deck/relics come from the chosen character, and
// card rewards never offer cards belonging to another character.
{
  const db = buildDatabase();
  const game = new Game(db, { characterId: "silent" });
  if (game.run.player.hp !== 70 || game.run.player.character !== "silent") {
    throw new Error(
      `silent should start with 70 hp, hp=${game.run.player.hp} char=${game.run.player.character}`
    );
  }
  if (!game.run.player.relics.includes("ring_of_the_snake")) {
    throw new Error("silent should start with ring_of_the_snake");
  }
  if (
    !game.run.player.deck.includes("neutralize") ||
    !game.run.player.deck.includes("survivor")
  ) {
    throw new Error("silent should start with neutralize and survivor");
  }

  const warrior = new Game(db, { characterId: "warrior" });
  for (let i = 0; i < 40; i++) {
    for (const card of warrior.rollCardReward("normal")) {
      if (card.character === "silent" || card.character === "defect") {
        throw new Error(
          `warrior reward must not contain other characters' cards: ${card.id}`
        );
      }
    }
  }
  console.log("character start & reward filter (ok)");
}

// cardExhausted relic: exhausting a card (or playing a power) triggers it.
{
  const db = buildDatabase({
    cards: {
      exhaustTest: {
        id: "exhaustTest",
        name: "消耗测试",
        type: "skill",
        cost: 0,
        rarity: "common",
        target: "self",
        description: "",
        effects: [],
        exhaust: true,
      },
    },
    relics: {
      ember: {
        id: "ember",
        name: "余烬",
        description: "",
        trigger: "cardExhausted",
        effects: [{ op: "block", amount: 1 }],
      },
    },
    enemies: {
      testEnemy: {
        id: "testEnemy",
        name: "测试怪",
        maxHp: 30,
        pattern: "loop",
        moves: [{ name: "待机", type: "special" }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["exhaustTest"];
  game.run.player.relics.push("ember");
  const combat = game.startCombat(entry, ["testEnemy"]);
  const uid = combat.player.hand.find((c) => combat.getCardId(c) === "exhaustTest");
  if (!uid) throw new Error("no exhaustTest in hand");
  combat.playCard(uid);
  if (combat.player.block !== 1 || combat.player.exhaustPile.length !== 1) {
    throw new Error(
      `cardExhausted relic should give 1 block: block=${combat.player.block}`
    );
  }
  console.log("cardExhausted relic (ok)");
}

// receiveDamage relic: taking actual HP damage triggers it (thorns
// reflection during the player's turn keeps the gained block alive).
{
  const db = buildDatabase({
    cards: {
      strike: {
        id: "strike",
        name: "打击",
        type: "attack",
        cost: 1,
        rarity: "starter",
        target: "enemy",
        description: "造成 6 点伤害。",
        effects: [{ op: "damage", amount: 6 }],
      },
    },
    relics: {
      plating: {
        id: "plating",
        name: "反应装甲",
        description: "",
        trigger: "receiveDamage",
        effects: [{ op: "block", amount: 1 }],
      },
    },
    enemies: {
      puncher: {
        id: "puncher",
        name: "拳击手",
        maxHp: 30,
        pattern: "loop",
        moves: [{ name: "待机", type: "special" }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["strike"];
  game.run.player.relics.push("plating");
  const combat = game.startCombat(entry, ["puncher"]);
  combat.enemies[0].statuses.thorns = 4;
  const hpBefore = combat.player.hp;
  const uid = combat.player.hand.find((c) => combat.getCardId(c) === "strike");
  if (!uid) throw new Error("no strike in hand");
  combat.playCard(uid);
  if (combat.player.hp !== hpBefore - 4 || combat.player.block !== 1) {
    throw new Error(
      `receiveDamage relic should trigger on hit: hp=${combat.player.hp} block=${combat.player.block}`
    );
  }
  console.log("receiveDamage relic (ok)");
}

// Stars: divine_right grants 3 stars at combat start; star-cost cards gate.
{
  const db = buildDatabase();
  const game = new Game(db, { characterId: "regent" });
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["strike"];
  const combat = game.startCombat(entry, ["slime"]);
  if (combat.player.stars !== 3) {
    throw new Error(`regent should start combat with 3 stars, got ${combat.player.stars}`);
  }
  if (!combat.canPlay("seven_stars")) {
    throw new Error("seven_stars should be playable with 3 stars");
  }
  combat.player.stars = 2;
  if (combat.canPlay("seven_stars")) {
    throw new Error("seven_stars must require 3 stars");
  }
  console.log("stars resource (ok)");
}

// Souls: necrobinder cards gain souls; soul-cost cards gate on souls.
{
  const db = buildDatabase();
  const game = new Game(db, { characterId: "necrobinder" });
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["bodyguard"];
  const combat = game.startCombat(entry, ["slime"]);
  const uid = combat.player.hand.find((c) => combat.getCardId(c) === "bodyguard");
  if (!uid) throw new Error("no bodyguard in hand");
  combat.playCard(uid);
  if (combat.player.souls !== 1) {
    throw new Error(`bodyguard should grant 1 soul, got ${combat.player.souls}`);
  }
  if (combat.canPlay("soul_storm")) {
    throw new Error("soul_storm must require 3 souls");
  }
  console.log("souls resource (ok)");
}

// Orbs: cracked core channels lightning at combat start; zap adds a second
// orb; passive lightning fires each turn; dualcast evokes the leftmost orb.
{
  const db = buildDatabase();
  const game = new Game(db, { characterId: "defect" });
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["zap", "dualcast"];
  const combat = game.startCombat(entry, ["slime"]);
  const enemy = combat.enemies[0];
  // Turn 1 passive already fired during start: enemy took 3.
  if (enemy.hp !== 15 || combat.player.orbs.length !== 1) {
    throw new Error(
      `cracked core should channel 1 orb and deal 3: hp=${enemy.hp} orbs=${combat.player.orbs.length}`
    );
  }
  const zapUid = combat.player.hand.find((c) => combat.getCardId(c) === "zap");
  if (!zapUid) throw new Error("no zap in hand");
  combat.playCard(zapUid);
  if (combat.player.orbs.length !== 2) {
    throw new Error(`zap should channel a second orb, got ${combat.player.orbs.length}`);
  }
  const dualUid = combat.player.hand.find((c) => combat.getCardId(c) === "dualcast");
  if (!dualUid) throw new Error("no dualcast in hand");
  const hpBeforeEvoke = enemy.hp;
  combat.playCard(dualUid);
  if (combat.player.orbs.length !== 1 || enemy.hp >= hpBeforeEvoke) {
    throw new Error(
      `dualcast should evoke an orb: orbs=${combat.player.orbs.length} hp=${enemy.hp}`
    );
  }
  console.log("orb channel / passive / evoke (ok)");
}

// Summon: bound phylactery summons Osty; it attacks each turn and blocks
// enemy damage until destroyed.
{
  const db = buildDatabase({
    enemies: {
      puncher: {
        id: "puncher",
        name: "拳击手",
        maxHp: 40,
        pattern: "loop",
        moves: [{ name: "攻击", type: "attack", damage: 7 }],
      },
    },
  });
  const game = new Game(db, { characterId: "necrobinder" });
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  const combat = game.startCombat(entry, ["puncher"]);
  const summon = combat.player.summon;
  if (!summon || summon.name !== "骷髅护卫") {
    throw new Error("bound phylactery should summon Osty");
  }
  const enemy = combat.enemies[0];
  // startCombat 内已经过第 1 回合开始：召唤物攻击了敌人。
  if (enemy.hp !== 37) {
    throw new Error("summon should attack for 3 at turn start");
  }
  const hpPlayerBefore = combat.player.hp;
  combat.endPlayerTurn();
  // Enemy attack of 7 hits the 3 HP summon; player takes 4.
  if (combat.player.hp !== hpPlayerBefore - 4) {
    throw new Error(
      `summon should absorb 3 damage: player took ${hpPlayerBefore - combat.player.hp}`
    );
  }
  console.log("summon attack & block (ok)");
}

// Doom: an enemy reaching 10 doom is executed at the start of its turn.
{
  const db = buildDatabase({
    enemies: {
      doomed: {
        id: "doomed",
        name: "受诅者",
        maxHp: 50,
        pattern: "loop",
        moves: [{ name: "攻击", type: "attack", damage: 5 }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  const combat = game.startCombat(entry, ["doomed"]);
  const enemy = combat.enemies[0];
  combat.applyEffect(
    { op: "apply", status: "doom", amount: 10, target: "enemy" },
    enemy.id
  );
  combat.endPlayerTurn();
  if (enemy.hp !== 0 || !combat.log.some((l) => l.includes("灾厄处决"))) {
    throw new Error(
      `doom 10 should execute the enemy: hp=${enemy.hp} log=${combat.log.slice(-4).join(" | ")}`
    );
  }
  console.log("doom execute (ok)");
}

// Potions: usePotion applies effects; the bag caps at 3.
{
  const db = buildDatabase();
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  const combat = game.startCombat(entry, ["slime"]);
  combat.player.hp = 50;
  if (!combat.usePotion("blood_potion")) {
    throw new Error("blood_potion should be usable");
  }
  if (combat.player.hp !== 60) {
    throw new Error(`blood potion should heal 10, hp=${combat.player.hp}`);
  }
  game.run.player.potions = ["fire_potion", "blood_potion"];
  game.addPotion("energy_potion");
  game.addPotion("draw_potion");
  if (game.run.player.potions.length !== 3) {
    throw new Error("potion bag should cap at 3");
  }
  console.log("potion use & bag cap (ok)");
}

// retrieveFromExhaust: exhaust-interaction cards can pull cards back from
// the exhaust pile, but power cards live in the removed pile and stay out.
{
  const db = buildDatabase({
    cards: {
      exhaustTest: {
        id: "exhaustTest",
        name: "消耗测试",
        type: "skill",
        cost: 0,
        rarity: "common",
        target: "self",
        description: "",
        effects: [],
        exhaust: true,
      },
      powerTest: {
        id: "powerTest",
        name: "能力测试",
        type: "power",
        cost: 0,
        rarity: "rare",
        target: "self",
        description: "",
        effects: [],
      },
    },
    enemies: {
      testEnemy: {
        id: "testEnemy",
        name: "测试怪",
        maxHp: 30,
        pattern: "loop",
        moves: [{ name: "待机", type: "special" }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["exhaustTest", "powerTest"];
  const combat = game.startCombat(entry, ["testEnemy"]);
  const exhaustUid = combat.player.hand.find(
    (c) => combat.getCardId(c) === "exhaustTest"
  );
  const powerUid = combat.player.hand.find(
    (c) => combat.getCardId(c) === "powerTest"
  );
  if (!exhaustUid || !powerUid) throw new Error("cards missing from hand");
  combat.playCard(exhaustUid);
  combat.playCard(powerUid);
  if (combat.player.exhaustPile.length !== 1 || combat.player.removedPile.length !== 1) {
    throw new Error("exhaust and removed piles should each hold one card");
  }
  combat.applyEffect({ op: "retrieveFromExhaust", amount: 1 });
  if (combat.player.exhaustPile.length !== 0 || !combat.player.hand.includes(exhaustUid)) {
    throw new Error("retrieve should pull the exhausted card back into hand");
  }
  if (combat.player.removedPile.length !== 1) {
    throw new Error("power card must stay in the removed pile");
  }
  console.log("retrieve from exhaust (ok)");
}

// STS2 全卡池完整性：数量充足、效果操作符合法、addCard 引用存在。
{
  const db = buildDatabase();
  const baseCount = Object.values(db.cards).filter(
    (c) => !c.id.endsWith("+")
  ).length;
  if (baseCount < 400) {
    throw new Error(`STS2 pool should exceed 400 base cards, got ${baseCount}`);
  }
  const validOps = new Set([
    "damage",
    "block",
    "apply",
    "multiplyStatus",
    "draw",
    "energy",
    "heal",
    "loseHp",
    "damageAll",
    "addCard",
    "exhaustRandom",
    "gainGold",
    "gainStars",
    "gainSouls",
    "channel",
    "evoke",
    "focus",
    "summon",
    "healSummon",
    "retrieveFromExhaust",
    "discard",
    "forge",
    "addCountdown",
    "passive",
    "retrieveFromDiscard",
    "addRandomCard",
    "transformCard",
    "playTopCard",
    "orbSlots",
  ]);
  for (const card of Object.values(db.cards)) {
    const allEffects = [...card.effects, ...(card.upgrade?.effects ?? [])];
    for (const effect of allEffects) {
      if (!validOps.has(effect.op)) {
        throw new Error(`bad effect op "${effect.op}" on ${card.id}`);
      }
      if (effect.op === "addCard" && !db.cards[effect.cardId]) {
        throw new Error(
          `addCard references missing card ${effect.cardId} on ${card.id}`
        );
      }
    }
  }
  console.log("STS2 pool integrity (ok)");
}

// 计数器（延迟效果）：下回合 / X 回合后结算。
{
  const db = buildDatabase({
    enemies: {
      testEnemy: {
        id: "testEnemy",
        name: "测试怪",
        maxHp: 40,
        pattern: "loop",
        moves: [{ name: "待机", type: "special" }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["strike"];
  const combat = game.startCombat(entry, ["testEnemy"]);
  const enemy = combat.enemies[0];
  combat.applyEffect({
    op: "addCountdown",
    turns: 1,
    label: "炸弹引爆",
    icon: "⏳",
    effects: [{ op: "damageAll", amount: 10 }],
    target: "enemies",
  });
  const hpBefore = enemy.hp;
  combat.endPlayerTurn();
  // 结束回合 → 敌人回合 → 下一回合开始结算倒计时。
  if (enemy.hp !== hpBefore - 10) {
    throw new Error(
      `countdown should deal 10 on next turn: hp=${enemy.hp} before=${hpBefore}`
    );
  }
  if (combat.player.pending.length !== 0) {
    throw new Error("countdown should be consumed after resolving");
  }
  console.log("countdown delayed effect (ok)");
}

// 锻造：升级手牌中随机一张（战斗实例）。
{
  const db = buildDatabase();
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["strike"];
  const combat = game.startCombat(entry, ["slime"]);
  const uid = combat.player.hand.find((c) => combat.getCardId(c) === "strike");
  if (!uid) throw new Error("no strike in hand");
  combat.applyEffect({ op: "forge", amount: 1 });
  if (combat.getCardId(uid) !== "strike+") {
    throw new Error("forge should upgrade the strike instance in hand");
  }
  console.log("forge upgrade (ok)");
}

// 弃牌与奇巧（Sly）：弃置手牌触发被弃牌的奇巧效果。
{
  const db = buildDatabase({
    cards: {
      slyCard: {
        id: "slyCard",
        name: "奇巧卡",
        type: "skill",
        cost: 0,
        rarity: "common",
        target: "self",
        description: "",
        effects: [],
        sly: [{ op: "draw", amount: 1 }],
      },
      discarder: {
        id: "discarder",
        name: "弃牌手",
        type: "skill",
        cost: 0,
        rarity: "common",
        target: "self",
        description: "弃置 1 张手牌。",
        effects: [{ op: "discard", amount: 1 }],
      },
    },
    enemies: {
      testEnemy: {
        id: "testEnemy",
        name: "测试怪",
        maxHp: 30,
        pattern: "loop",
        moves: [{ name: "待机", type: "special" }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  // 手牌只有一张奇巧卡，弃置必然触发奇巧。
  game.run.player.deck = ["slyCard"];
  const combat = game.startCombat(entry, ["testEnemy"]);
  if (combat.player.hand.length !== 1) throw new Error("expected 1 card in hand");
  combat.applyEffect({ op: "discard", amount: 1 });
  // 弃置触发奇巧抽 1 → 手牌仍为 1 张。
  if (combat.player.hand.length !== 1) {
    throw new Error(
      `sly draw should offset the discard: hand=${combat.player.hand.length}`
    );
  }
  if (
    !combat.log.some((l) => l.includes("奇巧")) &&
    !combat.log.some((l) => l.includes("sly"))
  ) {
    throw new Error("sly trigger should be logged");
  }
  console.log("discard & sly trigger (ok)");
}

// 条件增伤：每张消耗堆牌 +N 伤害。
{
  const db = buildDatabase({
    cards: {
      ashen: {
        id: "ashen",
        name: "灰烬",
        type: "attack",
        cost: 1,
        rarity: "uncommon",
        target: "enemy",
        description: "造成 6 点伤害。",
        effects: [
          {
            op: "damage",
            amount: 6,
            scaling: { per: "exhaustPile", amount: 3 },
          },
        ],
      },
      fuel: {
        id: "fuel",
        name: "燃料",
        type: "skill",
        cost: 0,
        rarity: "common",
        target: "self",
        description: "",
        effects: [],
        exhaust: true,
      },
    },
    enemies: {
      testEnemy: {
        id: "testEnemy",
        name: "测试怪",
        maxHp: 200,
        pattern: "loop",
        moves: [{ name: "待机", type: "special" }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["ashen", "fuel", "fuel"];
  const combat = game.startCombat(entry, ["testEnemy"]);
  const enemy = combat.enemies[0];
  for (const uid of [...combat.player.hand]) {
    if (combat.getCardId(uid) === "fuel") combat.playCard(uid);
  }
  const ashenUid = combat.player.hand.find(
    (c) => combat.getCardId(c) === "ashen"
  );
  if (!ashenUid) throw new Error("no ashen in hand");
  const hpBefore = enemy.hp;
  combat.playCard(ashenUid);
  if (enemy.hp !== hpBefore - 12) {
    throw new Error(
      `scaling should add 3 per exhausted card (2 fuel): took ${hpBefore - enemy.hp}`
    );
  }
  console.log("scaling damage (ok)");
}

// 牌堆转移事件：洗牌 / 弃牌 / 消耗堆取回都会记录，供 UI 播放动画。
{
  const db = buildDatabase({
    cards: {
      fuel: {
        id: "fuel",
        name: "燃料",
        type: "skill",
        cost: 0,
        rarity: "common",
        target: "self",
        description: "",
        effects: [],
        exhaust: true,
      },
    },
    enemies: {
      testEnemy: {
        id: "testEnemy",
        name: "测试怪",
        maxHp: 30,
        pattern: "loop",
        moves: [{ name: "待机", type: "special" }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["fuel", "fuel", "strike"];
  const combat = game.startCombat(entry, ["testEnemy"]);
  combat.pileMoves = [];

  // 消耗堆取回会记录 exhaust → hand 事件。
  const fuelUid = combat.player.hand.find(
    (c) => combat.getCardId(c) === "fuel"
  );
  if (!fuelUid) throw new Error("no fuel in hand");
  combat.playCard(fuelUid);
  combat.pileMoves = [];
  combat.applyEffect({ op: "retrieveFromExhaust", amount: 1 });
  if (
    !combat.pileMoves.some(
      (m) => m.from === "exhaust" && m.to === "hand" && m.reason === "retrieve"
    )
  ) {
    throw new Error("retrieve should record an exhaust→hand move");
  }
  combat.pileMoves = [];

  // 洗牌：抽牌堆抽空后弃牌堆洗回，记录 discard → draw 事件。
  combat.player.drawPile = [];
  combat.player.discardPile = ["strike", "strike"];
  combat.applyEffect({ op: "draw", amount: 2 });
  const shuffle = combat.pileMoves.find((m) => m.reason === "shuffle");
  if (!shuffle || shuffle.from !== "discard" || shuffle.to !== "draw") {
    throw new Error("shuffle should record a discard→draw move");
  }
  console.log("pile move events (ok)");
}

// 被动钩子系统：注册的被动在对应时机触发（回合开始），且不递归。
{
  const db = buildDatabase();
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["strike"];
  const combat = game.startCombat(entry, ["slime"]);
  combat.applyEffect({
    op: "passive",
    hook: "turnStart",
    effects: [{ op: "apply", status: "vigor", amount: 4, target: "self" }],
  });
  combat.endPlayerTurn();
  if ((combat.player.statuses.vigor ?? 0) !== 4) {
    throw new Error(
      `passive turnStart should grant vigor 4, got ${combat.player.statuses.vigor}`
    );
  }
  console.log("passive hook (ok)");
}

// 新状态：装甲吸收伤害、活力加伤后归零、保留手牌、壁垒保留格挡。
{
  const db = buildDatabase({
    enemies: {
      puncher: {
        id: "puncher",
        name: "拳击手",
        maxHp: 60,
        pattern: "loop",
        moves: [{ name: "攻击", type: "attack", damage: 7 }],
      },
    },
  });
  const game = new Game(db);
  const entry = game.run.map.find((n) => n.row === 0);
  if (!entry) throw new Error("no entry node");
  game.run.player.deck = ["strike", "defend"];
  const combat = game.startCombat(entry, ["puncher"]);
  const enemy = combat.enemies[0];

  // 活力：攻击伤害 +2 后归零。
  combat.player.statuses.vigor = 2;
  const hpBefore = enemy.hp;
  const strikeUid = combat.player.hand.find(
    (c) => combat.getCardId(c) === "strike"
  );
  if (!strikeUid) throw new Error("no strike");
  combat.playCard(strikeUid);
  if (enemy.hp !== hpBefore - 8 || (combat.player.statuses.vigor ?? 0) !== 0) {
    throw new Error(
      `vigor should add 2 and reset: took ${hpBefore - enemy.hp} vigor=${combat.player.statuses.vigor}`
    );
  }

  // 装甲：敌人攻击被装甲吸收一部分。
  combat.player.statuses.plating = 3;
  const playerHp = combat.player.hp;
  combat.endPlayerTurn();
  if (combat.player.hp !== playerHp - 4 || (combat.player.statuses.plating ?? 0) !== 0) {
    throw new Error(
      `plating should absorb 3: took ${playerHp - combat.player.hp} plating=${combat.player.statuses.plating}`
    );
  }

  // 保留：结束回合时保留 1 张手牌。
  combat.player.statuses.retain = 1;
  const keptCard = combat.player.hand[0];
  combat.endPlayerTurn();
  if (!combat.player.hand.includes(keptCard)) {
    throw new Error("retain should keep the first hand card in hand");
  }

  // 壁垒：格挡在回合开始时不被清除。
  combat.player.statuses.barricade = 1;
  combat.player.block = 20;
  combat.endPlayerTurn();
  // 敌人攻击 7 消耗 7 点格挡；剩余 13 在下一回合开始时被壁垒保留。
  if (combat.player.block !== 13) {
    throw new Error(`barricade should keep remaining block, got ${combat.player.block}`);
  }
  console.log("plating / vigor / retain / barricade (ok)");
}

// 52 张未实现卡的修正已生效：effects 非空、描述非空。
{
  const db = buildDatabase();
  const ids = Object.keys(PASSIVE_CARD_FIXES);
  if (ids.length < 50) {
    throw new Error(`expected 52 fixes, got ${ids.length}`);
  }
  for (const id of ids) {
    const card = db.cards[id];
    if (!card) throw new Error(`missing card ${id}`);
    if (card.effects.length === 0) {
      throw new Error(`card ${id} still has empty effects`);
    }
    if (!card.description) {
      throw new Error(`card ${id} has empty description`);
    }
  }
  console.log(`passive card fixes applied (${ids.length} cards) (ok)`);
}

// 本地化：全部基础卡与升级卡描述均为中文（无英文残留）。
{
  const db = buildDatabase();
  const all = Object.values(db.cards);
  const english = all.filter((c) => /[A-Za-z]{3}/.test(c.description));
  if (english.length > 0) {
    throw new Error(
      `${english.length} cards still have english descriptions: ${english
        .slice(0, 8)
        .map((c) => c.id)
        .join(",")}`
    );
  }
  console.log(`localization all-Chinese (${all.length} cards) (ok)`);
}

console.log("ALL CORE TESTS PASSED");
