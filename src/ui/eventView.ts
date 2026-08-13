import { Game } from "../core/game";
import { el, button, showToast } from "./dom";
import type { EventData } from "../core/types";

export function renderEvent(
  app: HTMLElement,
  game: Game,
  onExit: () => void,
  eventOverride?: EventData
): void {
  const event = eventOverride ?? game.pickEvent();
  if (!event) {
    game.run.status = "map";
    onExit();
    return;
  }

  const root = el("div", "event-view");
  const art = el("div", "event-art", event.art ?? "❓");
  const title = el("h2", "event-title", event.name);
  const text = el("p", "event-text", event.text);
  const options = el("div", "event-options");

  for (const option of event.options) {
    const affordable =
      option.goldCost === undefined || game.run.player.gold >= option.goldCost;
    const btn = button(option.label, () => {
      if (!affordable) return;
      if (option.fightEnemy) {
        game.startEventFight(option.fightEnemy);
        onExit();
        return;
      }
      const result = game.applyEventOption(option);
      if (result) {
        for (const relicId of result.gainedRelics) {
          const relic = game.db.relics[relicId];
          if (relic) {
            showToast(`获得遗物：${relic.name}（${relic.description}）`);
          }
        }
        if (result.upgradedCard) {
          showToast(
            `升级了「${game.db.cards[result.upgradedCard]?.name ?? result.upgradedCard}」`
          );
        }
      }
      game.run.status = "map";
      onExit();
    }, `btn event-btn${affordable ? "" : " disabled"}`);
    if (option.description) {
      btn.title = option.description;
      btn.appendChild(el("span", "event-btn-desc", option.description));
    }
    if (option.goldCost !== undefined) {
      btn.appendChild(
        el("span", "event-btn-desc", `需要 ${option.goldCost} 金币`)
      );
    }
    options.appendChild(btn);
  }

  const hp = el(
    "div",
    "event-hp",
    `生命 ${game.run.player.hp}/${game.run.player.maxHp} · 金币 ${game.run.player.gold}`
  );
  root.append(art, title, text, options, hp);
  app.replaceChildren(root);
}
