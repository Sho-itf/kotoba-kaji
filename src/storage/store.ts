// localStorage への保存と読み込み。使えない・壊れているときも、落ちずに空の記録で遊べる。

import { emptyRecord, parseRecord, serializeRecord, type RecordData } from "./record.ts";

export const STORAGE_KEY = "kotoba-kaji:record";

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

/** 記録を読み込む。無い・壊れている・使えないときは、空の記録。 */
export function loadRecord(store: KeyValueStore | null): RecordData {
  if (!store) return emptyRecord();
  try {
    const text = store.getItem(STORAGE_KEY);
    if (text === null) return emptyRecord();
    const parsed = parseRecord(text);
    return parsed.ok ? parsed.record : emptyRecord();
  } catch {
    return emptyRecord();
  }
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
