// localStorage への保存と読み込み。使えない・壊れているときも、落ちずに空の記録で遊べる。

import { applyRun, emptyRecord, parseRecord, serializeRecord, type RecordData, type Run } from "./record.ts";

export const STORAGE_KEY = "kotoba-kaji:record";
/** 読めなかった記録の、元の文字列を残しておくキーの頭(あとに日時が付く) */
export const BROKEN_KEY_PREFIX = "kotoba-kaji:broken:";

/** localStorage のうち、使う部分だけ(テストで差し替えられる) */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** localStorage を取り出す。使えない(プライベートモードなど)ときは null。 */
export function getLocalStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

type Stored = { kind: "none" } | { kind: "ok"; record: RecordData } | { kind: "broken"; raw: string };

function readStored(store: KeyValueStore): Stored {
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw === null) return { kind: "none" };
    const parsed = parseRecord(raw);
    return parsed.ok ? { kind: "ok", record: parsed.record } : { kind: "broken", raw };
  } catch {
    return { kind: "none" };
  }
}

/** 読めなかった記録の元の文字列を、別のキーに残す。残せたら true。 */
function keepBroken(store: KeyValueStore, raw: string, now: Date): boolean {
  try {
    store.setItem(BROKEN_KEY_PREFIX + now.toISOString(), raw);
    return true;
  } catch {
    return false;
  }
}

export interface LoadResult {
  record: RecordData;
  /** 保存されていた記録が読めなかった(元の文字列は別のキーに残してある)とき true */
  broken: boolean;
}

/** 記録を読み込む。無い・使えないときは空の記録。読めないときは、元の文字列を残してから空の記録で始める。 */
export function loadRecord(store: KeyValueStore | null, now: Date = new Date()): LoadResult {
  if (!store) return { record: emptyRecord(), broken: false };
  const stored = readStored(store);
  if (stored.kind === "ok") return { record: stored.record, broken: false };
  if (stored.kind === "none") return { record: emptyRecord(), broken: false };
  // 読めない記録は、黙って上書きしない。残せたときだけ、空の記録に置き換える(次の読み込みで重ねて残さないため)。
  if (keepBroken(store, stored.raw, now)) saveRecord(store, emptyRecord());
  return { record: emptyRecord(), broken: true };
}

/** 記録を保存する。保存できたら true。 */
export function saveRecord(store: KeyValueStore | null, record: RecordData): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, serializeRecord(record));
    return true;
  } catch {
    return false;
  }
}

export interface CommitResult {
  record: RecordData;
  /** この回の前の記録(保存されていたものを読み直したもの) */
  previous: RecordData;
  newBest: boolean;
  saved: boolean;
}

/**
 * 稽古 1 回ぶんを足して保存する。
 * 保存の直前に、保存されている記録を読み直してから足す(タブを 2 つ開いていても、片方の記録が消えないように)。
 * 保存されている記録が無い・使えないときは、手元の記録(memory)に足す。
 */
export function commitRun(
  store: KeyValueStore | null,
  memory: RecordData,
  run: Run,
  missKeys: Record<string, number>,
  now: Date = new Date(),
): CommitResult {
  let base = memory;
  if (store) {
    const stored = readStored(store);
    if (stored.kind === "ok") base = stored.record;
    else if (stored.kind === "broken") keepBroken(store, stored.raw, now);
  }
  const applied = applyRun(base, run, missKeys);
  return { ...applied, previous: base, saved: saveRecord(store, applied.record) };
}
