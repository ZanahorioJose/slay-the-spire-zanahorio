import { Game, inPool } from "../core/game";
import type { CardData, PotionData, RelicData } from "../core/types";
import { clear, el, button } from "./dom";
import { renderCard } from "./cardView";
import { shuffle } from "../core/rng";
import { showConfirm } from "./modal";
import { attachTooltip } from "./tooltip";

interface ShopItem {
  type: "card" | "relic" | "potion" | "remove" | "empty";
  price: number;
  card?: CardData;
  relic?: RelicData;
  potion?: PotionData;
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
      } else if (item.type === "potion" && item.potion) {
        info.append(
          el("div", "shop-relic-art", item.potion.art ?? "🧪"),
          el("div", "shop-item-name", item.potion.name),
          el("div", "shop-item-desc", item.potion.description)
        );
      } else if (item.type === "remove") {
        info.append(
          el("div", "shop-relic-art", "🗑️"),
          el("div", "shop-item-name", "移除卡牌"),
          el("div", "shop-item-desc", "从你的牌组中移除一张牌")
        );
      }
      const tooltipText =
        item.type === "card" && item.card
          ? `${item.card.name}：${item.card.description}`
          : item.type === "relic" && item.relic
            ? `${item.relic.name}：${item.relic.description}`
            : item.type === "potion" && item.potion
              ? `${item.potion.name}：${item.potion.description}`
              : item.type === "remove"
                ? "从牌组中移除一张牌（按实例选择）"
                : "";
      attachTooltip(info, tooltipText);
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
          } else if (item.type === "potion" && item.potion) {
            game.addPotion(item.potion.id);
            item.type = "empty";
            item.potion = undefined;
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
  const characterId = game.run.player.character;
  const shopCards = Object.values(game.db.cards).filter(
    (c) =>
      c.rarity !== "starter" &&
      (!c.character || c.character === characterId) &&
      inPool(c, "shop")
  );
  // If every card is restricted to other pools, fall back to all non-starter
  // cards so the shop never ends up empty.
  const cardPool =
    shopCards.length > 0
      ? shopCards
      : Object.values(game.db.cards).filter(
          (c) =>
            c.rarity !== "starter" &&
            (!c.character || c.character === characterId)
        );
  const cards = shuffle(cardPool).slice(0, 3);

  const shopRelics = Object.values(game.db.relics).filter((r) =>
    inPool(r, "shop")
  );
  const relicPool =
    shopRelics.length > 0
      ? shopRelics
      : Object.values(game.db.relics);
  const relics = shuffle(relicPool).slice(0, 2);
  const potions = shuffle(Object.values(game.db.potions)).slice(0, 1);
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
    ...potions.map((potion) => ({
      type: "potion" as const,
      price: 120,
      potion,
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
          showConfirm(
            `确定移除第 ${index + 1} 张「${card.name}」？移除后无法找回。`,
            () => {
              game.removeCardAt(index);
              overlay.remove();
              onDone();
            }
          );
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
