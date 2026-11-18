// DOM を作る小さな道具。

export interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

/** 位の印(段は朱で塗る) */
export function rankSeal(name: string, dan: boolean): HTMLElement {
  return el("span", { class: dan ? "seal dan" : "seal", text: name });
}
