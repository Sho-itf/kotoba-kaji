import { describe, expect, it } from "vitest";
import {
  applyRun, emptyRecord, MAX_HISTORY, parseRecord, serializeRecord, type RecordData, type Run,
} from "../src/storage/record.ts";
import { loadRecord, saveRecord, STORAGE_KEY, type KeyValueStore } from "../src/storage/store.ts";

function run(score: number, extra: Partial<Run> = {}): Run {
  return { at: "2026-11-18T10:00:00.000Z", keystrokes: score, misses: 0, accuracy: 1, score, sentences: 3, ippon: 1, ...extra };
}

function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

const throwing: KeyValueStore = {
  getItem() { throw new Error("使えない"); },
  setItem() { throw new Error("使えない"); },
};

describe("記録の更新", () => {
  it("ベストは、スコアが上回ったときだけ更新する", () => {
    let r = emptyRecord();
    let out = applyRun(r, run(100), {});
    expect(out.newBest).toBe(true);
    r = out.record;
    out = applyRun(r, run(80), {});
    expect(out.newBest).toBe(false);
    expect(out.record.best?.score).toBe(100);
    out = applyRun(out.record, run(100), {});
    expect(out.newBest).toBe(false); // 同点は更新しない
    out = applyRun(out.record, run(101), {});
    expect(out.record.best?.score).toBe(101);
  });

  it("スコア 0 はベストにしない", () => {
    expect(applyRun(emptyRecord(), run(0), {}).record.best).toBeNull();
  });

  it("履歴は直近 100 回まで、ミスのキーは合計する", () => {
    let r: RecordData = emptyRecord();
    for (let i = 0; i < 105; i++) r = applyRun(r, run(i + 1), { "か:k": 1 }).record;
    expect(r.history.length).toBe(MAX_HISTORY);
    expect(r.history[0].score).toBe(6);
    expect(r.missKeys["か:k"]).toBe(105);
  });

  it("元の記録は変えない", () => {
    const r = emptyRecord();
    applyRun(r, run(50), { "か:k": 1 });
    expect(r).toEqual(emptyRecord());
  });
});

describe("書き出しと取り込み", () => {
  it("書き出した JSON を取り込むと、元に戻る", () => {
    let r = emptyRecord();
    r = applyRun(r, run(120, { accuracy: 0.95 }), { "しゃ:h": 2 }).record;
    r = applyRun(r, run(90), { "か:k": 1 }).record;
    const parsed = parseRecord(serializeRecord(r));
    expect(parsed).toEqual({ ok: true, record: r });
  });

  it("空の記録も取り込める", () => {
    expect(parseRecord(serializeRecord(emptyRecord()))).toEqual({ ok: true, record: emptyRecord() });
  });

  it.each([
    ["JSON でない", "これは JSON ではない"],
    ["配列", "[]"],
    ["null", "null"],
    ["版が違う", JSON.stringify({ ...emptyRecord(), version: 2 })],
    ["版が無い", JSON.stringify({ best: null, history: [], missKeys: {} })],
    ["ベストの中身がおかしい", JSON.stringify({ ...emptyRecord(), best: { score: "高い" } })],
    ["履歴が配列でない", JSON.stringify({ ...emptyRecord(), history: {} })],
    ["履歴の中身がおかしい", JSON.stringify({ ...emptyRecord(), history: [run(10, { accuracy: 5 })] })],
    ["負の数", JSON.stringify({ ...emptyRecord(), history: [run(10, { misses: -1 })] })],
    ["ミスの回数が数でない", JSON.stringify({ ...emptyRecord(), missKeys: { "か:k": "多い" } })],
  ])("おかしなファイルを断る:%s", (_name, text) => {
    const parsed = parseRecord(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.length).toBeGreaterThan(0);
  });

  it("履歴が多すぎるときは、直近 100 回に切る", () => {
    const history = Array.from({ length: 150 }, (_, i) => run(i + 1));
    const parsed = parseRecord(JSON.stringify({ ...emptyRecord(), history }));
    expect(parsed.ok && parsed.record.history.length).toBe(MAX_HISTORY);
  });
});

describe("localStorage", () => {
  it("保存と読み込み", () => {
    const store = memoryStore();
    const r = applyRun(emptyRecord(), run(77), { "か:k": 3 }).record;
    expect(saveRecord(store, r)).toBe(true);
    expect(store.map.has(STORAGE_KEY)).toBe(true);
    expect(loadRecord(store)).toEqual(r);
  });

  it("何も無いときは空の記録", () => {
    expect(loadRecord(memoryStore())).toEqual(emptyRecord());
  });

  it("壊れた中身は空の記録にする", () => {
    const store = memoryStore();
    store.setItem(STORAGE_KEY, "{こわれた");
    expect(loadRecord(store)).toEqual(emptyRecord());
  });

  it("使えないとき(null・例外)でも落ちない", () => {
    expect(loadRecord(null)).toEqual(emptyRecord());
    expect(saveRecord(null, emptyRecord())).toBe(false);
    expect(loadRecord(throwing)).toEqual(emptyRecord());
    expect(saveRecord(throwing, emptyRecord())).toBe(false);
  });
});
