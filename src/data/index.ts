import type {
  AncientData,
  CardData,
  EnemyData,
  EventData,
  GameDatabase,
  RelicData,
  RunSettings,
} from "../core/types";
import { BASE_CARDS } from "./cards";
import { BASE_ENEMIES } from "./enemies";
import { BASE_RELICS } from "./relics";
import { BASE_EVENTS } from "./events";
import { BASE_ANCIENTS } from "./ancients";
import {
  getCachedFormalData,
  loadDebugData,
  loadFormalData,
  mergeCustomData,
} from "./store";

export interface CustomData {
  cards?: Record<string, CardData | null>;
  enemies?: Record<string, EnemyData | null>;
  relics?: Record<string, RelicData | null>;
  events?: Record<string, EventData | null>;
  ancients?: Record<string, AncientData | null>;
  settings?: RunSettings;
}

function toRecord<T extends { id: string }>(items: T[]): Record<string, T> {
  const record: Record<string, T> = {};
  for (const item of items) {
    record[item.id] = item;
  }
  return record;
}

function mergeMap<T>(
  base: Record<string, T>,
  custom: Record<string, T | null> | undefined
): Record<string, T> {
  const result: Record<string, T> = { ...base };
  for (const [id, value] of Object.entries(custom ?? {})) {
    if (value === null) {
      delete result[id];
    } else {
      result[id] = value;
    }
  }
  return result;
}

// Upgraded cards (`<id>+`) are ALWAYS derived from their base card at database
// build time; they are never stored as data. Only the `upgrade` override
// fields (cost / description / effects / exhaust) differ, so editing a base
// card's numbers automatically carries over to its upgraded form. Legacy
// explicit `<id>+` entries from the old snapshot format are dropped here.
function expandUpgradedCards(cards: Record<string, CardData>): void {
  for (const card of Object.values(cards)) {
    if (!card.upgrade) continue;
    const upgradedId = `${card.id}+`;
    const upgraded: CardData = {
      ...card,
      ...card.upgrade,
      id: upgradedId,
      name: `${card.name}+`,
      upgrade: undefined,
    };
    cards[upgraded.id] = upgraded;
  }
}

export function buildDatabase(custom?: CustomData): GameDatabase {
  const cards = toRecord(BASE_CARDS);
  const enemies = toRecord(BASE_ENEMIES);
  const relics = toRecord(BASE_RELICS);
  const events = toRecord(BASE_EVENTS);
  const ancients = toRecord(BASE_ANCIENTS);

  const mergedCards = mergeMap(cards, custom?.cards);
  // Legacy explicit upgraded-card entries are not allowed anymore: upgrades
  // must live on the base card's `upgrade` field. Drop them, then derive.
  for (const id of Object.keys(mergedCards)) {
    if (id.endsWith("+")) delete mergedCards[id];
  }
  // Derive upgraded forms after custom overrides are merged, so edits to a
  // base card's numbers flow into its `+` form automatically.
  expandUpgradedCards(mergedCards);

  return {
    cards: mergedCards,
    enemies: mergeMap(enemies, custom?.enemies),
    relics: mergeMap(relics, custom?.relics),
    events: mergeMap(events, custom?.events),
    ancients: mergeMap(ancients, custom?.ancients),
  };
}

export function exportCustomData(data: CustomData): string {
  return JSON.stringify(data, null, 2);
}

export function importCustomData(json: string): CustomData {
  const parsed = JSON.parse(json) as CustomData;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("导入内容不是有效的 JSON 对象");
  }
  return parsed;
}

export async function loadDatabaseAsync(): Promise<GameDatabase> {
  const formal = await loadFormalData();
  const debug = loadDebugData();
  return buildDatabase(mergeCustomData(formal, debug));
}

export function loadRunSettings(): RunSettings {
  const merged = mergeCustomData(getCachedFormalData(), loadDebugData());
  return merged.settings ?? {};
}
