import type { GameDatabase } from "../core/types";
import { el, button } from "./dom";

export interface MenuOptions {
  onStart: () => void;
  onEditor: () => void;
  onTestRoom?: () => void;
  onContinue?: () => void;
  onBindDirectory?: () => void;
  continueSummary?: string | null;
  backendLabel: string;
}

export function renderMenu(
  app: HTMLElement,
  db: GameDatabase,
  options: MenuOptions
): void {
  const root = el("div", "menu-view");
  const title = el("h1", "menu-title", "杀戮尖塔 DIY");
  const subtitle = el(
    "p",
    "menu-subtitle",
    "自己定义卡牌与怪物的爬塔卡牌构筑游戏"
  );
  const stats = el(
    "div",
    "menu-stats",
    `已收录 ${Object.keys(db.cards).length} 张卡牌 · ${Object.keys(db.enemies).length} 种怪物 · ${Object.keys(db.relics).length} 件遗物 · ${Object.keys(db.events).length} 个事件`
  );
  const buttons = el("div", "menu-buttons");
  if (options.onContinue && options.continueSummary) {
    buttons.appendChild(
      button(
        `继续上次（${options.continueSummary}）`,
        options.onContinue,
        "btn menu-btn"
      )
    );
  }
  const startBtn = button("开始新游戏", options.onStart, "btn menu-btn");
  const editorBtn = button(
    "✏️ DIY 编辑器",
    options.onEditor,
    "btn menu-btn"
  );
  buttons.append(startBtn, editorBtn);
  if (options.onTestRoom) {
    buttons.appendChild(
      button("🧪 测试房间", options.onTestRoom, "btn menu-btn")
    );
  }

  const dataRow = el("div", "menu-data-row");
  dataRow.append(el("span", "menu-data-label", `数据：${options.backendLabel}`));
  if (options.onBindDirectory) {
    dataRow.appendChild(
      button(
        "绑定 data 文件夹",
        options.onBindDirectory,
        "btn btn-mini"
      )
    );
  }

  const hint = el(
    "p",
    "menu-hint",
    "提示：编辑器里可「临时微调」（立即生效）或「写入正式数据」（固化到 data/ 文件夹）；进度会自动存档。"
  );
  root.append(title, subtitle, stats, buttons, dataRow, hint);
  app.replaceChildren(root);
}
