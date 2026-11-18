// 位(級・段)の表。スコアの下限が上がる順に並べる。数字はここだけで決める。

export interface Rank {
  name: string;
  /** この位になるスコアの下限 */
  min: number;
  /** 段(初段より上)なら true。位の印を朱で出す。 */
  dan: boolean;
}

export const RANKS: readonly Rank[] = [
  { name: "十級", min: 0, dan: false },
  { name: "九級", min: 40, dan: false },
  { name: "八級", min: 60, dan: false },
  { name: "七級", min: 80, dan: false },
  { name: "六級", min: 100, dan: false },
  { name: "五級", min: 120, dan: false },
  { name: "四級", min: 140, dan: false },
  { name: "三級", min: 160, dan: false },
  { name: "二級", min: 180, dan: false },
  { name: "一級", min: 200, dan: false },
  { name: "初段", min: 230, dan: true },
  { name: "二段", min: 260, dan: true },
  { name: "三段", min: 300, dan: true },
  { name: "四段", min: 350, dan: true },
  { name: "五段", min: 400, dan: true },
];

/** スコアに対する位(ベストのスコアを渡す) */
export function rankOf(score: number): Rank {
  let found = RANKS[0];
  for (const r of RANKS) if (score >= r.min) found = r;
  return found;
}

/** 次の位。いちばん上なら null。 */
export function nextRank(score: number): Rank | null {
  return RANKS.find((r) => r.min > score) ?? null;
}
