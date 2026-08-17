import type { CardData, MapNode } from "../core/types";
import { ORB_DEFS } from "../core/types";
import { Game } from "../core/game";
import { clear, el, button, showToast } from "./dom";
import { attachTooltip } from "./tooltip";
import { showConfirm } from "./modal";
import { showCardPreview } from "./cardPreview";
import {
  renderBar,
  renderCard,
  renderEnemyCard,
  renderStatusChips,
} from "./cardView";
import { showCardListOverlay, showRelicOverlay } from "./deckViewer";

type PileKind = "draw" | "discard" | "exhaust" | "deck" | "removed";

let battleKeyHandler: ((e: KeyboardEvent) => void) | null = null;
let pileOverlay: { element: HTMLElement; kind: PileKind } | null = null;

interface BattleState {
  game: Game;
  node: MapNode;
  selectedCardId: string | null;
  hoveredCardId: string | null;
  prevHp: Record<string, number>;
  prevPlayerHp?: number;
  prevHand: string[];
  prevPileCounts: Record<string, number>;
  pileButtons: Partial<Record<"draw" | "discard" | "exhaust" | "removed", HTMLElement>>;
  pileStacks: Partial<Record<"draw" | "discard" | "exhaust" | "removed", HTMLElement>>;
  animating: boolean;
}

export function renderBattle(
  app: HTMLElement,
  game: Game,
  onExit: () => void,
  onQuit?: () => void
): void {
  const node = game.currentNode();
  if (!node || !game.combat) return;

  const state: BattleState = {
    game,
    node,
    selectedCardId: null,
    hoveredCardId: null,
    prevHp: {},
    prevHand: [],
    prevPileCounts: {},
    pileButtons: {},
    pileStacks: {},
    animating: false,
  };
  const handElements: HTMLElement[] = [];
  let previewClose: (() => void) | null = null;

  if (pileOverlay) {
    pileOverlay.element.remove();
    pileOverlay = null;
  }
  if (battleKeyHandler) {
    document.removeEventListener("keydown", battleKeyHandler);
    battleKeyHandler = null;
  }

  const root = el("div", "battle-view");
  const playerPanel = el("div", "player-panel");
  const enemyZone = el("div", "enemy-zone");
  const logZone = el("div", "log-zone");
  const handArea = el("div", "hand-area");
  const pileLeft = el("div", "pile-left");
  const pileRight = el("div", "pile-right");
  const handZone = el("div", "hand-zone");
  handArea.append(pileLeft, handZone, pileRight);
  root.append(playerPanel, enemyZone, logZone, handArea);
  app.replaceChildren(root);

  const refresh = (): void => {
    // 战斗状态发生变化时关闭卡牌预览。
    if (previewClose) {
      previewClose();
      previewClose = null;
    }
    const combat = state.game.combat;
    if (!combat) return;
    const snap = combat.snapshot();
    const moves = combat.pileMoves;
    combat.pileMoves = [];
    const exhaustToHand = moves.some(
      (m) => m.from === "exhaust" && m.to === "hand"
    );

    // Enemies on the right.
    clear(enemyZone);
    for (const enemy of snap.enemies) {
      if (enemy.hp <= 0) continue;
      const intent = combat.getIntent(enemy);
      const isTarget =
        state.selectedCardId !== null &&
        (state.game.db.cards[state.selectedCardId]?.target === "enemy" ||
          state.game.db.cards[state.selectedCardId]?.target === "allEnemies");
      const cardEl = renderEnemyCard(enemy, intent, {
        // 平面卡材质：Boss 用闪卡（foil），其余用合金；与卡牌材质同语言。
        material: state.game.db.enemies[enemy.id]?.isBoss ? "foil" : "alloy",
        highlight: isTarget,
        onClick: () => {
          if (!state.selectedCardId || state.animating) return;
          const card = state.game.db.cards[
            combat.getCardId(state.selectedCardId)
          ];
          if (!card) return;
          // 单目标卡打出：手牌飞向目标怪物卡，模拟攻击。
          const handCardEl = [...handZone.children].find(
            (c) =>
              c instanceof HTMLElement && c.dataset.uid === state.selectedCardId
          );
          const target = cardEl;
          let dx = 0;
          let dy = 0;
          if (handCardEl && target) {
            const a = handCardEl.getBoundingClientRect();
            const b = target.getBoundingClientRect();
            dx = b.left + b.width / 2 - (a.left + a.width / 2);
            dy = b.top + b.height / 2 - (a.top + a.height / 2);
            state.animating = true;
            handCardEl.animate(
              [
                { transform: "translate(0,0) scale(1)", opacity: 1 },
                {
                  transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(0.6)`,
                  opacity: 0.85,
                },
                {
                  transform: `translate(${dx}px, ${dy}px) scale(0.18)`,
                  opacity: 0,
                },
              ],
              { duration: 300, easing: "ease-in" }
            );
          }
          combat.playCard(state.selectedCardId, enemy.id);
          state.selectedCardId = null;
          window.setTimeout(() => {
            state.animating = false;
            refresh();
            checkEnd();
          }, 300);
        },
      });
      const prevHp = state.prevHp[enemy.id] ?? enemy.maxHp;
      if (enemy.hp < prevHp) {
        cardEl.animate(
          [
            { transform: "translateX(0)" },
            { transform: "translateX(-6px)" },
            { transform: "translateX(5px)" },
            { transform: "translateX(0)" },
          ],
          { duration: 240, easing: "ease-out" }
        );
      }
      state.prevHp[enemy.id] = enemy.hp;
      enemyZone.appendChild(cardEl);
    }

    // Log area.
    clear(logZone);
    logZone.appendChild(el("div", "turn-badge", `第 ${snap.turn} 回合`));
    for (const line of snap.log.slice(-6)) {
      logZone.appendChild(el("div", "log-line", line));
    }

    // Player panel on the top left.
    clear(playerPanel);
    const character = state.game.currentCharacter();
    playerPanel.appendChild(
      el("div", "player-name", character?.name ?? "你")
    );
    const hpRow = el("div", "player-hp-row");
    hpRow.append(
      renderBar(snap.player.hp, snap.player.maxHp),
      el("span", "hp-text", `${snap.player.hp}/${snap.player.maxHp}`)
    );
    playerPanel.appendChild(hpRow);

    const energyRow = el("div", "energy-row");
    for (let i = 0; i < snap.player.maxEnergy; i++) {
      energyRow.appendChild(
        el("span", `energy-orb${i < snap.player.energy ? " filled" : ""}`, "●")
      );
    }
    const block =
      snap.player.block > 0
        ? el("span", "player-block", `🛡 ${snap.player.block}`)
        : el("span");
    const chips = renderStatusChips(snap.player.statuses);
    playerPanel.appendChild(
      el("div", "player-sub", [energyRow, block, chips ?? el("span")])
    );

    // 资源行：星辰 / 灵魂 / 集中。
    const resourceRow = el("div", "resource-row");
    resourceRow.append(
      el("span", "resource-chip", `⭐ ${snap.player.stars}`),
      el("span", "resource-chip", `👻 ${snap.player.souls}`),
      snap.player.focus > 0
        ? el("span", "resource-chip", `🧠 集中 ${snap.player.focus}`)
        : el("span")
    );
    attachTooltip(resourceRow.children[0] as HTMLElement, "星辰：储君的资源，供星辰卡牌消耗");

    // 玩家受击：生命下降时玩家面板抖动。
    const prevPlayerHp = state.prevPlayerHp ?? snap.player.maxHp;
    if (snap.player.hp < prevPlayerHp) {
      playerPanel.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-7px)" },
          { transform: "translateX(6px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 260, easing: "ease-out" }
      );
    }
    state.prevPlayerHp = snap.player.hp;
    attachTooltip(resourceRow.children[1] as HTMLElement, "灵魂：亡灵契约师的资源，供灵魂卡牌消耗");
    if (snap.player.focus > 0) {
      attachTooltip(
        resourceRow.children[2] as HTMLElement,
        "集中：提升宝珠的伤害与格挡数值"
      );
    }
    playerPanel.appendChild(resourceRow);

    // 宝珠槽（最多 3 颗）。
    const orbRow = el("div", "orb-row");
    for (let i = 0; i < (snap.player.orbSlots ?? 3); i++) {
      const orb = snap.player.orbs[i];
      const slot = el(
        "div",
        `orb-slot${orb ? " filled" : ""}`,
        orb ? ORB_DEFS[orb.type].art : ""
      );
      if (orb) {
        slot.title = `${ORB_DEFS[orb.type].name}宝珠${
          orb.passive > 0 ? `（蓄力 ${orb.passive}）` : ""
        }`;
        attachTooltip(
          slot,
          `${ORB_DEFS[orb.type].name}宝珠：回合开始自动触发${
            orb.passive > 0 ? `（当前蓄力 ${orb.passive}）` : ""
          }`
        );
      }
      orbRow.appendChild(slot);
    }
    playerPanel.appendChild(orbRow);

    // 召唤物。
    const summon = snap.player.summon;
    if (summon) {
      const summonRow = el("div", "summon-row");
      summonRow.append(
        el("span", "summon-art", summon.art ?? "🦴"),
        el(
          "span",
          "summon-name",
          `${summon.name} ${Math.max(0, summon.hp)}/${summon.maxHp}`
        )
      );
      playerPanel.appendChild(summonRow);
      attachTooltip(
        summonRow,
        `${summon.name}：回合开始攻击随机敌人，存活时替你挡刀`
      );
    }

    // 延迟效果计数器（「下回合 / X 回合后」）。
    if (snap.player.pending.length > 0) {
      const pendingRow = el("div", "pending-row");
      for (const pending of snap.player.pending) {
        const chip = el(
          "span",
          "pending-chip",
          `${pending.icon ?? "⏳"} ${pending.turns} 回合后`
        );
        attachTooltip(chip, pending.label);
        pendingRow.appendChild(chip);
      }
      playerPanel.appendChild(pendingRow);
    }

    // 药水栏（战斗中使用，用后移除）。
    const potionRow = el("div", "potion-row");
    for (const potionId of state.game.run.player.potions) {
      const potion = state.game.db.potions[potionId];
      if (!potion) continue;
      const potionBtn = button(potion.art ?? "🧪", () => {
        if (combat.status !== "playerTurn") return;
        if (combat.usePotion(potionId)) {
          state.game.run.player.potions = state.game.run.player.potions.filter(
            (id) => id !== potionId
          );
          refresh();
          checkEnd();
        }
      }, "btn potion-btn");
      potionBtn.title = `${potion.name}：${potion.description}`;
      attachTooltip(potionBtn, `${potion.name}：${potion.description}`);
      potionRow.appendChild(potionBtn);
    }
    if (state.game.run.player.potions.length === 0) {
      potionRow.appendChild(el("span", "potion-empty", ""));
    }
    playerPanel.appendChild(potionRow);

    // Relics row.
    const relicRow = el("div", "relic-row");
    for (const relicId of state.game.run.player.relics) {
      const relic = state.game.db.relics[relicId];
      if (!relic) continue;
      const icon = el("span", "relic-icon clickable", relic.art ?? "💎");
      icon.title = `${relic.name}：${relic.description}`;
      attachTooltip(icon, `${relic.name}：${relic.description}`);
      icon.addEventListener("click", () =>
        showRelicOverlay(state.game.run.player.relics, state.game.db)
      );
      relicRow.appendChild(icon);
    }
    if (state.game.run.player.relics.length === 0) {
      relicRow.appendChild(el("span", "relic-empty", "（暂无遗物）"));
    }
    playerPanel.appendChild(relicRow);

    // 牌堆视图：左下=抽牌堆（上方为移除堆），右下=弃牌堆（上方为消耗堆）。
    const PILE_HOTKEYS: Record<
      "draw" | "discard" | "exhaust" | "removed",
      string
    > = { draw: "A", discard: "S", exhaust: "X", removed: "Z" };
    const makePileStack = (
      kind: "draw" | "discard" | "exhaust" | "removed",
      label: string,
      onClick: () => void
    ): HTMLElement => {
      const stack = el("div", `pile-stack pile-${kind}`);
      stack.append(
        el("div", "pile-back"),
        el("div", "pile-back"),
        el("div", "pile-back")
      );
      stack.append(el("div", "pile-count", "0"), el("div", "pile-label", label));
      stack.addEventListener("click", onClick);
      attachTooltip(stack, `${label}：点击查看（快捷键 ${PILE_HOTKEYS[kind]}）`);
      return stack;
    };

    const updatePileStack = (
      kind: "draw" | "discard" | "exhaust" | "removed",
      count: number,
      label: string,
      onClick: () => void
    ): void => {
      let stack = state.pileStacks[kind];
      if (!stack) {
        stack = makePileStack(kind, label, onClick);
        state.pileStacks[kind] = stack;
        if (kind === "removed" || kind === "draw") {
          pileLeft.appendChild(stack);
        } else {
          pileRight.appendChild(stack);
        }
      }
      const countEl = stack.querySelector(".pile-count");
      if (countEl) countEl.textContent = String(count);
      const prev = state.prevPileCounts[kind];
      if (prev !== undefined && prev !== count) {
        stack.classList.remove("pile-pulse");
        void stack.offsetWidth;
        stack.classList.add("pile-pulse");
      }
      // 洗牌动画：抽牌堆从空变为有牌。
      if (kind === "draw" && prev === 0 && count > 0) {
        stack.classList.remove("pile-shuffle");
        void stack.offsetWidth;
        stack.classList.add("pile-shuffle");
      }
      state.prevPileCounts[kind] = count;
    };

    updatePileStack("draw", snap.player.drawPile.length, "抽牌堆", () =>
      togglePile("draw")
    );
    updatePileStack(
      "discard",
      snap.player.discardPile.length,
      "弃牌堆",
      () => togglePile("discard")
    );
    updatePileStack(
      "exhaust",
      snap.player.exhaustPile.length,
      "消耗堆",
      () => togglePile("exhaust")
    );
    updatePileStack("removed", snap.player.removedPile.length, "移除堆", () =>
      togglePile("removed")
    );

    // 洗牌动画：本轮抽牌发生过洗牌（弃牌堆洗回抽牌堆）时抽牌堆抖动。
    if (combat.justShuffled) {
      const drawStack = state.pileStacks.draw;
      if (drawStack) {
        drawStack.classList.remove("pile-shuffle");
        void drawStack.offsetWidth;
        drawStack.classList.add("pile-shuffle");
      }
      combat.justShuffled = false;
    }

    // 牌堆间转移动画：洗牌（弃牌堆→抽牌堆）、弃牌效果、消耗堆取回。
    for (const move of moves) {
      if (
        move.reason === "draw" ||
        move.reason === "play" ||
        move.reason === "endTurn"
      ) {
        continue;
      }
      if (move.reason === "shuffle") {
        animatePileFlight(
          state.pileStacks.discard,
          state.pileStacks.draw,
          move.count
        );
      } else if (move.reason === "discard") {
        animatePileFlight(handZone, state.pileStacks.discard, move.count);
      } else if (move.reason === "retrieve") {
        animatePileFlight(state.pileStacks.exhaust, handZone, move.count);
      }
    }

    const deckBtn = button(
      `卡组 ${state.game.run.player.deck.length}`,
      () => showCardListOverlay("我的卡组", state.game.run.player.deck, state.game.db),
      "btn btn-mini"
    );
    attachTooltip(deckBtn, "卡组：点击查看（快捷键 D）");
    playerPanel.appendChild(deckBtn);

    playerPanel.appendChild(
      button("结束回合", () => {
        discardHandWithAnim();
      }, "btn end-turn-btn")
    );

    if (onQuit) {
      playerPanel.appendChild(
        button("退出战斗", () => {
          showConfirm(
            "退出战斗并返回主菜单？进度将保存到进入战斗前，可从主菜单「继续上次」重打。",
            onQuit
          );
        }, "btn btn-mini quit-btn")
      );
    }

    // Hand at the bottom. Hand entries are combat-local instance uids.
    clear(handZone);
    handElements.length = 0;
    // 弧线布局：中间牌平放，越靠两侧越下沉并外旋（左逆时针、右顺时针，
    // 外侧端自然下垂），模拟人类握牌习惯。
    const mid = (snap.player.hand.length - 1) / 2;
    const prevHandSet = new Set(state.prevHand);
    for (const [index, uid] of snap.player.hand.entries()) {
      const card = combat.getCard(uid);
      if (!card) continue;
      const canPlay = combat.canPlay(uid);
      // Only single-target cards need the player to pick an enemy. Cards that
      // hit all enemies, buff self, or target nothing are played directly.
      const needsTarget = card.target === "enemy";
      const cardEl = renderCard(card, {
        disabled: !canPlay,
        selected: state.selectedCardId === uid,
        onClick: () => {
          if (state.animating || !canPlay || combat.status !== "playerTurn")
            return;
          if (needsTarget) {
            state.selectedCardId = state.selectedCardId === uid ? null : uid;
            refreshSelection();
          } else {
            // Anti-mistouch: first click selects the card, a second click (or
            // left-click confirm) actually plays it.
            if (state.selectedCardId !== uid) {
              state.selectedCardId = uid;
              refreshSelection();
            } else {
              // 打出：攻击全体飞向敌人区、对自身飞向玩家面板、能力牌进移除堆。
              state.animating = true;
              const target =
                card.target === "allEnemies"
                  ? enemyZone
                  : card.type === "power"
                    ? state.pileStacks.removed ?? playerPanel
                    : playerPanel;
              let dx = 0;
              let dy = 0;
              if (target) {
                const a = cardEl.getBoundingClientRect();
                const b = target.getBoundingClientRect();
                dx = b.left + b.width / 2 - (a.left + a.width / 2);
                dy = b.top + b.height / 2 - (a.top + a.height / 2);
              }
              cardEl.animate(
                [
                  { transform: "translate(0,0) scale(1)", opacity: 1 },
                  {
                    transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(0.6)`,
                    opacity: 0.85,
                  },
                  {
                    transform: `translate(${dx}px, ${dy}px) scale(0.18)`,
                    opacity: 0,
                  },
                ],
                { duration: 300, easing: "ease-in" }
              );
              combat.playCard(uid);
              window.setTimeout(() => {
                state.animating = false;
                refresh();
                checkEnd();
              }, 300);
            }
          }
        },
      });
      cardEl.dataset.uid = uid;
      cardEl.addEventListener("mouseenter", () => {
        state.hoveredCardId = uid;
      });
      cardEl.addEventListener("mouseleave", () => {
        if (state.hoveredCardId === uid) state.hoveredCardId = null;
      });
      const offset = index - mid;
      const rot = offset * 4;
      const lift = Math.abs(offset) * 10;
      cardEl.style.setProperty("--arc-y", `${lift}px`);
      cardEl.style.setProperty("--arc-rot", `${rot}deg`);
      handZone.appendChild(cardEl);
      handElements.push(cardEl);
      if (!prevHandSet.has(uid)) {
        // 抽牌/入手：从抽牌堆方向飞入手牌；若本次是从消耗堆取回则用消耗堆。
        const sourceStack = exhaustToHand
          ? state.pileStacks.exhaust
          : state.pileStacks.draw;
        if (sourceStack) {
          const a = sourceStack.getBoundingClientRect();
          const b = cardEl.getBoundingClientRect();
          cardEl.style.setProperty(
            "--in-x",
            `${a.left + a.width / 2 - (b.left + b.width / 2)}px`
          );
          cardEl.style.setProperty(
            "--in-y",
            `${a.top + a.height / 2 - (b.top + b.height / 2)}px`
          );
        }
        cardEl.classList.add("card-in");
      }
    }
    state.prevHand = [...snap.player.hand];
  };

  // 轻量刷新：切换手牌选中/取消时只更新手牌选中态与敌人高亮，
  // 不重建敌人区/玩家区，避免怪物位置、动画等状态被重置。
  const refreshSelection = (): void => {
    for (const child of handZone.children) {
      if (!(child instanceof HTMLElement)) continue;
      child.classList.toggle(
        "selected",
        child.dataset.uid === state.selectedCardId
      );
    }
    const targetCard = state.selectedCardId
      ? state.game.db.cards[state.selectedCardId]
      : null;
    const highlightAll =
      targetCard?.target === "enemy" ||
      targetCard?.target === "allEnemies";
    for (const child of enemyZone.children) {
      if (!(child instanceof HTMLElement)) continue;
      child.classList.toggle("highlight", Boolean(highlightAll));
    }
  };

  // 结束回合：手牌依次飞向弃牌堆（右下），动画结束后结算。
  const discardHandWithAnim = (): void => {
    const combat = state.game.combat;
    if (!combat) return;
    if (state.animating || combat.status !== "playerTurn") return;
    state.animating = true;
    const cards = [...handZone.children].filter(
      (c): c is HTMLElement => c instanceof HTMLElement
    );
    const target = state.pileStacks.discard;
    let tx = 0;
    let ty = 0;
    if (target) {
      const b = target.getBoundingClientRect();
      tx = b.left + b.width / 2;
      ty = b.top + b.height / 2;
    }
    cards.forEach((el, i) => {
      const a = el.getBoundingClientRect();
      const dx = tx - (a.left + a.width / 2);
      const dy = ty - (a.top + a.height / 2);
      el.animate(
        [
          { transform: "translate(0,0) scale(1)", opacity: 1 },
          {
            transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(0.7)`,
            opacity: 0.9,
          },
          {
            transform: `translate(${dx}px, ${dy}px) scale(0.18)`,
            opacity: 0,
          },
        ],
        { duration: 340, delay: i * 28, easing: "ease-in", fill: "forwards" }
      );
    });
    const total = 340 + cards.length * 28;
    window.setTimeout(() => {
      combat.endPlayerTurn();
      state.selectedCardId = null;
      refresh();
      checkEnd();
      state.animating = false;
    }, total);
  };

  // 牌堆间飞行：从源堆叠飞 N 张牌背精灵到目标堆叠。
  const animatePileFlight = (
    fromEl: HTMLElement | null | undefined,
    toEl: HTMLElement | null | undefined,
    count: number
  ): void => {
    if (!fromEl || !toEl || count <= 0) return;
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    const sx = a.left + a.width / 2;
    const sy = a.top + a.height / 2;
    const ex = b.left + b.width / 2;
    const ey = b.top + b.height / 2;
    const fly = Math.min(3, count);
    for (let i = 0; i < fly; i++) {
      const card = el("div", "fly-card");
      card.style.left = `${sx}px`;
      card.style.top = `${sy}px`;
      document.body.appendChild(card);
      card.animate(
        [
          { transform: "translate(0,0) scale(0.5)", opacity: 0.9 },
          {
            transform: `translate(${ex - sx}px, ${ey - sy}px) scale(1)`,
            opacity: 1,
          },
          {
            transform: `translate(${ex - sx}px, ${ey - sy}px) scale(0.35)`,
            opacity: 0,
          },
        ],
        { duration: 430, delay: i * 70, easing: "ease-in-out", fill: "forwards" }
      );
      window.setTimeout(() => card.remove(), 430 + i * 70 + 120);
    }
    toEl.classList.remove("pile-pulse");
    void toEl.offsetWidth;
    toEl.classList.add("pile-pulse");
  };

  const checkEnd = (): void => {
    const combat = state.game.combat;
    if (!combat) return;
    if (combat.status === "won") {
      state.game.finishBattle(true, state.node);
      showReward();
    } else if (combat.status === "lost") {
      state.game.finishBattle(false, state.node);
      showDefeat();
    }
  };

  const showReward = (): void => {
    const overlay = el("div", "overlay");
    const panel = el("div", "panel reward-panel");
    panel.appendChild(el("h2", "panel-title", "战斗胜利！"));

    // 普通/精英战斗有概率掉落药水。
    if (state.node.type !== "boss") {
      if (
        state.game.run.player.potions.length < 3 &&
        Math.random() < 0.4
      ) {
        const potion = state.game.rollPotion();
        if (potion) {
          state.game.addPotion(potion.id);
          showToast(`获得药水：${potion.name}（${potion.description}）`);
        }
      }
    }

    if (state.node.type === "boss") {
      panel.appendChild(
        el(
          "p",
          "panel-text",
          `你击败了第 ${state.game.run.act} 层的首领！`
        )
      );
      const makeNextBtn = (): HTMLButtonElement =>
        state.game.run.act >= 3
          ? button("通关！", () => {
              overlay.remove();
              onExit();
            })
          : button("进入下一层", () => {
              state.game.advanceAct();
              overlay.remove();
              onExit();
            });
      // Bosses also give a card reward; pick a card before moving on.
      const bossRewards = state.game.rollCardReward("boss");
      if (bossRewards.length > 0) {
        panel.appendChild(
          el("p", "panel-text", "选择一张卡牌加入你的牌组：")
        );
        const rewardRow = el("div", "reward-row");
        for (const card of bossRewards) {
          rewardRow.appendChild(
            renderCard(card, {
              onClick: () => {
                state.game.addCardToDeck(card.id);
                rewardRow.remove();
                panel.appendChild(makeNextBtn());
              },
            })
          );
        }
        panel.appendChild(rewardRow);
      } else {
        panel.appendChild(makeNextBtn());
      }
    } else {
      if (state.node.type === "elite") {
        const relic = state.game.rollRelicReward("reward");
        if (relic) {
          state.game.addRelic(relic.id);
          panel.appendChild(el("p", "panel-text", "你获得了一件遗物："));
          const relicBox = el("div", "elite-relic-reward");
          relicBox.append(
            el("div", "shop-relic-art", relic.art ?? "💎"),
            el("div", "shop-item-name", relic.name),
            el("div", "shop-item-desc", relic.description)
          );
          attachTooltip(relicBox, `${relic.name}：${relic.description}`);
          panel.appendChild(relicBox);
        }
      }
      panel.appendChild(el("p", "panel-text", "选择一张卡牌加入你的牌组："));
      const rewardRow = el("div", "reward-row");
      const rewards = state.game.rollCardReward(
        state.node.type === "elite" ? "elite" : "normal"
      );
      for (const card of rewards) {
        rewardRow.appendChild(
          renderCard(card, {
            onClick: () => {
              state.game.addCardToDeck(card.id);
              overlay.remove();
              onExit();
            },
          })
        );
      }
      const skipBtn = button("跳过", () => {
        overlay.remove();
        onExit();
      }, "btn btn-plain");
      panel.append(rewardRow, skipBtn);
    }

    overlay.appendChild(panel);
    app.appendChild(overlay);
  };

  const showDefeat = (): void => {
    const overlay = el("div", "overlay");
    const panel = el("div", "panel defeat-panel");
    panel.appendChild(el("h2", "panel-title", "你倒下了"));
    panel.appendChild(
      el(
        "p",
        "panel-text",
        "但失败是构筑之旅的一部分。回到主菜单再来一局吧。"
      )
    );
    panel.appendChild(
      button("回到主菜单", () => {
        overlay.remove();
        onExit();
      })
    );
    overlay.appendChild(panel);
    app.appendChild(overlay);
  };

  // Hotkeys: 1-0 select the hand card at that position (click semantics),
  // A/S/D/X/Z toggle draw / discard / deck / exhaust / removed overlays.
  const clickHand = (index: number): void => {
    handElements[index]?.click();
  };

  const togglePile = (kind: PileKind): void => {
    if (
      pileOverlay &&
      pileOverlay.kind === kind &&
      pileOverlay.element.isConnected
    ) {
      pileOverlay.element.remove();
      pileOverlay = null;
      return;
    }
    if (pileOverlay) {
      pileOverlay.element.remove();
      pileOverlay = null;
    }
    const combat = state.game.combat;
    if (!combat) return;
    const snap = combat.snapshot();
    let title: string;
    let refs: string[];
    let resolve: ((ref: string) => CardData | undefined) | undefined;
    if (kind === "draw") {
      title = "抽牌堆";
      refs = snap.player.drawPile;
      resolve = (ref) => combat.getCard(ref);
    } else if (kind === "discard") {
      title = "弃牌堆";
      refs = snap.player.discardPile;
      resolve = (ref) => combat.getCard(ref);
    } else if (kind === "exhaust") {
      title = "消耗堆";
      refs = snap.player.exhaustPile;
      resolve = (ref) => combat.getCard(ref);
    } else if (kind === "removed") {
      title = "移除（本场战斗暂时移出）";
      refs = snap.player.removedPile;
      resolve = (ref) => combat.getCard(ref);
    } else {
      title = "我的卡组";
      refs = state.game.run.player.deck;
    }
    pileOverlay = {
      element: showCardListOverlay(title, refs, state.game.db, resolve),
      kind,
    };
  };

  const handleKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    const combat = state.game.combat;
    if (!combat || state.game.run.status !== "battle") return;
    const key = e.key;
    if (key >= "1" && key <= "9") {
      e.preventDefault();
      clickHand(Number(key) - 1);
    } else if (key === "0") {
      e.preventDefault();
      clickHand(9);
    } else if (key.toLowerCase() === "a") {
      e.preventDefault();
      togglePile("draw");
    } else if (key.toLowerCase() === "s") {
      e.preventDefault();
      togglePile("discard");
    } else if (key.toLowerCase() === "d") {
      e.preventDefault();
      togglePile("deck");
    } else if (key.toLowerCase() === "x") {
      e.preventDefault();
      togglePile("exhaust");
    } else if (key.toLowerCase() === "z") {
      e.preventDefault();
      togglePile("removed");
    } else if (key.toLowerCase() === "e") {
      e.preventDefault();
      discardHandWithAnim();
    } else if (key === "Escape") {
      e.preventDefault();
      if (previewClose) {
        previewClose();
        previewClose = null;
        state.hoveredCardId = null;
        return;
      }
      state.selectedCardId = null;
      refreshSelection();
    } else if (key === " ") {
      e.preventDefault();
      const combat = state.game.combat;
      if (!combat) return;
      // 悬停优先、选中兜底。
      const targetUid = state.hoveredCardId ?? state.selectedCardId;
      if (!targetUid) return;
      const card = state.game.db.cards[combat.getCardId(targetUid)];
      if (!card) return;
      if (previewClose) {
        previewClose();
        previewClose = null;
        state.hoveredCardId = null;
      } else {
        const upgraded = card.id.endsWith("+")
          ? undefined
          : state.game.db.cards[`${card.id}+`];
        previewClose = showCardPreview(card, app, upgraded);
      }
    }
  };
  battleKeyHandler = handleKey;
  document.addEventListener("keydown", handleKey);

  refresh();
}
