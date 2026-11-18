// スコアと正確さの計算。

export interface Score {
  /** 正しいキー ÷(正しいキー + ミス)。0 打鍵のときは 0。 */
  accuracy: number;
  /** 打鍵数 × 正確さ(小数点以下は切り捨て) */
  score: number;
}

export function calcScore(keystrokes: number, misses: number): Score {
  const total = keystrokes + misses;
  if (total <= 0) return { accuracy: 0, score: 0 };
  // 打鍵数 × (打鍵数 ÷ 全体) を、掛け算を先にして割る(小数の誤差で 1 ずれないように)
  return { accuracy: keystrokes / total, score: Math.floor((keystrokes * keystrokes) / total) };
}

export interface MissEntry {
  kana: string;
  key: string;
  count: number;
}

/** ミスの集計("かな:キー" → 回数)から、多い順に上位 n 個 */
export function topMisses(missKeys: Record<string, number>, n: number): MissEntry[] {
  return Object.entries(missKeys)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => {
      const i = id.indexOf(":");
      return { kana: id.slice(0, i), key: id.slice(i + 1), count };
    })
    .sort((a, b) => b.count - a.count || a.kana.localeCompare(b.kana) || a.key.localeCompare(b.key))
    .slice(0, n);
}

/** 1 秒あたりの打鍵数を、10 倍の整数で返す(小数 1 けたで切り捨て)。整数だけで計算するので誤差が出ない。 */
export function keysPerSecondTenths(keystrokes: number, durationMs: number): number {
  if (keystrokes <= 0 || durationMs <= 0) return 0;
  return Math.floor((keystrokes * 10_000) / durationMs);
}

/** 10 倍の整数を、小数 1 けたの文字にする(45 → "4.5") */
export function formatTenths(tenths: number): string {
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}
