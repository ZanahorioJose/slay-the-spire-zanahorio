// 游戏内弹窗：替代 window.alert / window.confirm。
import { el, button } from "./dom";

function show(
  message: string,
  title: string,
  buttons: { label: string; className: string; onClick: () => void }[]
): void {
  const overlay = el("div", "overlay");
  const panel = el("div", "panel modal-panel pop-in");
  panel.appendChild(el("h2", "panel-title", title));
  panel.appendChild(el("p", "panel-text modal-text", message));
  const row = el("div", "modal-actions");
  for (const b of buttons) {
    row.appendChild(
      button(b.label, () => {
        overlay.remove();
        b.onClick();
      }, b.className)
    );
  }
  panel.appendChild(row);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

export function showAlert(message: string, title = "提示"): void {
  show(message, title, [
    { label: "知道了", className: "btn", onClick: () => undefined },
  ]);
}

export function showConfirm(
  message: string,
  onOk: () => void,
  title = "确认"
): void {
  show(message, title, [
    { label: "取消", className: "btn btn-plain", onClick: () => undefined },
    { label: "确定", className: "btn", onClick: onOk },
  ]);
}
