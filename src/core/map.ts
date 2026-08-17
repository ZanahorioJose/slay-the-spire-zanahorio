import { pickOne, randomInt } from "./rng";
import type { MapNode, MapNodeType } from "./types";

// 每层（行）固定 3 个房间，先古 / Boss 层各 1 个。
export const COLS = 3;

// 尖塔 2 阶段楼层结构：每幕「房间层」数量固定
// （第 1 幕 15、第 2 幕 14、第 3 幕 13），再加上首尾的先古与 Boss 层。
export const ROOM_ROWS_BY_ACT: Record<number, number> = { 1: 15, 2: 14, 3: 13 };

// 某幕的房间层数（超出 3 幕时按第 3 幕处理）。
export function roomRowsForAct(act: number): number {
    return ROOM_ROWS_BY_ACT[act] ?? ROOM_ROWS_BY_ACT[3]!;
}

// 某幕的总层数 = 先古 + 房间层 + Boss。
export function totalRowsForAct(act: number): number {
    return roomRowsForAct(act) + 2;
}

// 每幕固定的宝箱层（房间层序号，从 1 开始数）。
// 尖塔 2 中宝箱位于阶段中部：第 1 幕第 10 层（= 第 9 个房间层）、
// 第 2 幕第 26 层（= 第 8 个）、第 3 幕第 41 层（= 第 7 个）。
export function treasureRowForAct(act: number): number {
    return roomRowsForAct(act) - 6;
}

function nodeId(row: number, col: number): string {
    return `r${row}c${col}`;
}

// 普通房间层：只出现战斗 / 事件（精英、商店、额外篝火由固定行集合决定）。
function rollType(): MapNodeType {
    return Math.random() < 0.55 ? "battle" : "event";
}

// 从候选行中随机抽取 count 个互不相同的行号。
function pickDistinctRows(count: number, candidates: number[]): number[] {
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

// 连接上下两层：保证下层每个节点至少一条入边、上层每个节点至少一条出边，
// 且连线单调不交叉（源从左到右，目标列不递减；只允许与相邻列相连）。
function connectRows(upper: MapNode[], lower: MapNode[]): void {
    // 单源（先古入口）扇出 / 单汇（Boss）扇入，天然不交叉。
    if (upper.length === 1) {
        for (const target of lower) upper[0]!.next.push(target!.id);
        return;
    }
    if (lower.length === 1) {
        for (const source of upper) source!.next.push(lower[0]!.id);
        return;
    }

    const incoming = lower.map(() => 0);
    let lastRight = 0; // 已使用的最右目标列（保持目标列单调 → 不交叉）
    const addEdge = (i: number, j: number): void => {
        if (i < 0 || j < 0 || i >= upper.length || j >= lower.length) return;
        if (upper[i]!.next.includes(lower[j]!.id)) return;
        upper[i]!.next.push(lower[j]!.id);
        incoming[j]! += 1;
        lastRight = Math.max(lastRight, j);
    };

    for (let i = 0; i < upper.length; i++) {
        // 保证下层节点 i 至少有一条入边（直下连接）。
        if (i < lower.length && incoming[i] === 0) addEdge(i, i);
        // 可选额外边：只连相邻列，且目标列不低于已使用的最右列。
        if (Math.random() < 0.55) {
            const lo = Math.max(lastRight, i - 1);
            const hi = Math.min(lower.length - 1, i + 1);
            const candidates: number[] = [];
            for (let j = lo; j <= hi; j++) {
                if (!upper[i]!.next.includes(lower[j]!.id)) candidates.push(j);
            }
            if (candidates.length > 0) addEdge(i, pickOne(candidates));
        }
    }
    // 收尾：上层每个节点至少一条出边，避免死路。
    for (let i = 0; i < upper.length; i++) {
        if (upper[i]!.next.length === 0) addEdge(i, lower.length - 1);
    }
}

export function generateMap(act: number): MapNode[] {
    const roomRows = roomRowsForAct(act);
    const totalRows = totalRowsForAct(act);
    const treasureRow = treasureRowForAct(act);
    const preBossRow = roomRows; // 最后一个房间层（Boss 前一层）

    // 精英：每幕 4 个。尖塔 2 规则「前 5 层不出现精英/篝火」，
    // 且 v0.101 起第 6 层也不再刷精英，故精英层从第 7 个房间层开始。
    const eliteRows = new Set(
        pickDistinctRows(
            4,
            rangeRows(roomRows).filter(
                (row) => row >= 7 && row !== treasureRow && row !== preBossRow
            )
        )
    );

    // 商店：每幕 3 个。
    const shopRows = new Set(
        pickDistinctRows(
            3,
            rangeRows(roomRows).filter(
                (row) =>
                    row >= 2 &&
                    row !== treasureRow &&
                    row !== preBossRow &&
                    !eliteRows.has(row)
            )
        )
    );

    // 额外篝火：Boss 前一层整层固定篝火，其余篝火只出现在第 6 个房间层之后。
    const extraRestRows = new Set<number>();
    for (let row = 6; row < roomRows; row++) {
        if (row === treasureRow || eliteRows.has(row) || shopRows.has(row)) {
            continue;
        }
        if (Math.random() < 0.22) extraRestRows.add(row);
    }

    // 特殊房间行（精英 / 商店 / 额外篝火各占该行一个节点，可绕行）。
    const special = new Map<number, { type: MapNodeType; col: number }>();
    for (const row of eliteRows) special.set(row, { type: "elite", col: randomInt(0, COLS - 1) });
    for (const row of shopRows) special.set(row, { type: "shop", col: randomInt(0, COLS - 1) });
    for (const row of extraRestRows) special.set(row, { type: "rest", col: randomInt(0, COLS - 1) });

    const nodes: MapNode[] = [];
    const grid: MapNode[][] = [];
    for (let row = 0; row < totalRows; row++) {
        const isEntry = row === 0;
        const isBoss = row === totalRows - 1;
        const count = isEntry || isBoss ? 1 : COLS;
        const rowNodes: MapNode[] = [];
        for (let col = 0; col < count; col++) {
            const type: MapNodeType =
                isEntry
                    ? "ancient"
                    : isBoss
                      ? "boss"
                      : row === 1
                        ? "battle"
                        : row === treasureRow
                          ? "treasure"
                          : row === preBossRow
                            ? "rest"
                            : rollSpecialOrNormal(special, row, col);
            const node: MapNode = {
                id: nodeId(row, col),
                row,
                col,
                type,
                next: [],
                x: isEntry || isBoss ? 0.5 : jitteredX(col),
            };
            nodes.push(node);
            rowNodes.push(node);
        }
        grid.push(rowNodes);
    }

    // 相邻层之间建立连接：同层房间绝不互相连接（尖塔 2 规则）。
    for (let row = 0; row < totalRows - 1; row++) {
        connectRows(grid[row]!, grid[row + 1]!);
    }

    return nodes;
}

function rangeRows(roomRows: number): number[] {
    const rows: number[] = [];
    for (let row = 1; row <= roomRows; row++) rows.push(row);
    return rows;
}

// 特殊行只在该行指定的列上是精英/商店/篝火，其余节点按普通规则生成。
function rollSpecialOrNormal(
    special: Map<number, { type: MapNodeType; col: number }>,
    row: number,
    col: number
): MapNodeType {
    const entry = special.get(row);
    if (entry && entry.col === col) return entry.type;
    return rollType();
}

// 行内水平位置：房间不再严格三列对齐，而是按列从左到右的顺序
// 在各自区间内随机错位（区间互不重叠 → 渲染后同层节点不重叠、
// 且跨层连线保持单调不会交叉）。
function jitteredX(col: number): number {
    const ranges: Array<[number, number]> = [
        [0.1, 0.22],
        [0.42, 0.58],
        [0.78, 0.9],
    ];
    const [lo, hi] = ranges[col] ?? [0.5, 0.5];
    return lo + Math.random() * (hi - lo);
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
