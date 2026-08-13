// ---------------------------------------------------------------------------
// Data store: where DIY data and saves live.
//
// Layering:
//   permanent layer = data/*.json  (cards/enemies/relics/events/settings)
//   temporary layer = localStorage debug overrides (one-click wipe)
//   save slot       = data/save.json (or localStorage fallback)
//
// Backends, in priority order:
//   1. data directory bound via File System Access API (handle in IndexedDB)
//   2. HTTP fetch of ./data/*.json (vite dev server / static hosting)
//   3. localStorage (always available, used as the fallback)
// ---------------------------------------------------------------------------

import type { CustomData } from "./index";
import type { RunSettings, RunState } from "../core/types";

export type BackendKind = "directory" | "http" | "localStorage";

export interface SaveFile {
  version: number;
  savedAt: string;
  settings: RunSettings;
  run: RunState;
}

export interface SaveResult {
  backend: BackendKind;
  message: string;
}

export interface BindResult {
  ok: boolean;
  message: string;
}

const FORMAL_LS_KEY = "slay-the-spire-diy-formal-v1";
const DEBUG_LS_KEY = "slay-the-spire-diy-debug-v1";
const SAVE_LS_KEY = "slay-the-spire-diy-save-v1";
const LEGACY_LS_KEY = "slay-the-spire-diy-v1";

const HANDLE_IDB_KEY = "data-directory-handle";
const IDB_NAME = "slay-the-spire-diy";
const IDB_VERSION = 1;
const IDB_STORE = "kv";

const SECTIONS = ["cards", "enemies", "relics", "events", "ancients"] as const;
type Section = (typeof SECTIONS)[number];

const FILE_NAMES: Record<Section, string> = {
  cards: "cards.json",
  enemies: "enemies.json",
  relics: "relics.json",
  events: "events.json",
  ancients: "ancients.json",
};
const SETTINGS_FILE = "settings.json";
const SAVE_FILE = "save.json";

let cachedFormal: CustomData | null = null;
let backendKind: BackendKind = "localStorage";

// ---------------------------------------------------------------------------
// IndexedDB helpers (used to persist the directory handle across sessions)
// ---------------------------------------------------------------------------

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE)) {
        request.result.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openIdb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Nothing to delete.
  }
}

// ---------------------------------------------------------------------------
// Directory handle management
// ---------------------------------------------------------------------------

interface DirectoryPickerWindow {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
}

interface PermissionedDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(descriptor?: {
    mode: "read" | "readwrite";
  }): Promise<PermissionState>;
  requestPermission(descriptor?: {
    mode: "read" | "readwrite";
  }): Promise<PermissionState>;
}

function pickerWindow(): DirectoryPickerWindow {
  return window as unknown as DirectoryPickerWindow;
}

export function supportsDirectoryPicker(): boolean {
  return typeof pickerWindow().showDirectoryPicker === "function";
}

async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_IDB_KEY);
    if (!handle) return null;
    const permissioned = handle as PermissionedDirectoryHandle;
    const perm = await permissioned.queryPermission({ mode: "readwrite" });
    if (perm === "granted") return handle;
    const requested = await permissioned.requestPermission({
      mode: "readwrite",
    });
    return requested === "granted" ? handle : null;
  } catch {
    return null;
  }
}

export async function bindDataDirectory(): Promise<BindResult> {
  const picker = pickerWindow().showDirectoryPicker;
  if (typeof picker !== "function") {
    return {
      ok: false,
      message: "当前浏览器不支持 File System Access API，请使用 Chrome / Edge。",
    };
  }
  try {
    const handle = await picker.call(window, { mode: "readwrite" });
    await idbSet(HANDLE_IDB_KEY, handle);
    cachedFormal = null;
    backendKind = "directory";
    return { ok: true, message: "已绑定数据文件夹，之后读写都会走 data/ 目录。" };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError") {
      return { ok: false, message: "已取消选择。" };
    }
    return {
      ok: false,
      message: `绑定失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function unbindDataDirectory(): Promise<void> {
  await idbDelete(HANDLE_IDB_KEY);
  cachedFormal = null;
  backendKind = "localStorage";
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asSection(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asCustomData(value: unknown): CustomData {
  if (!isRecord(value)) return {};
  return value as CustomData;
}

async function readJsonFile(
  dir: FileSystemDirectoryHandle,
  name: string
): Promise<unknown | null> {
  try {
    const fileHandle = await dir.getFileHandle(name);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

async function writeJsonFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  value: unknown
): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(value, null, 2));
  await writable.close();
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CustomData merging (temporary layer wins over permanent layer)
// ---------------------------------------------------------------------------

export function mergeCustomData(
  base: CustomData,
  override: CustomData
): CustomData {
  const result: CustomData = {};
  for (const section of SECTIONS) {
    const merged: Record<string, unknown> = {
      ...asSection(base[section]),
    };
    for (const [id, value] of Object.entries(asSection(override[section]))) {
      if (value === null) {
        delete merged[id];
      } else {
        merged[id] = value;
      }
    }
    result[section] = merged as never;
  }
  result.settings = override.settings ?? base.settings;
  return result;
}

// ---------------------------------------------------------------------------
// Permanent layer
// ---------------------------------------------------------------------------

function loadLocalStorageFormal(): CustomData {
  try {
    const raw = localStorage.getItem(FORMAL_LS_KEY);
    if (raw) return asCustomData(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_LS_KEY);
    if (legacy) {
      const migrated = asCustomData(JSON.parse(legacy));
      localStorage.setItem(FORMAL_LS_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_LS_KEY);
      return migrated;
    }
  } catch {
    // fall through
  }
  return {};
}

function saveLocalStorageFormal(data: CustomData): void {
  localStorage.setItem(FORMAL_LS_KEY, JSON.stringify(data));
}

async function readFormalFromDirectory(
  dir: FileSystemDirectoryHandle
): Promise<CustomData> {
  const data: CustomData = {};
  for (const section of SECTIONS) {
    const value = await readJsonFile(dir, FILE_NAMES[section]);
    if (value !== null) data[section] = asSection(value) as never;
  }
  const settings = await readJsonFile(dir, SETTINGS_FILE);
  if (settings !== null) {
    data.settings = asCustomData(settings).settings ?? (settings as RunSettings);
  }
  return data;
}

async function readFormalFromHttp(): Promise<CustomData> {
  const data: CustomData = {};
  for (const section of SECTIONS) {
    const value = await fetchJson(`./data/${FILE_NAMES[section]}`);
    if (value !== null) data[section] = asSection(value) as never;
  }
  const settings = await fetchJson(`./data/${SETTINGS_FILE}`);
  if (settings !== null) {
    data.settings = asCustomData(settings).settings ?? (settings as RunSettings);
  }
  return data;
}

export async function loadFormalData(): Promise<CustomData> {
  if (cachedFormal) return cachedFormal;

  const dir = await getDirectoryHandle();
  if (dir) {
    const fromDir = await readFormalFromDirectory(dir);
    cachedFormal = fromDir;
    backendKind = "directory";
    return fromDir;
  }

  const fromHttp = await readFormalFromHttp();
  const hasHttpData =
    SECTIONS.some((s) => Object.keys(fromHttp[s] ?? {}).length > 0) ||
    fromHttp.settings !== undefined;
  if (hasHttpData) {
    cachedFormal = fromHttp;
    backendKind = "http";
    return fromHttp;
  }

  const fromLocal = loadLocalStorageFormal();
  cachedFormal = fromLocal;
  backendKind = "localStorage";
  return fromLocal;
}

export async function saveFormalData(data: CustomData): Promise<SaveResult> {
  const dir = await getDirectoryHandle();
  if (dir) {
    for (const section of SECTIONS) {
      const sectionData = data[section];
      if (sectionData && Object.keys(sectionData).length > 0) {
        await writeJsonFile(dir, FILE_NAMES[section], sectionData);
      }
    }
    if (data.settings) {
      await writeJsonFile(dir, SETTINGS_FILE, data.settings);
    }
    cachedFormal = data;
    backendKind = "directory";
    return {
      backend: "directory",
      message: "已写入 data/ 文件夹（正式数据）。",
    };
  }

  saveLocalStorageFormal(data);
  cachedFormal = data;
  backendKind = "localStorage";
  return {
    backend: "localStorage",
    message:
      "已写入浏览器存储（未绑定 data 文件夹）。建议点击「绑定数据文件夹」实现文件持久化。",
  };
}

// ---------------------------------------------------------------------------
// Temporary layer (debug overrides, localStorage only)
// ---------------------------------------------------------------------------

export function loadDebugData(): CustomData {
  try {
    const raw = localStorage.getItem(DEBUG_LS_KEY);
    if (!raw) return {};
    return asCustomData(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveDebugData(data: CustomData): void {
  localStorage.setItem(DEBUG_LS_KEY, JSON.stringify(data));
}

export function clearDebugData(): void {
  localStorage.removeItem(DEBUG_LS_KEY);
}

// ---------------------------------------------------------------------------
// Save slot
// ---------------------------------------------------------------------------

function isSaveFile(value: unknown): value is SaveFile {
  if (!isRecord(value)) return false;
  return isRecord(value.run) && isRecord(value.settings);
}

export async function saveGameData(
  settings: RunSettings,
  run: RunState
): Promise<SaveResult> {
  const save: SaveFile = {
    version: 1,
    savedAt: new Date().toISOString(),
    settings,
    run,
  };
  const dir = await getDirectoryHandle();
  if (dir) {
    await writeJsonFile(dir, SAVE_FILE, save);
    return { backend: "directory", message: "存档已写入 data/save.json。" };
  }
  localStorage.setItem(SAVE_LS_KEY, JSON.stringify(save));
  return { backend: "localStorage", message: "存档已保存（浏览器缓存）。" };
}

export async function loadSaveData(): Promise<SaveFile | null> {
  const dir = await getDirectoryHandle();
  if (dir) {
    const value = await readJsonFile(dir, SAVE_FILE);
    if (isSaveFile(value)) return value;
  }
  try {
    const raw = localStorage.getItem(SAVE_LS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSaveFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearSaveData(): Promise<void> {
  const dir = await getDirectoryHandle();
  if (dir) {
    try {
      await dir.removeEntry(SAVE_FILE);
    } catch {
      // File already gone.
    }
  }
  localStorage.removeItem(SAVE_LS_KEY);
}

// ---------------------------------------------------------------------------
// Status info for the UI
// ---------------------------------------------------------------------------

export function getCachedFormalData(): CustomData {
  return cachedFormal ?? {};
}

export function getBackendKind(): BackendKind {
  return backendKind;
}

export function getBackendLabel(): string {
  switch (backendKind) {
    case "directory":
      return "data 文件夹";
    case "http":
      return "data 文件夹（HTTP 读取）";
    case "localStorage":
      return "浏览器存储";
  }
}
