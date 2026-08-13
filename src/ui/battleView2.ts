import type { CardData, MapNode } from "../core/types";
import { Game } from "../core/game";
import { clear, el, button } from "./dom";
import {
  renderBar,
  renderCard,
  renderEnemyCard,
  renderStatusChips,
} from "./cardView";
import { showCardListOverlay, showRelicOverlay } from "./deckViewer";

type PileKind = "draw" | "discard" | "deck" | "removed";

let battleKeyHandler: ((e: KeyboardEvent) => void) | null = null;
let pileOverlay: { element: HTMLElement; kind: PileKind } | null = null;

interface BattleState {
  game: Game;
  node: MapNode;
  selectedCardId: string | null;
  prevHp: Record<string, number>;
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
    prevHp: {},
  };
  const handElements: HTMLElement[] = [];

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
  const handZone = el("div", "hand-zone");
  root.append(playerPanel, enemyZone, logZone, handZone);
  app.replaceChildren(root);

  const refresh = (): void => {
    const combat = state.game.combat;
    if (!combat) return;
    const snap = combat.snapshot();

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
        highlight: isTarget,
        onClick: () => {
          if (state.selectedCardId) {
            combat.playCard(state.selectedCardId, enemy.id);
            state.selectedCardId = null;
            refresh();
            checkEnd();
          }
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
    playerPanel.appendChild(el("div", "player-name", "你"));
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

    // Relics row.
    const relicRow = el("div", "relic-row");
    for (const relicId of state.game.run.player.relics) {
      const relic = state.game.db.relics[relicId];
      if (!relic) continue;
      const icon = el("span", "relic-icon clickable", relic.art ?? "💎");
      icon.title = `${relic.name}：${relic.description}`;
      icon.addEventListener("click", () =>
        showRelicOverlay(state.game.run.player.relics, state.game.db)
      );
      relicRow.appendChild(icon);
    }
    if (state.game.run.player.relics.length === 0) {
      relicRow.appendChild(el("span", "relic-empty", "（暂无遗物）"));
    }
    playerPanel.appendChild(relicRow);

    // Pile shortcuts.
    const pileRow = el("div", "pile-row");
    pileRow.append(
      button(
        `卡组 ${state.game.run.player.deck.length}`,
        () => showCardListOverlay("我的卡组", state.game.run.player.deck, state.game.db),
        "btn btn-mini"
      ),
      button(
        `抽牌堆 ${snap.player.drawPile.length}`,
        () =>
          showCardListOverlay("抽牌堆", snap.player.drawPile, state.game.db, (ref) =>
            combat.getCard(ref)
          ),
        "btn btn-mini"
      ),
      button(
        `弃牌堆 ${snap.player.discardPile.length}`,
        () =>
          showCardListOverlay("弃牌堆", snap.player.discardPile, state.game.db, (ref) =>
            combat.getCard(ref)
          ),
        "btn btn-mini"
      ),
      button(
        `消耗 ${snap.player.exhaustPile.length}`,
        () =>
          showCardListOverlay("消耗堆", snap.player.exhaustPile, state.game.db, (ref) =>
            combat.getCard(ref)
          ),
        "btn btn-mini"
      ),
      button(
        `移除 ${snap.player.removedPile.length}`,
        () => togglePile("removed"),
        "btn btn-mini"
      )
    );
    playerPanel.appendChild(pileRow);

    playerPanel.appendChild(
      button("结束回合", () => {
        if (combat.status !== "playerTurn") return;
        combat.endPlayerTurn();
        state.selectedCardId = null;
        refresh();
        checkEnd();
      }, "btn end-turn-btn")
    );

    if (onQuit) {
      playerPanel.appendChild(
        button("退出战斗", () => {
          if (
            window.confirm(
              "退出战斗并返回主菜单？进度将保存到进入战斗前，可从主菜单「继续上次」重打。"
            )
          ) {
            onQuit();
          }
        }, "btn btn-mini quit-btn")
      );
    }

    // Hand at the bottom. Hand entries are combat-local instance uids.
    clear(handZone);
    handElements.length = 0;
    for (const uid of snap.player.hand) {
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
          if (!canPlay || combat.status !== "playerTurn") return;
          if (needsTarget) {
            state.selectedCardId = state.selectedCardId === uid ? null : uid;
            refresh();
          } else {
            // Anti-mistouch: first click selects the card, a second click (or
            // left-click confirm) actually plays it.
            if (state.selectedCardId !== uid) {
              state.selectedCardId = uid;
              refresh();
            } else {
              cardEl.animate(
                [
                  { transform: "translateY(0) scale(1)", opacity: 1 },
                  { transform: "translateY(-70px) scale(1.12)", opacity: 1 },
                  { transform: "translateY(-150px) scale(0.9)", opacity: 0.3 },
                ],
                { duration: 260, easing: "ease-in" }
              );
              combat.playCard(uid);
              refresh();
              checkEnd();
            }
          }
        },
      });
      handZone.appendChild(cardEl);
      handElements.push(cardEl);
    }
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
  // A/S/D toggle draw pile / discard pile / deck overlays.
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
    } else if (key.toLowerCase() === "e") {
      e.preventDefault();
      if (combat.status !== "playerTurn") return;
      combat.endPlayerTurn();
      state.selectedCardId = null;
      refresh();
      checkEnd();
    } else if (key === "Escape") {
      e.preventDefault();
      state.selectedCardId = null;
      refresh();
    }
  };
  battleKeyHandler = handleKey;
  document.addEventListener("keydown", handleKey);

  refresh();
}
