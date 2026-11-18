// 記録(ベスト・稽古の履歴・ミスしたキーの合計)の形と、書き出し・取り込みの確かめ。
// 画面(DOM)にも localStorage にも依存しない。

import { RANKS, rankByName, rankIndex, rankOfRun, type Rank } from "../game/ranks.ts";

/** 形式の版。2:名乗る位(rank)を持つ。1 は古い版で、読むときに 2 に移し替える。 */
export const RECORD_VERSION = 2;
/** 稽古の記録は直近これだけ残す */
export const MAX_HISTORY = 100;
/** ミスしたキーの種類の上限(取り込むファイルが大きすぎないように) */
const MAX_MISS_KINDS = 5000;
/** ミスしたキーの名前の形:「かな:キー」。かなは 1〜8 字(コロンを含まない)、キーは英字か - の 1 字。 */
const MISS_KEY_FORMAT = /^[^:]{1,8}:[a-z-]$/;
/** 日時の形(ISO 8601。例 2026-11-18T10:00:00.000Z) */
/** オブジェクトの特別な名前(これらをキーにした記録は断る) */
const SPECIAL_NAMES = ["__proto__", "constructor", "prototype", "toString", "hasOwnProperty"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

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

/** 名乗る位:これまでの稽古で取れた、いちばん高い位と、それを取れた日時 */
export interface RankTitle {
  name: string;
  at: string;
}

export interface RecordData {
  version: number;
  /** これまでのベスト(スコアがいちばん高かった回)。まだ無ければ null。 */
  best: Run | null;
  /** 名乗る位。まだ位を取っていなければ null(画面では十級)。下がらない。 */
  rank: RankTitle | null;
  /** 直近 MAX_HISTORY 回まで、古い順 */
  history: Run[];
  /** ミスしたキーの合計("かな:キー" → 回数) */
  missKeys: Record<string, number>;
}

export function emptyRecord(): RecordData {
  return { version: RECORD_VERSION, best: null, rank: null, history: [], missKeys: {} };
}

/** 名乗る位(まだ無ければ十級) */
export function claimedRank(record: RecordData): Rank {
  return (record.rank && rankByName(record.rank.name)) || RANKS[0];
}

/** 名乗る位を、この回の位と比べて、高ければ更新する。スコア 0 の回では変えない。 */
function claim(current: RankTitle | null, run: Run): RankTitle | null {
  if (run.score <= 0) return current;
  const got = rankOfRun(run);
  const cur = current ? rankByName(current.name) : undefined;
  return !cur || rankIndex(got) > rankIndex(cur) ? { name: got.name, at: run.at } : current;
}

/** 古い版の記録から、名乗る位を計算し直す(ベストと履歴の各回の位のうち、いちばん高いもの) */
export function deriveRank(best: Run | null, history: Run[]): RankTitle | null {
  const runs = [...history, ...(best ? [best] : [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let title: RankTitle | null = null;
  for (const run of runs) title = claim(title, run);
  return title;
}

/**
 * 稽古 1 回ぶんを記録に足す(元の記録は変えない)。
 * ベストはスコアが上回ったときだけ更新する。スコア 0 の回(何も打たずに時間切れなど)は履歴に残さない。
 * ミスしたキーの合計は、スコア 0 でも足す。
 */
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
      rank: claim(record.rank, run),
      history: run.score > 0 ? [...record.history, run].slice(-MAX_HISTORY) : record.history,
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
    typeof r.at !== "string" || r.at.length > 40 || !ISO_DATE.test(r.at) || Number.isNaN(Date.parse(r.at)) ||
    !isCount(r.keystrokes, 100000) || !isCount(r.misses, 100000) ||
    !isCount(r.score, 100000) || !isCount(r.sentences, 100000) || !isCount(r.ippon, 100000) ||
    typeof accuracy !== "number" || !(accuracy >= 0 && accuracy <= 1)
  ) {
    return null;
  }
  // つじつまが合わない値(スコアは打鍵数を超えない、一本は文の数を超えない)
  if (r.score > r.keystrokes || r.ippon > r.sentences) return null;
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
  if (d.version !== RECORD_VERSION && d.version !== 1) {
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

  // 名乗る位:2 版は記録のとおり確かめる。1 版には無いので、ベストと履歴から計算し直す。
  let rank: RankTitle | null;
  if (d.version === 1) {
    rank = deriveRank(best, history);
  } else {
    const r = d.rank as Record<string, unknown> | null;
    if (r === null) {
      if (best !== null) return { ok: false, error: "位の記録が足りないので、読み込めません。" };
      rank = null;
    } else {
      if (
        typeof r !== "object" || typeof r.name !== "string" || !rankByName(r.name) ||
        typeof r.at !== "string" || r.at.length > 40 || !ISO_DATE.test(r.at) || Number.isNaN(Date.parse(r.at))
      ) {
        return { ok: false, error: "位の記録の中身がおかしいので、読み込めません。" };
      }
      rank = { name: r.name, at: r.at };
    }
  }

  const mk = d.missKeys as Record<string, unknown> | null;
  if (typeof mk !== "object" || mk === null || Array.isArray(mk)) {
    return { ok: false, error: "ミスしたキーの記録の形がおかしいので、読み込めません。" };
  }
  const entries = Object.entries(mk);
  if (entries.length > MAX_MISS_KINDS) {
    return { ok: false, error: "ミスしたキーの記録が多すぎるので、読み込めません。" };
  }
  if (entries.some(([k]) => !MISS_KEY_FORMAT.test(k) || SPECIAL_NAMES.includes(k))) {
    return { ok: false, error: "ミスしたキーの名前の形がおかしいので、読み込めません。" };
  }
  if (entries.some(([, n]) => !isCount(n, 10_000_000))) {
    return { ok: false, error: "ミスしたキーの回数がおかしいので、読み込めません。" };
  }

  return {
    ok: true,
    record: {
      version: RECORD_VERSION,
      best,
      rank,
      history: history.slice(-MAX_HISTORY),
      missKeys: Object.fromEntries(entries) as Record<string, number>,
    },
  };
}
