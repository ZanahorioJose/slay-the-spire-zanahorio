import { Game } from "../core/game";
import { el, button, showToast } from "./dom";
import { pickOne } from "../core/rng";

export function renderTreasure(
  app: HTMLElement,
  game: Game,
  onExit: () => void
): void {
  const root = el("div", "treasure-view");
  const art = el("div", "treasure-art", "🎁");
  const title = el("h2", "treasure-title", "宝箱");

  const openBtn = button("打开宝箱", () => {
    const owned = new Set(game.run.player.relics);
    const candidates = Object.values(game.db.relics).filter(
      (r) => !owned.has(r.id)
    );
    if (candidates.length === 0) {
      game.gainGold(60);
      showToast("遗物已收集完毕，改为获得 60 金币。");
    } else {
      const relic = pickOne(candidates);
      game.addRelic(relic.id);
      showToast(`获得遗物：${relic.name}（${relic.description}）`);
    }
    game.gainGold(40);
    game.run.status = "map";
    onExit();
  }, "btn");

  const leaveBtn = button("继续上路", () => {
    game.run.status = "map";
    onExit();
  }, "btn btn-plain");

  root.append(art, title, openBtn, leaveBtn);
  app.replaceChildren(root);
}
