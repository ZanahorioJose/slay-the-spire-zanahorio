import type { MapNodeType } from "../core/types";
import { Game } from "../core/game";
import { MAP_ROWS, COLS, describeNodeType, reachableNodes } from "../core/map";
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

export function renderMap(
  app: HTMLElement,
  game: Game,
  onExit: () => void,
  onQuit?: () => void
): void {
  const root = el("div", "map-view");
  const header = el("div", "map-header");
  header.append(
    el("span", "map-act", `第 ${game.run.act} 层`),
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
  root.append(header, grid);
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
    el("h2", "panel-title", `第 ${game.run.act} 层 · 地图`)
  );
  const { grid, cells, currentId, entryId } = buildMapGrid(game, false);
  panel.appendChild(grid);
  panel.appendChild(
    button("关闭", () => overlay.remove(), "btn btn-plain")
  );
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  drawPaths(grid, cells, currentId, entryId);
  return overlay;
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
  grid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;

  const reachable = reachableNodes(game.run.map, game.run.currentNodeId);
  const reachableIds = new Set(reachable.map((n) => n.id));
  const currentId = game.run.currentNodeId;
  const cells = new Map<string, HTMLElement>();
  let entryId: string | null = null;

  for (let row = MAP_ROWS - 1; row >= 0; row--) {
    const rowNodes = game.run.map.filter((n) => n.row === row);
    const cols = row === 0 || row === MAP_ROWS - 1 ? 1 : COLS;
    for (let col = 0; col < cols; col++) {
      const node = rowNodes.find((n) => n.col === col);
      if (!node) continue;
      const reachableNow = reachableIds.has(node.id);
      const isCurrent = node.id === currentId;
      const visited = !isCurrent && !reachableNow && row < MAP_ROWS - 1;
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
      grid.appendChild(cell);
    }
  }
  return { grid, cells, currentId, entryId };
}

// Draw the map's edge network as SVG curves. Edges leaving the current node
// are highlighted so the player can see exactly where they can go next.
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
      const mx = (from.x + to.x) / 2;
      const my = Math.min(from.y, to.y) - 22;
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute(
        "d",
        `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`
      );
      const active = nodeId === activeSourceId;
      path.setAttribute("class", `map-path${active ? " active" : ""}`);
      svg.appendChild(path);
    }
  }

  grid.appendChild(svg);
}
