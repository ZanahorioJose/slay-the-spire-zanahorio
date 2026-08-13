import { Game } from "../src/core/game";
import { buildDatabase } from "../src/data";

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
  game.run.player.relics.push("victoryHeal");
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
  combat.endPlayerTurn();
  if (enemy.block !== 0) {
    throw new Error(`enemy block should reset before acting, got ${enemy.block}`);
  }
  if (combat.player.hp !== 65) {
    throw new Error(`player should take 5 damage, hp=${combat.player.hp}`);
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
  const db = buildDatabase({
    relics: {
      jade_pendant: null,
      tactical_manual: null,
      thorn_armor: null,
      war_drum: null,
      blood_vial: null,
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
  const db = buildDatabase({
    cards: {
      strike: null,
      defend: null,
      bash: null,
      heavy_blow: null,
      twin_strike: null,
      cleave: null,
      poison_stab: null,
      flying_knee: null,
      iron_wall: null,
      battle_cry: null,
      dodge: null,
      weaken: null,
      uppercut: null,
      flame_barrier: null,
      entrench: null,
      sacrifice: null,
      limit_break: null,
      metallicize_card: null,
      ritual_card: null,
      thousand_cuts: null,
      corpse_explosion: null,
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

console.log("ALL CORE TESTS PASSED");
