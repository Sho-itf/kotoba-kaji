// 位に関する画面の文言。DOM に頼らない関数にして、テストできるようにしてある。

import { accuracyTenths, formatAccuracy, nextRankAfter, rankByScoreOnly, rankIndex, rankOfRun, type Rank, type RunLike } from "./ranks.ts";

/** 位の条件の正確さの文字(例:95 → "95"、97.5 → "97.5") */
export function ruleAccuracyText(rank: Rank): string {
  return String(rank.minAccuracy);
}

/**
 * 結果の画面の知らせ:スコアは上の段に届いたのに、正確さが足りなかった回。
 * 当てはまらなければ null。
 */
export function accuracyShortfallNote(run: RunLike): string | null {
  const byScore = rankByScoreOnly(run.score);
  const actual = rankOfRun(run);
  if (rankIndex(byScore) <= rankIndex(actual)) return null;
  const tenths = accuracyTenths(run.keystrokes, run.misses);
  return `スコアは${byScore.name}に届いています。正確さ ${formatAccuracy(tenths)}%(${byScore.name}は ${ruleAccuracyText(byScore)}% 以上)`;
}

/** 位が上がったときの知らせ(名乗る位で比べる)。上がっていなければ null。 */
export function rankUpNote(before: Rank, after: Rank): string | null {
  if (rankIndex(after) <= rankIndex(before)) return null;
  return `位が上がりました:${before.name} → ${after.name}`;
}

/** 待機の画面の、次の位までの目安。いちばん上なら null。 */
export function nextRankNote(claimed: Rank, bestScore: number): string | null {
  const next = nextRankAfter(claimed);
  if (!next) return null;
  const remaining = next.min - bestScore;
  if (!next.dan) return `次の ${next.name} まで あと ${Math.max(0, remaining)}`;
  const acc = `正確さ ${ruleAccuracyText(next)}% 以上`;
  if (remaining > 0) return `次の ${next.name} まで:スコア あと ${remaining}・${acc}`;
  return `次の ${next.name} まで:1 回の稽古で、スコア ${next.min} 以上・${acc}`;
}
