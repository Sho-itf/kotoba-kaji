// 稽古の設定。数字を変えるときは、ここと ranks.ts だけを見ればよい。

/** 稽古の長さ(ミリ秒)。60 秒なので、打鍵数はそのまま 1 分あたりの数になる。 */
export const DURATION_MS = 60_000;

/** 結果に出す、ミスの多いキーの数 */
export const TOP_MISSES = 5;

/** 結果の画面で、Enter・Space の受け付けを止めておく時間(打ち続けていて、うっかり押すのを防ぐ) */
export const RESULT_GUARD_MS = 700;
