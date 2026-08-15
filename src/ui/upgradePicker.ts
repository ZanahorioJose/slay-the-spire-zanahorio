import type { GameDatabase } from "../core/types";
import { el, button } from "./dom";
import { renderCard } from "./cardView";
import { showConfirm } from "./modal";

export function showUpgradePicker(
  deck: string[],
  db: GameDatabase,
  onUpgrade: (cardId: string, index: number) => void
): void {
  const overlay = el("div", "overlay");
  const panel = el("div", "panel deck-panel");
  panel.appendChild(el("h2", "panel-title", "选择要升级的牌"));
  // Every deck entry is its own instance: duplicates are shown separately so
  // upgrading one copy never touches the others.
  const candidates = deck
    .map((id, index) => ({ id, index }))
    .filter(({ id }) => !id.endsWith("+") && db.cards[id]?.upgrade);
  if (candidates.length === 0) {
    panel.appendChild(el("p", "panel-text", "牌组里没有可以升级的牌。"));
  } else {
    const grid = el("div", "deck-grid");
    for (const { id: cardId, index } of candidates) {
      const card = db.cards[cardId];
      const upgraded = db.cards[`${cardId}+`];
      if (!card) continue;
      const pair = el("div", "upgrade-pair clickable");
      pair.appendChild(renderCard(card, { small: true }));
      pair.appendChild(el("span", "upgrade-arrow", "➜"));
      if (upgraded) pair.appendChild(renderCard(upgraded, { small: true }));
      pair.title = `升级第 ${index + 1} 张「${card.name}」`;
      pair.addEventListener("click", () => {
        showConfirm(
          `确定升级第 ${index + 1} 张「${card.name}」？升级后无法撤销。`,
          () => {
            overlay.remove();
            onUpgrade(cardId, index);
          }
        );
      });
      grid.appendChild(pair);
    }
    panel.appendChild(grid);
  }
  panel.appendChild(button("取消", () => overlay.remove(), "btn btn-plain"));
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}
