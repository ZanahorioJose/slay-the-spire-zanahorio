import { Game, inPool } from "../core/game";
import type { CardData, RelicData } from "../core/types";
import { clear, el, button } from "./dom";
import { renderCard } from "./cardView";
import { shuffle } from "../core/rng";

interface ShopItem {
  type: "card" | "relic" | "remove" | "empty";
  price: number;
  card?: CardData;
  relic?: RelicData;
}

export function renderShop(
  app: HTMLElement,
  game: Game,
  onExit: () => void
): void {
  const items = buildShopItems(game);
  const root = el("div", "shop-view");
  const title = el("h2", "shop-title", "🗡 黑市商人");
  const gold = el(
    "div",
    "shop-gold",
    `你的金币：${game.run.player.gold}`
  );
  const rows = el("div", "shop-rows");

  const refresh = (): void => {
    clear(rows);
    for (const item of items) {
      if (item.type === "empty") continue;
      const row = el("div", "shop-row");
      const info = el("div", "shop-item-info");
      if (item.type === "card" && item.card) {
        info.appendChild(renderCard(item.card, { small: true }));
        info.appendChild(el("div", "shop-item-name", item.card.name));
      } else if (item.type === "relic" && item.relic) {
        info.append(
          el("div", "shop-relic-art", item.relic.art ?? "💎"),
          el("div", "shop-item-name", item.relic.name),
          el("div", "shop-item-desc", item.relic.description)
        );
      } else if (item.type === "remove") {
        info.append(
          el("div", "shop-relic-art", "🗑️"),
          el("div", "shop-item-name", "移除卡牌"),
          el("div", "shop-item-desc", "从你的牌组中移除一张牌")
        );
      }
      const buyBtn = button(
        `${item.price} 金币`,
        () => {
          if (game.run.player.gold < item.price) return;
          game.run.player.gold -= item.price;
          if (item.type === "card" && item.card) {
            game.addCardToDeck(item.card.id);
            item.type = "remove";
            item.price = 75;
            item.card = undefined;
            item.relic = undefined;
          } else if (item.type === "relic" && item.relic) {
            game.addRelic(item.relic.id);
            item.type = "remove";
            item.price = 75;
            item.card = undefined;
            item.relic = undefined;
          } else if (item.type === "remove") {
            showRemoveModal(game, () => {
              item.type = "empty";
              refresh();
            });
          }
          refresh();
        },
        `btn buy-btn${game.run.player.gold < item.price ? " disabled" : ""}`
      );
      row.append(info, buyBtn);
      rows.appendChild(row);
    }
    gold.textContent = `你的金币：${game.run.player.gold}`;
  };

  const leave = button("离开商店", () => {
    game.run.status = "map";
    onExit();
  }, "btn btn-plain");

  root.append(title, gold, rows, leave);
  app.replaceChildren(root);
  refresh();
}

function buildShopItems(game: Game): ShopItem[] {
  const shopCards = Object.values(game.db.cards).filter(
    (c) => c.rarity !== "starter" && inPool(c, "shop")
  );
  // If every card is restricted to other pools, fall back to all non-starter
  // cards so the shop never ends up empty.
  const cardPool =
    shopCards.length > 0
      ? shopCards
      : Object.values(game.db.cards).filter((c) => c.rarity !== "starter");
  const cards = shuffle(cardPool).slice(0, 3);

  const shopRelics = Object.values(game.db.relics).filter((r) =>
    inPool(r, "shop")
  );
  const relicPool =
    shopRelics.length > 0
      ? shopRelics
      : Object.values(game.db.relics);
  const relics = shuffle(relicPool).slice(0, 2);
  return [
    ...cards.map((card) => ({
      type: "card" as const,
      price: 50 + card.rarity.length * 8,
      card,
    })),
    ...relics.map((relic) => ({
      type: "relic" as const,
      price: 150,
      relic,
    })),
    { type: "remove" as const, price: 75 },
  ];
}

function showRemoveModal(game: Game, onDone: () => void): void {
  const overlay = el("div", "overlay");
  const panel = el("div", "panel");
  panel.appendChild(el("h2", "panel-title", "选择要移除的牌"));
  const grid = el("div", "deck-grid");
  game.run.player.deck.forEach((cardId, index) => {
    const card = game.db.cards[cardId];
    if (!card) return;
    grid.appendChild(
      renderCard(card, {
        small: true,
        onClick: () => {
          if (
            !window.confirm(
              `确定移除第 ${index + 1} 张「${card.name}」？移除后无法找回。`
            )
          ) {
            return;
          }
          game.removeCardAt(index);
          overlay.remove();
          onDone();
        },
      })
    );
  });
  if (grid.childElementCount === 0) {
    grid.appendChild(el("p", "panel-text", "牌组是空的。"));
  }
  panel.append(
    grid,
    button("取消", () => overlay.remove(), "btn btn-plain")
  );
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}
