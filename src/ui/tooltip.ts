// 轻量悬浮提示：任何元素 hover 时在鼠标附近显示说明浮窗。
let tip: HTMLElement | null = null;

function positionTip(anchor: HTMLElement): void {
  if (!tip) return;
  const rect = anchor.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let x = rect.left + rect.width / 2 - tw / 2;
  let y = rect.top - th - 8;
  if (y < 4) y = rect.bottom + 8;
  x = Math.max(4, Math.min(x, window.innerWidth - tw - 4));
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

export function attachTooltip(element: HTMLElement, content: string): void {
  if (!content) return;
  element.addEventListener("mouseenter", () => {
    tip?.remove();
    tip = document.createElement("div");
    tip.className = "tooltip";
    tip.textContent = content;
    document.body.appendChild(tip);
    positionTip(element);
  });
  element.addEventListener("mousemove", () => positionTip(element));
  element.addEventListener("mouseleave", () => {
    tip?.remove();
    tip = null;
  });
}

export function clearTooltip(): void {
  tip?.remove();
  tip = null;
}
