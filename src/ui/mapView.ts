import type { MapNodeType } from "../core/types";
import { Game } from "../core/game";
import {
  COLS,
  describeNodeType,
  reachableNodes,
  roomRowsForAct,
  totalRowsForAct,
  treasureRowForAct,
} from "../core/map";
import { el, button } from "./dom";
import { showCardListOverlay, showRelicOverlay } from "./deckViewer";
import { showConfirm } from "./modal";

const NODE_ART: Record<MapNodeType, string> = {
  ancient: "🧭",
  battle: "⚔️",
  elite: "💀",
  event: "❓",
  shop: "🛒",
  rest: "🔥",
  treasure: "🎁",
  boss: "👑",
};

// 图例：除「战斗」外的全部房间类型（悬停时高亮对应节点）。
const LEGEND_TYPES: MapNodeType[] = [
  "treasure",
  "event",
  "rest",
  "elite",
  "shop",
  "ancient",
  "boss",
];

export function renderMap(
  app: HTMLElement,
  game: Game,
  onExit: () => void,
  onQuit?: () => void
): void {
  const root = el("div", "map-view");
  const header = el("div", "map-header");
  const totalRows = totalRowsForAct(game.run.act);
  header.append(
    el("span", "map-act", `第 ${game.run.act} 幕 · 共 ${totalRows} 层`),
    el("span", "map-hp", `❤ ${game.run.player.hp}/${game.run.player.maxHp}`),
    el("span", "map-gold", `💰 ${game.run.player.gold}`),
    button("卡组", () => showCardListOverlay("我的卡组", game.run.player.deck, game.db), "btn btn-mini"),
    button("遗物", () => showRelicOverlay(game.run.player.relics, game.db), "btn btn-mini")
  );
  if (onQuit) {
    header.appendChild(
      button("退出", () => {
        showConfirm(
          "返回主菜单？进度已自动保存，可随时「继续上次」。",
          onQuit
        );
      }, "btn btn-mini quit-btn")
    );
  }

  const { grid, cells, currentId, entryId } = buildMapGrid(game, true, () =>
    onExit()
  );
  const body = el("div", "map-body");
  body.appendChild(grid);
  // 图例放在滚动容器（.map-body）之外，绝对定位固定，滚动地图时不动。
  root.append(header, body, buildLegend(cells));
  app.replaceChildren(root);
  // The grid must be in the document before measuring positions for paths,
  // otherwise every coordinate is 0 and the routes are invisible.
  drawPaths(grid, cells, currentId, entryId);
}

// Read-only map overlay (hotkey F) so the player can check the map from any
// screen. Returns the overlay element so callers can toggle it.
export function showMapOverlay(game: Game): HTMLElement {
  const overlay = el("div", "overlay");
  const panel = el("div", "panel map-overlay-panel");
  panel.appendChild(
    el("h2", "panel-title", `第 ${game.run.act} 幕 · 地图`)
  );
  const { grid, cells, currentId, entryId } = buildMapGrid(game, false);
  const body = el("div", "map-body");
  body.appendChild(grid);
  panel.append(
    body,
    button("关闭", () => overlay.remove(), "btn btn-plain"),
    buildLegend(cells)
  );
  panel.appendChild(
    button("关闭", () => overlay.remove(), "btn btn-plain")
  );
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  drawPaths(grid, cells, currentId, entryId);
  return overlay;
}

// 悬停图例项：高亮地图上对应类型的节点，其余节点临时变暗。
function buildLegend(cells: Map<string, HTMLElement>): HTMLElement {
  const legend = el("div", "map-legend");
  const applyFilter = (type: MapNodeType | null): void => {
    for (const cell of cells.values()) {
      const match = type !== null && cell.classList.contains(type);
      cell.classList.toggle("legend-dim", type !== null && !match);
      cell.classList.toggle("legend-match", match);
    }
  };
  for (const type of LEGEND_TYPES) {
    const item = el("div", `map-legend-item ${type}`);
    item.append(
      el("span", "map-legend-icon", NODE_ART[type]),
      el("span", "map-legend-name", describeNodeType(type))
    );
    item.addEventListener("mouseenter", () => applyFilter(type));
    item.addEventListener("mouseleave", () => applyFilter(null));
    legend.appendChild(item);
  }
  return legend;
}

function buildMapGrid(
  game: Game,
  interactive: boolean,
  onEnter?: () => void
): {
  grid: HTMLElement;
  cells: Map<string, HTMLElement>;
  currentId: string | null;
  entryId: string | null;
} {
  const grid = el("div", "map-grid");
  const totalRows = totalRowsForAct(game.run.act);
  const roomRows = roomRowsForAct(game.run.act);
  const treasureRow = treasureRowForAct(game.run.act);
  const reachable = reachableNodes(game.run.map, game.run.currentNodeId);
  const reachableIds = new Set(reachable.map((n) => n.id));
  const visitedIds = new Set(game.run.visitedNodes ?? []);
  const currentId = game.run.currentNodeId;
  const cells = new Map<string, HTMLElement>();
  let entryId: string | null = null;

  for (let row = totalRows - 1; row >= 0; row--) {
    const rowNodes = game.run.map
      .filter((n) => n.row === row)
      .sort((a, b) => a.col - b.col);
    const rowEl = el("div", "map-row");

    // 层标签：每层固定成一行，先古/宝箱/篝火层额外高亮。
    const labelText =
      row === 0
        ? "先古"
        : row === totalRows - 1
          ? "首领"
          : `第 ${row + 1} 层`;
    const label = el("div", "map-floor-label", labelText);
    if (row === 1) label.classList.add("is-battle");
    if (row === treasureRow) label.classList.add("is-treasure");
    if (row === roomRows) label.classList.add("is-rest");
    rowEl.appendChild(label);

    // 行内容器：房间按各自的 x（行内水平位置）自由摆放，列不严格对齐。
    const nodesEl = el("div", "map-nodes");
    for (let col = 0; col < COLS; col++) {
      const node = rowNodes.find((n) => n.col === col);
      if (!node) continue;
      const reachableNow = reachableIds.has(node.id);
      const isCurrent = node.id === currentId;
      const visited = visitedIds.has(node.id) && !isCurrent;
      const cell = el(
        "div",
        `map-node ${node.type}${reachableNow ? " reachable" : ""}${
          isCurrent ? " current" : ""
        }${visited ? " visited" : ""}`
      );
      cell.append(
        el("div", "map-node-art", NODE_ART[node.type]),
        el("div", "map-node-type", describeNodeType(node.type))
      );
      // 旧存档没有 x 字段时按列均分兜底，避免同层房间叠在一起。
      const x = node.x ?? (node.col + 0.5) / COLS;
      cell.style.left = `${x * 100}%`;
      cell.dataset.next = node.next.join(",");
      if (interactive && reachableNow) {
        cell.classList.add("clickable");
        cell.addEventListener("click", () => {
          game.enterNode(node);
          onEnter?.();
        });
      }
      if (row === 0) entryId = node.id;
      cells.set(node.id, cell);
      nodesEl.appendChild(cell);
    }
    rowEl.appendChild(nodesEl);
    grid.appendChild(rowEl);
  }
  return { grid, cells, currentId, entryId };
}

// Draw the map's edge network as SVG curves. Edges leaving the current node
// are highlighted so the player can see exactly where they can go next.
// 用垂直 S 曲线（起点竖直向上、终点竖直向上），配合生成器的单调约束，
// 同层成组、层间连线不会交叉。
function drawPaths(
  grid: HTMLElement,
  cells: Map<string, HTMLElement>,
  currentId: string | null,
  entryId: string | null
): void {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "map-paths");

  const gridRect = grid.getBoundingClientRect();
  const center = (id: string): { x: number; y: number } | null => {
    const cell = cells.get(id);
    if (!cell) return null;
    const rect = cell.getBoundingClientRect();
    return {
      x: rect.left - gridRect.left + rect.width / 2,
      y: rect.top - gridRect.top + rect.height / 2,
    };
  };

  const activeSourceId = currentId ?? entryId;
  for (const [nodeId, cell] of cells) {
    const nextIds = cell.dataset.next?.split(",") ?? [];
    for (const nextId of nextIds) {
      const from = center(nodeId);
      const to = center(nextId);
      if (!from || !to) continue;
      // 每条边在不同高度完成水平过渡（稳定伪随机），让相邻线路分开，
      // 同时端点顺序单调保证不交叉。
      const k = 0.25 + (stableHash(`${nodeId}>${nextId}`) % 1000) / 2000;
      const midY = from.y + k * (to.y - from.y);
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute(
        "d",
        `M ${from.x} ${from.y} C ${from.x} ${midY} ${to.x} ${midY} ${to.x} ${to.y}`
      );
      const active = nodeId === activeSourceId;
      path.setAttribute("class", `map-path${active ? " active" : ""}`);
      svg.appendChild(path);
    }
  }

  grid.appendChild(svg);
}

// 稳定字符串哈希：同一对节点间的连线在多次重绘时保持同一弧度。
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
