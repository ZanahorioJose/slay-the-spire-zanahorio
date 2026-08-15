import { pickOne, randomInt } from "./rng";
import type { MapNode, MapNodeType } from "./types";

export const MAP_ROWS = 7; // row 0 = entry, row 6 = boss
export const COLS = 3;

function nodeId(row: number, col: number): string {
  return `r${row}c${col}`;
}

function rollType(row: number): MapNodeType {
  if (row === 1) {
    return Math.random() < 0.65 ? "battle" : "event";
  }
  if (row === 5) {
    const roll = Math.random();
    if (roll < 0.35) return "elite";
    if (roll < 0.55) return "battle";
    if (roll < 0.7) return "rest";
    if (roll < 0.85) return "event";
    return "treasure";
  }
  const roll = Math.random();
  if (roll < 0.4) return "battle";
  if (roll < 0.58) return "event";
  if (roll < 0.68) return "rest";
  if (roll < 0.76) return "shop";
  if (roll < 0.86) return "treasure";
  return "elite";
}

export function generateMap(_act: number): MapNode[] {
  const nodes: MapNode[] = [];
  const grid: (MapNode | null)[][] = [];

  for (let row = 0; row < MAP_ROWS; row++) {
    const rowNodes: (MapNode | null)[] = [];
    const count = row === 0 || row === MAP_ROWS - 1 ? 1 : COLS;
    for (let col = 0; col < count; col++) {
      const type: MapNodeType =
        row === 0
          ? "ancient"
          : row === MAP_ROWS - 1
            ? "boss"
            : rollType(row);
      const node: MapNode = {
        id: nodeId(row, col),
        row,
        col,
        type,
        next: [],
      };
      nodes.push(node);
      rowNodes.push(node);
    }
    grid.push(rowNodes);
  }

  // Entry connects to every node in row 1.
  for (const node of grid[1]) {
    grid[0][0]!.next.push(node!.id);
  }

  // Rows 1..4: guarantee every node in the next row has at least one incoming
  // edge, then add one random extra edge per node.
  for (let row = 1; row <= 4; row++) {
    const upper = grid[row];
    const lower = grid[row + 1];
    for (const target of lower) {
      const source = pickOne(upper);
      source!.next.push(target!.id);
    }
    for (const source of upper) {
      const target = pickOne(lower);
      if (!source!.next.includes(target!.id)) {
        source!.next.push(target!.id);
      }
    }
  }

  // Row 5 all connects to the boss.
  for (const node of grid[5]) {
    node!.next.push(grid[6][0]!.id);
  }

  // Guarantee at least two elites on rows 2..5.
  const eliteCount = nodes.filter((n) => n.type === "elite").length;
  if (eliteCount < 2) {
    const candidates = nodes.filter(
      (n) => n.row >= 2 && n.row <= 5 && n.type !== "elite"
    );
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const needed = 2 - eliteCount;
    for (let i = 0; i < Math.min(needed, shuffled.length); i++) {
      shuffled[i]!.type = "elite";
    }
  }

  return nodes;
}

export function getNode(map: MapNode[], id: string): MapNode | undefined {
  return map.find((n) => n.id === id);
}

export function reachableNodes(map: MapNode[], currentId: string | null): MapNode[] {
  if (currentId === null) {
    return map.filter((n) => n.row === 0);
  }
  const current = getNode(map, currentId);
  if (!current) return [];
  return current.next
    .map((id) => getNode(map, id))
    .filter((n): n is MapNode => Boolean(n));
}

export function describeNodeType(type: MapNodeType): string {
  switch (type) {
    case "ancient":
      return "先古";
    case "battle":
      return "战斗";
    case "elite":
      return "精英";
    case "event":
      return "事件";
    case "shop":
      return "商店";
    case "rest":
      return "篝火";
    case "treasure":
      return "宝箱";
    case "boss":
      return "首领";
  }
}

export function randomActBoss(act: number): string {
  if (act === 1) {
    return pickOne(["ancient_guardian", "vantom", "ceremonial_beast"]);
  }
  if (act === 2) {
    return pickOne(["dragon", "knowledge_demon", "kaiser_crab"]);
  }
  return pickOne(["queen", "subject"]);
}

export function randomElite(): string {
  return pickOne(["big_slime", "knight"]);
}

export function randomNormalEnemies(count: number): string[] {
  const pool = ["slime", "fungus", "wolf", "bandit", "goblin"];
  const result: string[] = [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (let i = 0; i < count && i < shuffled.length; i++) {
    result.push(shuffled[i]);
  }
  return result;
}

export function rollGold(type: MapNodeType): number {
  switch (type) {
    case "elite":
      return randomInt(25, 35);
    case "boss":
      return randomInt(60, 100);
    default:
      return randomInt(10, 20);
  }
}
