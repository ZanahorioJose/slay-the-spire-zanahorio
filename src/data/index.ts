import type {
  AncientData,
  CardData,
  CharacterData,
  Effect,
  EnemyData,
  EventData,
  GameDatabase,
  PotionData,
  RelicData,
  RunSettings,
} from "../core/types";
import { BASE_CARDS } from "./cards";
import { BASE_ENEMIES } from "./enemies";
import { BASE_RELICS } from "./relics";
import { BASE_EVENTS } from "./events";
import { BASE_ANCIENTS } from "./ancients";
import { BASE_CHARACTERS } from "./characters";
import { BASE_POTIONS } from "./potions";
import { PASSIVE_CARD_FIXES } from "./passive_card_fixes";
import { describeEffects } from "./describe";
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
  characters?: Record<string, CharacterData | null>;
  potions?: Record<string, PotionData | null>;
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
  // 未实现卡修正：覆盖 effects/description/starsCost 等字段（数据驱动）。
  for (const [id, fix] of Object.entries(PASSIVE_CARD_FIXES)) {
    if (cards[id]) cards[id] = { ...cards[id], ...fix };
  }
  // 空的升级效果覆盖没有意义：删除后让升级卡继承基础效果。
  for (const card of Object.values(cards)) {
    if (card.upgrade && card.upgrade.effects?.length === 0) {
      delete card.upgrade.effects;
    }
  }
  const enemies = toRecord(BASE_ENEMIES);
  const relics = toRecord(BASE_RELICS);
  const events = toRecord(BASE_EVENTS);
  const ancients = toRecord(BASE_ANCIENTS);
  const characters = toRecord(BASE_CHARACTERS);
  const potions = toRecord(BASE_POTIONS);

  const mergedCards = mergeMap(cards, custom?.cards);
  // Legacy explicit upgraded-card entries are not allowed anymore: upgrades
  // must live on the base card's `upgrade` field. Drop them, then derive.
  for (const id of Object.keys(mergedCards)) {
    if (id.endsWith("+")) delete mergedCards[id];
  }
  // Derive upgraded forms after custom overrides are merged, so edits to a
  // base card's numbers flow into its `+` form automatically.
  expandUpgradedCards(mergedCards);
  // 描述仍含英文的生成卡（含升级卡）：若效果已结构化（非 fallback 近似），
  // 用 describeEffects 生成中文描述（本地化问题 B）。
  for (const card of Object.values(mergedCards)) {
    if (!card.description || !/[A-Za-z]{3}/.test(card.description)) continue;
    if (isFallbackEffects(card.effects, card.cost)) {
      // 升级卡效果未结构化时，用基础卡的中文描述兜底
      // （数值差异以结构化效果为准，保证描述全中文）。
      if (card.id.endsWith("+")) {
        const base = mergedCards[card.id.slice(0, -1)];
        if (
          base?.description &&
          !/[A-Za-z]{3}/.test(base.description)
        ) {
          card.description = base.description;
        }
      }
      continue;
    }
    const generated = describeEffects(card.effects);
    if (generated) card.description = generated;
  }
  // 空描述自动填充：结构化效果存在但 description 为空时，用生成器补中文。
  for (const card of Object.values(mergedCards)) {
    if (!card.description || !card.description.trim()) {
      card.description = describeEffects(card.effects);
    }
  }

  return {
    cards: mergedCards,
    enemies: mergeMap(enemies, custom?.enemies),
    relics: mergeMap(relics, custom?.relics),
    events: mergeMap(events, custom?.events),
    ancients: mergeMap(ancients, custom?.ancients),
    characters: mergeMap(characters, custom?.characters),
    potions: mergeMap(potions, custom?.potions),
  };
}

// fallback 近似效果（生成器未解析时按费用给的默认伤害/格挡）：
// 用它生成的描述会丢失原意，故跳过，保留原文待手写。
function isFallbackEffects(effects: Effect[], cost: number): boolean {
  if (effects.length !== 1) return false;
  const effect = effects[0];
  if (effect.op === "damage") {
    return effect.amount === 4 + cost * 3 && !effect.hits && !effect.scaling;
  }
  if (effect.op === "block") {
    return effect.amount === 5 + cost * 3;
  }
  return false;
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
