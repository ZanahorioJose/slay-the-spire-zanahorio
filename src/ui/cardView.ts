import type {
  CardData,
  EnemyCombatState,
  StatusMap,
  StatusType,
} from "../core/types";
import { STATUS_DEFS } from "../core/types";
import { el } from "./dom";

const TYPE_COLORS: Record<CardData["type"], string> = {
  attack: "#b04a3a",
  skill: "#3a6fb0",
  power: "#8a4ab0",
};

const TYPE_NAMES: Record<CardData["type"], string> = {
  attack: "攻击",
  skill: "技能",
  power: "能力",
};

export function renderCard(
  card: CardData,
  opts: {
    onClick?: () => void;
    selected?: boolean;
    disabled?: boolean;
    small?: boolean;
  } = {}
): HTMLElement {
  const node = el(
    "div",
    `card ${card.type}${opts.selected ? " selected" : ""}${
      opts.disabled ? " disabled" : ""
    }${opts.small ? " small" : ""}`
  );
  const accent = card.color ?? TYPE_COLORS[card.type];
  node.style.setProperty("--card-accent", accent);

  const cost = el("div", "card-cost", String(card.cost));
  const name = el("div", "card-name", card.name);
  const type = el("div", "card-type", TYPE_NAMES[card.type]);
  const art = el("div", "card-art", card.art ?? "🃏");
  const desc = el("div", "card-desc", card.description);
  const tags = el("div", "card-tags");
  if (card.exhaust) tags.appendChild(el("span", "tag", "消耗"));
  if (card.ethereal) tags.appendChild(el("span", "tag", "虚无"));
  // Power cards are removed for the rest of the battle when played (they go
  // to a dedicated removed pile, separate from the exhaust pile).
  if (card.type === "power") {
    tags.appendChild(el("span", "tag", "打出后移除"));
  }

  node.append(cost, name, type, art, desc, tags);
  if (opts.onClick) {
    node.classList.add("clickable");
    node.addEventListener("click", opts.onClick);
  }
  return node;
}

export function renderStatusChips(statuses: StatusMap): HTMLElement | null {
  const entries = Object.entries(statuses).filter(
    ([, value]) => (value ?? 0) > 0
  ) as [StatusType, number][];
  if (entries.length === 0) return null;
  const wrap = el("div", "status-chips");
  for (const [id, value] of entries) {
    const def = STATUS_DEFS[id];
    if (!def) continue;
    const chip = el(
      "span",
      `status-chip ${def.positive ? "positive" : "negative"}`,
      `${def.name} ${value}`
    );
    chip.title = def.description;
    wrap.appendChild(chip);
  }
  return wrap;
}

export function renderBar(
  current: number,
  max: number,
  className = "hp-bar"
): HTMLElement {
  const wrap = el("div", `bar ${className}`);
  const ratio = Math.max(0, Math.min(1, current / max));
  const fill = el("div", "bar-fill");
  fill.style.width = `${ratio * 100}%`;
  wrap.appendChild(fill);
  return wrap;
}

export function renderEnemyCard(
  enemy: EnemyCombatState,
  intent: string,
  opts: { onClick?: () => void; highlight?: boolean } = {}
): HTMLElement {
  const node = el(
    "div",
    `enemy-card${opts.highlight ? " highlight" : ""}${
      opts.onClick ? " clickable" : ""
    }`
  );
  const top = el("div", "enemy-top");
  const art = el("div", "enemy-art", enemy.art ?? "👾");
  const name = el("div", "enemy-name", enemy.name);
  const hpRow = el("div", "enemy-hp-row");
  hpRow.append(
    renderBar(enemy.hp, enemy.maxHp),
    el("span", "hp-text", `${enemy.hp}/${enemy.maxHp}`)
  );
  const block = enemy.block > 0 ? el("div", "enemy-block", `🛡 ${enemy.block}`) : null;
  const chips = renderStatusChips(enemy.statuses);
  const intentRow = el("div", "enemy-intent", `意图：${intent}`);
  top.append(art, name);
  node.append(top, hpRow, block ?? el("div"), chips ?? el("div"), intentRow);
  if (opts.onClick) {
    node.addEventListener("click", opts.onClick);
  }
  return node;
}
