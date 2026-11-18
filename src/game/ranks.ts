// 位(級・段)の表と決め方。数字はここだけで決める。
//
// 級(十級〜一級):1 回の稽古のスコアだけで決める。
// 段(初段〜十段):1 回の稽古で、スコアと正確さの両方が線を超えたときになる。
// 名乗る位は、これまでの稽古で取れた、いちばん高い位(下がらない)。

export interface Rank {
  name: string;
  /** この位になるスコアの下限 */
  min: number;
  /** この位になる正確さの下限(パーセント。級は 0 で、条件なし) */
  minAccuracy: number;
  /** 段(初段より上)なら true。位の印を朱で出す。 */
  dan: boolean;
}

function kyu(name: string, min: number): Rank {
  return { name, min, minAccuracy: 0, dan: false };
}
function dan(name: string, min: number, minAccuracy: number): Rank {
  return { name, min, minAccuracy, dan: true };
}

/** 低い位から高い位の順 */
export const RANKS: readonly Rank[] = [
  kyu("十級", 0), kyu("九級", 40), kyu("八級", 60), kyu("七級", 80), kyu("六級", 100),
  kyu("五級", 120), kyu("四級", 140), kyu("三級", 160), kyu("二級", 180), kyu("一級", 200),
  dan("初段", 230, 80), dan("二段", 260, 85), dan("三段", 300, 87.5), dan("四段", 350, 90),
  dan("五段", 400, 91), dan("六段", 440, 92), dan("七段", 480, 93),
  dan("八段", 520, 94), dan("九段", 560, 95), dan("十段", 600, 96),
];

/**
 * 正確さを、画面に出す値と同じ形(小数第 1 位まで、それ以下は切り捨て)の 10 倍の整数にする。
 * 例:正確さ 94.996% → 949。画面で「95.0%」と出るのに届かない、ということが起きないようにする。
 * 打鍵数とミスの数(整数)から数えるので、小数の誤差が出ない。
 */
export function accuracyTenths(keystrokes: number, misses: number): number {
  const total = keystrokes + misses;
  return total <= 0 ? 0 : Math.floor((keystrokes * 1000) / total);
}

/** 画面に出す正確さの文字(例:949 → "94.9") */
export function formatAccuracy(tenths: number): string {
  return (tenths / 10).toFixed(1);
}

/** 位の条件の正確さを、10 倍の整数にしたもの(例:97.5 → 975) */
function ruleTenths(rank: Rank): number {
  return Math.round(rank.minAccuracy * 10);
}

export interface RunLike {
  score: number;
  keystrokes: number;
  misses: number;
}

/** 1 回の稽古の位:スコアと正確さの両方を満たす、いちばん高い位 */
export function rankOfRun(run: RunLike): Rank {
  const tenths = accuracyTenths(run.keystrokes, run.misses);
  let found = RANKS[0];
  for (const r of RANKS) if (run.score >= r.min && tenths >= ruleTenths(r)) found = r;
  return found;
}

/** スコアだけで決めた位(正確さは見ない)。正確さが足りなかった回の知らせに使う。 */
export function rankByScoreOnly(score: number): Rank {
  let found = RANKS[0];
  for (const r of RANKS) if (score >= r.min) found = r;
  return found;
}

export function rankIndex(rank: Rank): number {
  return RANKS.findIndex((r) => r.name === rank.name);
}

export function rankByName(name: string): Rank | undefined {
  return RANKS.find((r) => r.name === name);
}

/** 次の位。いちばん上なら null。 */
export function nextRankAfter(rank: Rank): Rank | null {
  const i = rankIndex(rank);
  return i >= 0 && i + 1 < RANKS.length ? RANKS[i + 1] : null;
}
