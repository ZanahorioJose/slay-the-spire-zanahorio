import type {
  CardData,
  EnemyCombatState,
  StatusMap,
  StatusType,
} from "../core/types";
import { STATUS_DEFS, STATUS_ICONS } from "../core/types";
import { el } from "./dom";
import { attachTooltip } from "./tooltip";

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

const TYPE_ICONS: Record<CardData["type"], string> = {
  attack: "⚔",
  skill: "🛡",
  power: "✦",
};

// 画窗形状（v4：攻击=圆角矩形、技能=五边形、能力=椭圆；异画卡不受裁剪）。
const SHAPE_CLASS: Record<CardData["type"], string> = {
  attack: "shape-rect",
  skill: "shape-pentagon",
  power: "shape-ellipse",
};

// art 是图片路径/URL 时渲染 <img>，否则按 emoji/文本显示。
function isImageArt(art: string): boolean {
  return (
    /^https?:\/\//i.test(art) ||
    /^data:image\//i.test(art) ||
    /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(art) ||
    /^(\.\/|\.\.\/|\/|assets\/)/.test(art)
  );
}

export function renderCard(
  card: CardData,
  opts: {
    onClick?: () => void;
    selected?: boolean;
    disabled?: boolean;
    small?: boolean;
    large?: boolean;
    preview?: boolean;
  } = {}
): HTMLElement {
  const node = el(
    "div",
    `card ${card.type} ${SHAPE_CLASS[card.type]} rarity-${card.rarity}${
      card.material ? ` mat-${card.material}` : ""
    }${
      opts.selected ? " selected" : ""
    }${
      opts.disabled ? " disabled" : ""
    }${opts.small ? " small" : ""}${opts.large ? " large" : ""}${
      opts.preview ? " preview" : ""
    }`
  );
  const accent = card.color ?? TYPE_COLORS[card.type];
  node.style.setProperty("--card-accent", accent);
  node.style.setProperty("--type-color", accent);

  // ---- v4 卡面结构（docs/art-card-layout_v4.html，--k 缩放） ----
  const face = el("div", "card-face");
  const cost = el("div", "card-cost", String(card.cost));
  const typeGem = el("div", "card-type-gem");
  typeGem.appendChild(el("span", "card-type-icon", TYPE_ICONS[card.type]));
  const name = el("div", "card-name", card.name);

  const artFrame = el("div", "card-art-frame");
  const artWindow = el("div", "card-art-window");
  if (card.art && isImageArt(card.art)) {
    const img = document.createElement("img");
    img.src = card.art;
    img.alt = card.name;
    img.draggable = false;
    img.style.setProperty("--art-scale", String(card.artScale ?? 1));
    img.style.setProperty("--art-x", `${card.artX ?? 0}px`);
    img.style.setProperty("--art-y", `${card.artY ?? 0}px`);
    artWindow.appendChild(img);
  } else {
    artWindow.textContent = card.art ?? "🃏";
    artWindow.classList.add("text-art");
  }
  artFrame.appendChild(artWindow);

  const rarityGem = el("div", "card-rarity-gem");
  const desc = el("div", "card-desc");
  desc.appendChild(el("div", "card-desc-text", card.description));
  const infoStrip = el("div", "card-info-strip");
  infoStrip.appendChild(el("span", "card-info-id", card.number ?? ""));
  const infoType = el("span", "card-info-type");
  infoType.appendChild(el("span", "card-type-name", TYPE_NAMES[card.type]));
  infoType.appendChild(el("span", "card-info-rarity"));
  infoStrip.appendChild(infoType);

  const tags = el("div", "card-tags");
  if (card.exhaust) {
    const tag = el("span", "tag", "消耗");
    attachTooltip(tag, "打出后进入消耗堆，本场战斗中可被消耗类效果互动");
    tags.appendChild(tag);
  }
  if (card.ethereal) {
    const tag = el("span", "tag", "虚无");
    attachTooltip(tag, "抽到这张牌的回合结束时，它会自行消耗");
    tags.appendChild(tag);
  }
  // Power cards are removed for the rest of the battle when played (they go
  // to a dedicated removed pile, separate from the exhaust pile).
  if (card.type === "power") {
    const tag = el("span", "tag", "打出后移除");
    attachTooltip(tag, "能力牌打出后进入移除池：本场战斗暂时移出，下一场照常可用");
    tags.appendChild(tag);
  }
  if (card.sly && card.sly.length > 0) {
    const tag = el("span", "tag", "奇巧");
    attachTooltip(tag, "奇巧（Sly）：这张牌被弃置时触发其效果");
    tags.appendChild(tag);
  }

  // 星辰/灵魂消耗图形化：右上角资源徽标（替代纯文字）。
  if (card.starsCost || card.soulsCost) {
    const badges = el("div", "card-resource-badges");
    if (card.starsCost) {
      const badge = el("span", "card-resource-badge", `⭐ ${card.starsCost}`);
      attachTooltip(badge, `打出需要 ${card.starsCost} 点星辰`);
      badges.appendChild(badge);
    }
    if (card.soulsCost) {
      const badge = el("span", "card-resource-badge", `👻 ${card.soulsCost}`);
      attachTooltip(badge, `打出需要 ${card.soulsCost} 点灵魂`);
      badges.appendChild(badge);
    }
    node.appendChild(badges);
  }

  if (card.id.endsWith("+")) {
    node.appendChild(el("div", "card-up-badge", "+"));
  }

  // 光影层：镜面高光跟随鼠标（--lx/--ly）；扫光层仅闪卡材质显示。
  const gloss = el("div", "card-gloss");
  const sheen = el("div", "card-sheen");
  node.append(face, gloss, sheen, cost, typeGem, name, artFrame, rarityGem, desc, infoStrip, tags);
  // 悬停 3D 倾斜：鼠标位置映射为 rotateX/rotateY，并让镜面高光
  // （--lx/--ly）跟随鼠标，与 docs/art-card-material.html 的演示一致。
  node.addEventListener("mousemove", (e) => {
    const rect = node.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    node.style.setProperty("--tilt-x", `${((0.5 - py) * 18).toFixed(2)}deg`);
    node.style.setProperty("--tilt-y", `${((px - 0.5) * 24).toFixed(2)}deg`);
    node.style.setProperty("--lx", `${(px * 100).toFixed(1)}%`);
    node.style.setProperty("--ly", `${(py * 100).toFixed(1)}%`);
  });
  node.addEventListener("mouseleave", () => {
    node.style.setProperty("--tilt-x", "0deg");
    node.style.setProperty("--tilt-y", "0deg");
  });
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
      `${STATUS_ICONS[id]} ${value}`
    );
    chip.title = def.description;
    attachTooltip(chip, `${def.name}：${def.description}`);
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
  const art = el(
    "div",
    `enemy-art enemy-anim-${enemy.anim ?? "idle"}`,
    enemy.art ?? "👾"
  );
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
