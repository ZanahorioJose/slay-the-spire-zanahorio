import type { CardData, GameDatabase } from "../core/types";
import { el, button } from "./dom";
import { attachTooltip } from "./tooltip";
import { renderCard } from "./cardView";

export function showCardListOverlay(
  title: string,
  refs: string[],
  db: GameDatabase,
  resolve?: (ref: string) => CardData | undefined
): HTMLElement {
  const overlay = el("div", "overlay");
  const panel = el("div", "panel deck-panel pop-in");
  panel.appendChild(el("h2", "panel-title", title));
  const grid = el("div", "deck-grid");
  for (const ref of refs) {
    const card = resolve ? resolve(ref) : db.cards[ref];
    if (card) grid.appendChild(renderCard(card, { small: true }));
  }
  if (grid.childElementCount === 0) {
    grid.appendChild(el("p", "panel-text", "（空的）"));
  }
  panel.append(
    grid,
    button("关闭", () => overlay.remove(), "btn btn-plain")
  );
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  return overlay;
}

export function showRelicOverlay(
  relicIds: string[],
  db: GameDatabase
): void {
  const overlay = el("div", "overlay");
  const panel = el("div", "panel deck-panel pop-in");
  panel.appendChild(el("h2", "panel-title", "遗物"));
  const list = el("div", "relic-list");
  for (const id of relicIds) {
    const relic = db.relics[id];
    if (!relic) continue;
    const row = el("div", "relic-row");
    row.append(
      el("span", "relic-art", relic.art ?? "💎"),
      el("span", "relic-name", relic.name),
      el("span", "relic-desc", relic.description)
    );
    attachTooltip(row, `${relic.name}：${relic.description}`);
    list.appendChild(row);
  }
  if (list.childElementCount === 0) {
    list.appendChild(el("p", "panel-text", "还没有遗物"));
  }
  panel.append(
    list,
    button("关闭", () => overlay.remove(), "btn btn-plain")
  );
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}
