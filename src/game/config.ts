// 稽古の設定。数字を変えるときは、ここと ranks.ts だけを見ればよい。

/** 稽古の最初の長さ(ミリ秒)。一本を取ると、このあとに時間が延びる。 */
export const DURATION_MS = 60_000;

/** 一本を連続で取ったときに延びる時間(ミリ秒)。1 本目は半分、2 本目からはずっと同じ。 */
export const IPPON_BONUS_FIRST_MS = 500;
export const IPPON_BONUS_MS = 1_000;

/** 結果に出す、ミスの多いキーの数 */
export const TOP_MISSES = 5;

/** 結果の画面で、Enter・Space の受け付けを止めておく時間(打ち続けていて、うっかり押すのを防ぐ) */
export const RESULT_GUARD_MS = 700;
