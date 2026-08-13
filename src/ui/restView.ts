import { Game } from "../core/game";
import { el, button } from "./dom";
import { showUpgradePicker } from "./upgradePicker";

export function renderRest(
  app: HTMLElement,
  game: Game,
  onExit: () => void
): void {
  const root = el("div", "rest-view");
  const title = el("h2", "rest-title", "🔥 篝火");
  const actions = el("div", "rest-actions");

  const back = (): void => {
    game.run.status = "map";
    onExit();
  };

  const restBtn = button("休息（回复 30% 生命）", () => {
    const amount = Math.floor(game.run.player.maxHp * 0.3);
    game.heal(amount);
    back();
  }, "btn");

  const forgeBtn = button("锻造（升级一张牌）", () => {
    showUpgradePicker(game.run.player.deck, game.db, (_cardId, index) => {
      game.upgradeCardAt(index);
      back();
    });
  }, "btn");

  const leaveBtn = button("继续上路", back, "btn btn-plain");
  actions.append(restBtn, forgeBtn, leaveBtn);
  root.append(title, actions);
  app.replaceChildren(root);


}
