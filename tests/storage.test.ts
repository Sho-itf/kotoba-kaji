import { describe, expect, it } from "vitest";
import {
  applyRun, emptyRecord, MAX_HISTORY, parseRecord, serializeRecord, type RecordData, type Run,
} from "../src/storage/record.ts";
import {
  BROKEN_KEY_PREFIX, commitRun, loadRecord, saveRecord, STORAGE_KEY, type KeyValueStore,
} from "../src/storage/store.ts";

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
    expect(loadRecord(store)).toEqual({ record: r, broken: false });
  });

  it("何も無いときは空の記録", () => {
    expect(loadRecord(memoryStore())).toEqual({ record: emptyRecord(), broken: false });
  });

  it("使えないとき(null・例外)でも落ちない", () => {
    expect(loadRecord(null).record).toEqual(emptyRecord());
    expect(saveRecord(null, emptyRecord())).toBe(false);
    expect(loadRecord(throwing).record).toEqual(emptyRecord());
    expect(saveRecord(throwing, emptyRecord())).toBe(false);
  });
});

describe("読めない記録を黙って上書きしない", () => {
  const now = new Date("2026-11-18T12:34:56.000Z");

  it("元の文字列を別のキーに残し、空の記録で始める", () => {
    const store = memoryStore();
    store.setItem(STORAGE_KEY, "{こわれた");
    const loaded = loadRecord(store, now);
    expect(loaded).toEqual({ record: emptyRecord(), broken: true });
    expect(store.map.get(BROKEN_KEY_PREFIX + now.toISOString())).toBe("{こわれた");
    // もう一度読み込んでも、壊れた扱いを重ねない
    expect(loadRecord(store, new Date("2026-11-19T00:00:00.000Z")).broken).toBe(false);
    expect([...store.map.keys()].filter((k) => k.startsWith(BROKEN_KEY_PREFIX)).length).toBe(1);
  });

  it("版が違う記録も、残してから始める", () => {
    const store = memoryStore();
    const old = JSON.stringify({ ...emptyRecord(), version: 99 });
    store.setItem(STORAGE_KEY, old);
    expect(loadRecord(store, now).broken).toBe(true);
    expect(store.map.get(BROKEN_KEY_PREFIX + now.toISOString())).toBe(old);
  });

  it("残せなかったときは、元の記録を消さない", () => {
    const map = new Map<string, string>([[STORAGE_KEY, "{こわれた"]]);
    const store: KeyValueStore = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => { if (k.startsWith(BROKEN_KEY_PREFIX)) throw new Error("いっぱい"); map.set(k, v); },
    };
    expect(loadRecord(store, now).broken).toBe(true);
    expect(map.get(STORAGE_KEY)).toBe("{こわれた");
  });
});

describe("保存の直前に読み直して足す", () => {
  it("タブを 2 つ開いても、片方の記録が消えない", () => {
    const store = memoryStore();
    const tabA = loadRecord(store).record; // どちらも空の記録で始まる
    const tabB = loadRecord(store).record;
    const a = commitRun(store, tabA, run(100), { "か:k": 1 });
    const b = commitRun(store, tabB, run(80), { "き:k": 2 });
    expect(b.record.history.map((r) => r.score)).toEqual([100, 80]);
    expect(b.record.best?.score).toBe(100);
    expect(b.record.missKeys).toEqual({ "か:k": 1, "き:k": 2 });
    expect(b.newBest).toBe(false); // 読み直した記録のベスト(100)を超えていない
    expect(b.previous.best?.score).toBe(100);
    expect(a.saved && b.saved).toBe(true);
    expect(loadRecord(store).record).toEqual(b.record);
  });

  it("保存されている記録が無いときは、手元の記録に足す", () => {
    const memory = applyRun(emptyRecord(), run(50), {}).record;
    const out = commitRun(memoryStore(), memory, run(60), {});
    expect(out.record.history.map((r) => r.score)).toEqual([50, 60]);
  });

  it("使えない環境でも、手元の記録に足せる", () => {
    const out = commitRun(null, emptyRecord(), run(60), {});
    expect(out.record.best?.score).toBe(60);
    expect(out.saved).toBe(false);
    expect(commitRun(throwing, emptyRecord(), run(60), {}).saved).toBe(false);
  });

  it("保存されている記録が壊れていたら、残してから足す", () => {
    const store = memoryStore();
    store.setItem(STORAGE_KEY, "こわれた");
    const now = new Date("2026-11-18T01:00:00.000Z");
    const out = commitRun(store, emptyRecord(), run(60), {}, now);
    expect(store.map.get(BROKEN_KEY_PREFIX + now.toISOString())).toBe("こわれた");
    expect(out.record.best?.score).toBe(60);
  });
});

describe("スコア 0 の回", () => {
  it("履歴に残さない(ミスしたキーの合計は足す)", () => {
    const out = applyRun(emptyRecord(), run(0, { keystrokes: 0, misses: 3, accuracy: 0 }), { "か:k": 3 });
    expect(out.record.history).toEqual([]);
    expect(out.record.best).toBeNull();
    expect(out.record.missKeys).toEqual({ "か:k": 3 });
  });
});

describe("取り込みの確かめ(つじつま)", () => {
  const withMiss = (missKeys: object) => JSON.stringify({ ...emptyRecord(), missKeys });
  it.each([
    ["__proto__ という名前", '{"version":1,"best":null,"history":[],"missKeys":{"__proto__":1}}'],
    ["constructor という名前", withMiss({ constructor: 1 })],
    ["「かな:キー」の形でない", withMiss({ かき: 1 })],
    ["かなが長すぎる", withMiss({ "あいうえおかきくけ:k": 1 })],
    ["キーが長すぎる", withMiss({ "か:kk": 1 })],
    ["キーが空", withMiss({ "か:": 1 })],
    ["スコアが打鍵数より大きい", JSON.stringify({ ...emptyRecord(), history: [run(10, { keystrokes: 5 })] })],
    ["一本が文の数より大きい", JSON.stringify({ ...emptyRecord(), history: [run(10, { ippon: 9, sentences: 3 })] })],
    ["日時が日時でない", JSON.stringify({ ...emptyRecord(), history: [run(10, { at: "きのう" })] })],
    ["日時が存在しない日", JSON.stringify({ ...emptyRecord(), history: [run(10, { at: "2026-13-45T10:00:00Z" })] })],
    ["ベストのスコアが打鍵数より大きい", JSON.stringify({ ...emptyRecord(), best: run(10, { keystrokes: 5 }) })],
  ])("断る:%s", (_name, text) => {
    const parsed = parseRecord(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.length).toBeGreaterThan(0);
  });

  it("正しい形のミスのキーは通る", () => {
    const parsed = parseRecord(withMiss({ "しゃ:y": 2, "ー:-": 1, "っ、た:t": 1 }));
    expect(parsed.ok).toBe(true);
  });
});
