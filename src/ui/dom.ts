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

const SVG_NS = "http://www.w3.org/2000/svg";

/** 単純な線のアイコンを作る(path だけの SVG) */
function icon(viewBox: string, d: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

/** 金床のアイコン */
const anvil = () => icon("0 0 44 26", "M1 2 H34 V8 H25 C26 11 28 13 32 14 V19 H36 V24 H8 V19 H12 V14 C16 13 18 11 19 8 H10 C5 8 2 5 1 2 Z");
/** ボタンの矢印 */
const chevron = () => icon("0 0 14 22", "M3 3 L11 11 L3 19");

/** 上の帯(金床・縦線・「ことば鍛冶」)。right には、右端に置くもの(残り時間など)を渡す。 */
export function siteBar(...right: Node[]): HTMLElement {
  return el("header", { class: "bar" },
    el("div", { class: "brand" }, anvil(), el("span", { class: "vline" }), el("span", { class: "name", text: "ことば鍛冶" })),
    el("span", { class: "grow" }),
    ...right,
  );
}

/** 足もと(Vorge と同じ形) */
export function siteFooter(): HTMLElement {
  return el("footer", { class: "site-footer" },
    el("p", {}, "Source code is available on ",
      el("a", { text: "GitHub", attrs: { href: "https://github.com/Sho-itf/kotoba-kaji", target: "_blank", rel: "noopener" } }), "."),
    el("p", { text: "Contributed by Sho." }),
  );
}

/** 先が斜めに切れた朱の枠のボタン */
export function ctaButton(label: string, small = false): HTMLButtonElement {
  return el("button", { class: small ? "btn small" : "btn", attrs: { type: "button" } }, el("span", { text: label }), chevron());
}

/** 画面の枠。背景の筆の跡・上の帯・中身・足もとを重ねる。 */
export function stage(opts: { dim?: boolean; bar: HTMLElement; footer?: boolean }, ...body: Node[]): HTMLElement {
  return el("div", { class: opts.dim ? "stage dim" : "stage" },
    el("div", { class: "brush", attrs: { "aria-hidden": "true" } }),
    opts.bar,
    ...body,
    ...(opts.footer === false ? [] : [siteFooter()]),
  );
}
