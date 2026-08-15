// 卡牌全屏预览：按空格打开（悬停优先、选中兜底）。
// 左侧大卡浮空（磨砂玻璃背景），右侧无框关键词定义。
import type { CardData } from "../core/types";
import { ORB_DEFS, STATUS_DEFS, STATUS_ICONS } from "../core/types";
import { clear, el, button } from "./dom";
import { renderCard } from "./cardView";

interface KeywordDef {
  name: string;
  desc: string;
}

// 机制关键词定义（状态类关键词直接复用 STATUS_DEFS）。
const KEYWORD_DEFS: Record<string, KeywordDef> = {
  exhaust: {
    name: "消耗",
    desc: "打出后进入消耗堆，本场战斗中可被消耗类效果互动（如从消耗堆取回）。",
  },
  ethereal: {
    name: "虚无",
    desc: "抽到这张牌的回合结束时，它会自行消耗。",
  },
  power: {
    name: "能力牌",
    desc: "打出后进入移除池：本场战斗暂时移出，下一场照常可用。",
  },
  sly: {
    name: "奇巧",
    desc: "这张牌被弃置时，触发其标注的效果。",
  },
  stars: {
    name: "星辰",
    desc: "储君的资源。带星辰费用的牌需要消耗星辰才能打出；部分牌与遗物会产出星辰。",
  },
  souls: {
    name: "灵魂",
    desc: "亡灵契约师的资源。带灵魂费用的牌需要消耗灵魂才能打出。",
  },
  orbs: {
    name: "宝珠",
    desc: "故障机器人的核心机制。最多 3 颗宝珠入槽，回合开始触发被动；「打出宝珠」可爆发最左侧宝珠。",
  },
  focus: {
    name: "集中",
    desc: "提升所有宝珠的伤害与格挡数值。",
  },
  summon: {
    name: "召唤",
    desc: "召唤骷髅护卫：回合开始攻击随机敌人，存活时替你挡刀。",
  },
  forge: {
    name: "锻造",
    desc: "升级手牌中随机数量的牌（本场战斗内生效）。",
  },
  countdown: {
    name: "延迟效果",
    desc: "若干回合后自动结算的效果，战斗面板会显示倒计时。",
  },
  discard: {
    name: "弃牌",
    desc: "将手牌置入弃牌堆；带奇巧的牌被弃置时会触发其效果。",
  },
  exhaustPile: {
    name: "消耗堆",
    desc: "被消耗的牌所在区域；部分效果可与之互动（如按消耗堆牌数增伤、从消耗堆取回）。",
  },
};

function collectCardKeywords(
  card: CardData
): { name: string; desc: string; icon: string }[] {
  const seen = new Set<string>();
  const out: { name: string; desc: string; icon: string }[] = [];
  const push = (id: string, icon = ""): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const def = KEYWORD_DEFS[id];
    if (def) out.push({ ...def, icon });
  };

  for (const effect of card.effects) {
    if (effect.op === "apply" || effect.op === "multiplyStatus") {
      const key = `s:${effect.status}`;
      if (!seen.has(key)) {
        seen.add(key);
        const def = STATUS_DEFS[effect.status];
        if (def) {
          out.push({
            name: def.name,
            desc: def.description,
            icon: STATUS_ICONS[effect.status],
          });
        }
      }
    } else if (effect.op === "channel") {
      push("orbs", ORB_DEFS[effect.orb].art);
    } else if (effect.op === "focus") {
      push("focus", "🧠");
    } else if (effect.op === "summon" || effect.op === "healSummon") {
      push("summon", "🦴");
    } else if (effect.op === "forge") {
      push("forge", "🔨");
    } else if (effect.op === "addCountdown") {
      push("countdown", "⏳");
    } else if (effect.op === "discard") {
      push("discard", "🃏");
    } else if (effect.op === "retrieveFromExhaust") {
      push("exhaustPile", "🗑️");
    }
  }
  if (card.type === "power") push("power", "✨");
  if (card.exhaust) push("exhaust");
  if (card.ethereal) push("ethereal");
  if (card.sly && card.sly.length > 0) push("sly", "🎭");
  if (card.starsCost) push("stars", "⭐");
  if (card.soulsCost) push("souls", "👻");
  return out;
}

// 打开预览，返回关闭函数。upgraded 为该卡的升级版（无则不可切换）。
export function showCardPreview(
  card: CardData,
  app: HTMLElement,
  upgraded?: CardData
): () => void {
  const overlay = el("div", "overlay preview-overlay");
  const panel = el("div", "card-preview pop-in");

  let current: CardData = card;
  const hasUpgrade = Boolean(upgraded);

  const cardWrap = el("div", "preview-card-wrap");
  const right = el("div", "preview-keywords");
  const toggleBtn = button(
    "",
    () => toggle(),
    "btn btn-mini preview-toggle-btn"
  );
  cardWrap.appendChild(toggleBtn);

  const render = (): void => {
    // 左侧大卡。
    const cardNode = cardWrap.querySelector(".card");
    if (cardNode) cardNode.remove();
    cardWrap.insertBefore(
      renderCard(current, { preview: true }),
      toggleBtn
    );
    toggleBtn.textContent = hasUpgrade
      ? current === card
        ? "查看升级版 ➜（Q）"
        : "返回基础版（Q）"
      : "";
    toggleBtn.style.display = hasUpgrade ? "" : "none";

    // 右侧关键词。
    clear(right);
    right.appendChild(el("h2", "preview-title", "关键词"));
    const keywords = collectCardKeywords(current);
    if (keywords.length === 0) {
      right.appendChild(
        el("p", "panel-text preview-empty", "这张牌没有特殊关键词。")
      );
    }
    for (const kw of keywords) {
      const row = el("div", "keyword-row");
      row.append(
        el("span", "keyword-icon", kw.icon),
        el("div", "keyword-body", [
          el("div", "keyword-name", kw.name),
          el("div", "keyword-desc", kw.desc),
        ])
      );
      right.appendChild(row);
    }
    // 趣闻。
    right.appendChild(el("h2", "preview-title", "趣闻"));
    const flavor = (current.flavor ?? "").trim();
    right.appendChild(
      el(
        "p",
        "panel-text preview-flavor" + (flavor ? "" : " preview-empty"),
        flavor || "这张牌还没有趣闻。"
      )
    );
  };

  const toggle = (): void => {
    if (!hasUpgrade || !upgraded) return;
    current = current === card ? upgraded : card;
    render();
  };

  panel.append(cardWrap, right);
  overlay.appendChild(panel);
  const keyHandler = (e: KeyboardEvent): void => {
    if (e.key.toLowerCase() === "q") {
      e.preventDefault();
      toggle();
    }
  };
  document.addEventListener("keydown", keyHandler);
  const close = (): void => {
    document.removeEventListener("keydown", keyHandler);
    overlay.remove();
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  app.appendChild(overlay);
  render();
  return close;
}
