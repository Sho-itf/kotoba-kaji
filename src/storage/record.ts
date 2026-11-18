// 記録(ベスト・稽古の履歴・ミスしたキーの合計)の形と、書き出し・取り込みの確かめ。
// 画面(DOM)にも localStorage にも依存しない。

export const RECORD_VERSION = 1;
/** 稽古の記録は直近これだけ残す */
export const MAX_HISTORY = 100;
/** ミスしたキーの種類の上限(取り込むファイルが大きすぎないように) */
const MAX_MISS_KINDS = 5000;

/** 稽古 1 回ぶんの記録 */
export interface Run {
  /** 日時(ISO 8601) */
  at: string;
  keystrokes: number;
  misses: number;
  accuracy: number;
  score: number;
  sentences: number;
  ippon: number;
}

export interface RecordData {
  version: number;
  /** これまでのベスト(スコアがいちばん高かった回)。まだ無ければ null。 */
  best: Run | null;
  /** 直近 MAX_HISTORY 回まで、古い順 */
  history: Run[];
  /** ミスしたキーの合計("かな:キー" → 回数) */
  missKeys: Record<string, number>;
}

export function emptyRecord(): RecordData {
  return { version: RECORD_VERSION, best: null, history: [], missKeys: {} };
}

/** 稽古 1 回ぶんを記録に足す(元の記録は変えない)。ベストはスコアが上回ったときだけ更新する。 */
export function applyRun(
  record: RecordData,
  run: Run,
  missKeys: Record<string, number>,
): { record: RecordData; newBest: boolean } {
  const newBest = run.score > 0 && (record.best === null || run.score > record.best.score);
  const merged: Record<string, number> = { ...record.missKeys };
  for (const [k, n] of Object.entries(missKeys)) merged[k] = (merged[k] ?? 0) + n;
  return {
    newBest,
    record: {
      version: RECORD_VERSION,
      best: newBest ? run : record.best,
      history: [...record.history, run].slice(-MAX_HISTORY),
      missKeys: merged,
    },
  };
}

export function serializeRecord(record: RecordData): string {
  return JSON.stringify(record, null, 2) + "\n";
}

export type ParseResult = { ok: true; record: RecordData } | { ok: false; error: string };

function isCount(v: unknown, max = Number.MAX_SAFE_INTEGER): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
}

function parseRun(v: unknown): Run | null {
  const r = v as Record<string, unknown> | null;
  if (typeof r !== "object" || r === null) return null;
  const accuracy = r.accuracy;
  if (
    typeof r.at !== "string" || r.at.length > 40 ||
    !isCount(r.keystrokes, 100000) || !isCount(r.misses, 100000) ||
    !isCount(r.score, 100000) || !isCount(r.sentences, 100000) || !isCount(r.ippon, 100000) ||
    typeof accuracy !== "number" || !(accuracy >= 0 && accuracy <= 1)
  ) {
    return null;
  }
  return {
    at: r.at, keystrokes: r.keystrokes, misses: r.misses, accuracy,
    score: r.score, sentences: r.sentences, ippon: r.ippon,
  };
}

/** JSON の文字列を確かめて、記録にする。おかしなものは、分かりやすい理由をつけて断る。 */
export function parseRecord(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON として読めませんでした。書き出したファイルを選んでください。" };
  }
  const d = data as Record<string, unknown> | null;
  if (typeof d !== "object" || d === null || Array.isArray(d)) {
    return { ok: false, error: "記録の形式ではありません。" };
  }
  if (d.version !== RECORD_VERSION) {
    return { ok: false, error: `形式の版が合いません(このアプリは ${RECORD_VERSION} 版です)。` };
  }

  let best: Run | null = null;
  if (d.best !== null) {
    best = parseRun(d.best);
    if (!best) return { ok: false, error: "ベストの中身がおかしいので、読み込めません。" };
  }

  if (!Array.isArray(d.history)) return { ok: false, error: "稽古の記録の形がおかしいので、読み込めません。" };
  const history: Run[] = [];
  for (const item of d.history) {
    const run = parseRun(item);
    if (!run) return { ok: false, error: "稽古の記録の中身がおかしいので、読み込めません。" };
    history.push(run);
  }

  const mk = d.missKeys as Record<string, unknown> | null;
  if (typeof mk !== "object" || mk === null || Array.isArray(mk)) {
    return { ok: false, error: "ミスしたキーの記録の形がおかしいので、読み込めません。" };
  }
  const entries = Object.entries(mk);
  if (entries.length > MAX_MISS_KINDS || entries.some(([, n]) => !isCount(n, 10_000_000))) {
    return { ok: false, error: "ミスしたキーの記録の中身がおかしいので、読み込めません。" };
  }

  return {
    ok: true,
    record: {
      version: RECORD_VERSION,
      best,
      history: history.slice(-MAX_HISTORY),
      missKeys: Object.fromEntries(entries) as Record<string, number>,
    },
  };
}
