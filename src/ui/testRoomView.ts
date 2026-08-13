import type { EventData, GameDatabase } from "../core/types";
import { el, button } from "./dom";

export function renderTestRoom(
  app: HTMLElement,
  db: GameDatabase,
  onEnter: (event: EventData, hp: number, gold: number) => void,
  onExit: () => void
): void {
  const root = el("div", "test-room-view");
  const title = el("h2", "test-room-title", "🧪 测试房间");
  const note = el(
    "p",
    "test-room-note",
    "设置初始状态后选择一个事件，立即以该状态进入事件测试选项逻辑；事件结束后自动回到这里，方便连续测试。"
  );

  const hpInput = numInput(70);
  const goldInput = numInput(99);
  const config = el("div", "test-room-config", [
    field("初始生命", hpInput),
    field("初始金币", goldInput),
  ]);

  const list = el("div", "test-room-list");
  const events = Object.values(db.events).sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  if (events.length === 0) {
    list.appendChild(el("p", "panel-text", "没有可用的事件。"));
  }
  for (const event of events) {
    const row = el("div", "test-room-item clickable");
    row.append(
      el("span", "test-room-art", event.art ?? "❓"),
      el("span", "test-room-name", event.name),
      el("span", "test-room-id", event.id)
    );
    row.title = event.text;
    row.addEventListener("click", () => {
      onEnter(
        event,
        Math.max(1, Number(hpInput.value) || 70),
        Math.max(0, Number(goldInput.value) || 99)
      );
    });
    list.appendChild(row);
  }

  root.append(
    title,
    note,
    config,
    el("h3", "test-room-subtitle", `事件（${events.length}）`),
    list,
    button("返回主菜单", onExit, "btn btn-plain")
  );
  app.replaceChildren(root);
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el("label", "test-room-field");
  wrap.append(el("span", "test-room-field-label", label), control);
  return wrap;
}

function numInput(value: number): HTMLInputElement {
  const input = el("input", "num-input");
  input.type = "number";
  input.value = String(value);
  input.min = "0";
  return input;
}
