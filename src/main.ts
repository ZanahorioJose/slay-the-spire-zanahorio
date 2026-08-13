import "./styles.css";
import { loadDatabaseAsync, loadRunSettings } from "./data";
import { Game } from "./core/game";
import type { GameDatabase } from "./core/types";
import { renderMenu } from "./ui/menuView";
import { renderMap } from "./ui/mapView";
import { showMapOverlay } from "./ui/mapView";
import { renderBattle } from "./ui/battleView2";
import { renderEvent } from "./ui/eventView";
import { renderAncient } from "./ui/ancientView";
import { renderShop } from "./ui/shopView";
import { renderRest } from "./ui/restView";
import { renderTreasure } from "./ui/treasureView";
import { renderEditor } from "./ui/editorView";
import { renderTestRoom } from "./ui/testRoomView";
import type { EventData } from "./core/types";
import {
  bindDataDirectory,
  clearSaveData,
  getBackendLabel,
  loadSaveData,
  saveGameData,
  supportsDirectoryPicker,
} from "./data/store";

const app = document.getElementById("app")!;

type AppView = "menu" | "game" | "editor" | "test";

let db: GameDatabase;
let game: Game | null = null;
let view: AppView = "menu";
let continueSummary: string | null = null;
let backendLabel = "浏览器存储";
let testMode = false;
let testEvent: EventData | null = null;
let mapOverlay: HTMLElement | null = null;

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement
  ) {
    return;
  }
  if (e.key.toLowerCase() !== "f") return;
  if (view !== "game" || !game) return;
  if (mapOverlay && mapOverlay.isConnected) {
    mapOverlay.remove();
    mapOverlay = null;
    return;
  }
  if (mapOverlay) {
    mapOverlay.remove();
  }
  mapOverlay = showMapOverlay(game);
});

async function refreshMenuInfo(): Promise<void> {
  backendLabel = getBackendLabel();
  const save = await loadSaveData();
  continueSummary = save
    ? `第 ${save.run.act} 层 · 生命 ${save.run.player.hp}/${save.run.player.maxHp}`
    : null;
}

function route(): void {
  if (view === "test") {
    renderTestRoom(app, db, enterTestEvent, exitTestRoom);
    return;
  }
  if (view === "editor") {
    void renderEditor(app, db, exitEditor);
    return;
  }
  if (view === "menu" || !game) {
    renderMenu(app, db, {
      onStart: () => void startGame(),
      onEditor: openEditor,
      onContinue: continueSummary ? () => void continueGame() : undefined,
      onBindDirectory: supportsDirectoryPicker()
        ? () => void bindDirectory()
        : undefined,
      onTestRoom: openTestRoom,
      continueSummary,
      backendLabel,
    });
    return;
  }

  // Auto-save whenever the run settles into a non-battle state.
  if (game.run.status !== "battle") {
    void saveGameData(game.settings, game.run);
  }

  switch (game.run.status) {
    case "map":
      if (testMode) {
        view = "test";
        route();
        return;
      }
      renderMap(app, game, route, quitToMenu);
      break;
    case "battle":
      renderBattle(app, game, route, quitToMenu);
      break;
    case "event":
      renderEvent(app, game, route, testEvent ?? undefined);
      break;
    case "ancient":
      renderAncient(app, game, route);
      break;
    case "shop":
      renderShop(app, game, route);
      break;
    case "rest":
      renderRest(app, game, route);
      break;
    case "treasure":
      renderTreasure(app, game, route);
      break;
    case "defeat":
    case "victory":
      void clearSaveData().then(() => void returnToMenu());
      break;
  }
}

function openTestRoom(): void {
  testMode = false;
  testEvent = null;
  view = "test";
  route();
}

function enterTestEvent(event: EventData, hp: number, gold: number): void {
  game = new Game(db, loadRunSettings());
  game.run.player.maxHp = Math.max(game.run.player.maxHp, hp);
  game.run.player.hp = Math.min(hp, game.run.player.maxHp);
  game.run.player.gold = gold;
  game.run.status = "event";
  testEvent = event;
  testMode = true;
  view = "game";
  route();
}

function exitTestRoom(): void {
  testMode = false;
  testEvent = null;
  game = null;
  view = "menu";
  void refreshMenuInfo().then(() => route());
}

async function returnToMenu(): Promise<void> {
  view = "menu";
  game = null;
  await refreshMenuInfo();
  route();
}

function quitToMenu(): void {
  void returnToMenu();
}

async function startGame(): Promise<void> {
  db = await loadDatabaseAsync();
  game = new Game(db, loadRunSettings());
  view = "game";
  await saveGameData(game.settings, game.run);
  continueSummary = null;
  route();
}

async function continueGame(): Promise<void> {
  const save = await loadSaveData();
  if (!save) return;
  db = await loadDatabaseAsync();
  game = Game.fromRun(db, save.settings, save.run);
  view = "game";
  route();
}

async function bindDirectory(): Promise<void> {
  const result = await bindDataDirectory();
  await refreshMenuInfo();
  route();
  window.alert(result.message);
}

function openEditor(): void {
  view = "editor";
  route();
}

async function exitEditor(): Promise<void> {
  db = await loadDatabaseAsync();
  view = "menu";
  game = null;
  await refreshMenuInfo();
  route();
}

async function init(): Promise<void> {
  db = await loadDatabaseAsync();
  await refreshMenuInfo();
  route();
}

void init();
