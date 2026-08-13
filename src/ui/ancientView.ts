import { Game } from "../core/game";
import { el, button, showToast } from "./dom";

export function renderAncient(
  app: HTMLElement,
  game: Game,
  onExit: () => void
): void {
  const ancient = game.currentAncient();
  if (!ancient) {
    game.run.status = "map";
    onExit();
    return;
  }

  const root = el("div", "ancient-view event-view");
  const art = el("div", "event-art", ancient.art ?? "🧭");
  const title = el("h2", "event-title", ancient.name);
  const text = el("p", "event-text", ancient.text);
  const actions = el("div", "event-options");

  const percent = game.settings.ancientHealPercent ?? ancient.healPercent ?? 100;
  const blessingBtn = button(
    "接受祝福",
    () => {
      const { healed, relic } = game.applyAncientBlessing();
      if (healed > 0) {
        showToast(`先古之力回复了 ${healed} 点生命`);
      } else {
        showToast("生命已处于最佳状态");
      }
      if (relic) {
        showToast(`获得遗物：${relic.name}（${relic.description}）`);
      } else {
        showToast("先古遗物已收集完毕");
      }
      game.run.status = "map";
      onExit();
    },
    "btn"
  );
  blessingBtn.title = `回复缺失生命值的 ${percent}%（当前 ${game.run.player.hp}/${game.run.player.maxHp}），并随机获得一件先古遗物`;

  const leaveBtn = button(
    "婉拒离开",
    () => {
      game.run.status = "map";
      onExit();
    },
    "btn btn-plain"
  );
  actions.append(blessingBtn, leaveBtn);

  const hp = el(
    "div",
    "event-hp",
    `生命 ${game.run.player.hp}/${game.run.player.maxHp} · 金币 ${game.run.player.gold}`
  );
  root.append(art, title, text, actions, hp);
  app.replaceChildren(root);
}
