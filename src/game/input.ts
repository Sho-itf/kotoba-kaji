// キーの出来事を受けて、何をするかを決める。DOM には依存しない(テストしやすいように切り出してある)。

/** キーの出来事のうち、判断に使う部分(KeyboardEvent から写す) */
export interface KeyInfo {
  key: string;
  repeat: boolean;
  isComposing: boolean;
  keyCode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** ボタンや入力欄の上で押されたキーか(そのキーはボタンのものにする) */
  fromControl?: boolean;
}

/** 日本語入力(IME)がオンのときのキーか */
export function isImeKey(e: KeyInfo): boolean {
  return e.isComposing || e.key === "Process" || e.keyCode === 229;
}

export type PlayKeyAction =
  | { type: "type"; key: string }
  | { type: "abort" }
  | { type: "ime" }
  | { type: "ignore" };

/** 稽古中のキー。preventDefault は、ブラウザ本来の動き(Space で下へ送るなど)を止めるか。 */
export function decidePlayKey(e: KeyInfo): { action: PlayKeyAction; preventDefault: boolean } {
  if (e.key === "Escape") return { action: { type: "abort" }, preventDefault: true };
  // 日本語入力がオンのときは、打鍵として扱わず案内を出す(ミスには数えない)
  if (isImeKey(e)) return { action: { type: "ime" }, preventDefault: false };
  // ブラウザのショートカット(Ctrl+R など)は邪魔しない
  if (e.ctrlKey || e.metaKey || e.altKey) return { action: { type: "ignore" }, preventDefault: false };
  // 押しっぱなしの繰り返しと Space は、打鍵にもミスにも数えない
  if (e.repeat || e.key === " ") return { action: { type: "ignore" }, preventDefault: true };
  // Shift・Tab・矢印などの、文字でないキー
  if (e.key.length !== 1) return { action: { type: "ignore" }, preventDefault: false };
  return { action: { type: "type", key: e.key }, preventDefault: true };
}

export type MenuScreen = "idle" | "result";

export interface MenuDecision {
  action: "start" | "idle" | "none";
  preventDefault: boolean;
}

/**
 * 待機・結果の画面のキー。
 * Enter か Space で始める。結果の画面では Esc で待機に戻る。
 * 結果の画面の受付止めの間(sinceShownMs < guardMs)は始めないが、
 * Space の初めの動き(ページを下へ送る)は止める。
 */
export function decideMenuKey(screen: MenuScreen, e: KeyInfo, sinceShownMs: number, guardMs: number): MenuDecision {
  const none: MenuDecision = { action: "none", preventDefault: false };
  if (e.fromControl || e.isComposing) return none;
  if (e.key === "Enter" || e.key === " ") {
    if (e.repeat) return { action: "none", preventDefault: true };
    if (screen === "result" && sinceShownMs < guardMs) return { action: "none", preventDefault: true };
    return { action: "start", preventDefault: true };
  }
  if (e.key === "Escape" && screen === "result") return { action: "idle", preventDefault: false };
  return none;
}
