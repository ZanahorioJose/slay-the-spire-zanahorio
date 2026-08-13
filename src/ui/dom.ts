export type Child = Node | string;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  children?: Child | Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (children !== undefined) {
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (typeof child === "string") {
        node.appendChild(document.createTextNode(child));
      } else {
        node.appendChild(child);
      }
    }
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function button(
  label: string,
  onClick: () => void,
  className = "btn"
): HTMLButtonElement {
  const node = el("button", className, label);
  node.addEventListener("click", onClick);
  return node;
}

export function showToast(message: string): void {
  const toast = el("div", "toast", message);
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2200);
}
