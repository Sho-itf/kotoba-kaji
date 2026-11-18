import { describe, expect, it } from "vitest";
import {
  applyRun, claimedRank, deriveRank, emptyRecord, MAX_HISTORY, parseRecord, serializeRecord, type RecordData, type Run,
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
    ["版が違う", JSON.stringify({ ...emptyRecord(), version: 3 })],
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

/** 正確さ(10 倍の整数 tenths)になる稽古。合計 2000 打。 */
function runAt(score: number, tenths: number, at = "2026-11-18T10:00:00.000Z"): Run {
  const keystrokes = Math.max(score, Math.ceil((tenths * 2000) / 1000));
  return { at, keystrokes, misses: 2000 - keystrokes, accuracy: keystrokes / 2000, score, sentences: 5, ippon: 1 };
}

describe("名乗る位", () => {
  it("まだ位が無ければ十級", () => {
    expect(claimedRank(emptyRecord()).name).toBe("十級");
  });

  it("取れた位を、日時といっしょに持つ", () => {
    const r = applyRun(emptyRecord(), runAt(250, 960, "2026-11-18T10:00:00.000Z"), {}).record;
    expect(r.rank).toEqual({ name: "初段", at: "2026-11-18T10:00:00.000Z" });
    expect(claimedRank(r).name).toBe("初段");
  });

  it("正確さが足りない回は、スコアに見合う段にならない(スコア 240・70% → 一級)", () => {
    const r = applyRun(emptyRecord(), runAt(240, 700), {}).record;
    expect(r.rank?.name).toBe("一級");
    expect(r.best?.score).toBe(240); // ベストのスコアは別に持つ
    // スコア 320・86% → 二段
    expect(applyRun(emptyRecord(), runAt(320, 860), {}).record.rank?.name).toBe("二段");
  });

  it("名乗る位は下がらない(低い回のあとでも、高い位のまま)", () => {
    let r = applyRun(emptyRecord(), runAt(300, 970, "2026-11-18T10:00:00.000Z"), {}).record;
    expect(r.rank?.name).toBe("三段");
    r = applyRun(r, runAt(100, 990, "2026-11-19T10:00:00.000Z"), {}).record;
    expect(r.rank).toEqual({ name: "三段", at: "2026-11-18T10:00:00.000Z" });
    r = applyRun(r, runAt(0, 0, "2026-11-20T10:00:00.000Z"), {}).record;
    expect(r.rank?.name).toBe("三段");
  });

  it("同じ位をもう一度取っても、日時は最初のまま。上の位を取ると更新する", () => {
    let r = applyRun(emptyRecord(), runAt(230, 950, "2026-11-18T10:00:00.000Z"), {}).record;
    r = applyRun(r, runAt(235, 951, "2026-11-19T10:00:00.000Z"), {}).record;
    expect(r.rank).toEqual({ name: "初段", at: "2026-11-18T10:00:00.000Z" });
    r = applyRun(r, runAt(260, 950, "2026-11-20T10:00:00.000Z"), {}).record;
    expect(r.rank).toEqual({ name: "二段", at: "2026-11-20T10:00:00.000Z" });
  });

  it("スコア 0 の回では、位を取らない", () => {
    expect(applyRun(emptyRecord(), runAt(0, 0), {}).record.rank).toBeNull();
  });
});

describe("古い版(1 版)の記録の移し替え", () => {
  const v1 = (best: Run | null, history: Run[]) =>
    JSON.stringify({ version: 1, best, history, missKeys: { "か:k": 2 } });

  it("名乗る位を、ベストと履歴から計算し直す", () => {
    const history = [runAt(100, 990, "2026-11-01T00:00:00.000Z"), runAt(310, 970, "2026-11-02T00:00:00.000Z"), runAt(150, 900, "2026-11-03T00:00:00.000Z")];
    const parsed = parseRecord(v1(history[1], history));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.record.version).toBe(2);
      expect(parsed.record.rank).toEqual({ name: "三段", at: "2026-11-02T00:00:00.000Z" });
      expect(parsed.record.history).toEqual(history);
      expect(parsed.record.missKeys).toEqual({ "か:k": 2 });
    }
  });

  it("正確さが足りない段を名乗っていた人は、下がる(仕様どおり)", () => {
    // 古い版では、スコア 300 だけで三段だった。正確さ 70% では、新しい決め方では一級。
    const run = runAt(300, 700, "2026-11-02T00:00:00.000Z");
    const parsed = parseRecord(v1(run, [run]));
    expect(parsed.ok && parsed.record.rank?.name).toBe("一級");
    expect(parsed.ok && parsed.record.best?.score).toBe(300);
  });

  it("ベストだけで履歴が無い(履歴からあふれた)記録も、ベストから位を出す", () => {
    const parsed = parseRecord(v1(runAt(240, 960), []));
    expect(parsed.ok && parsed.record.rank?.name).toBe("初段");
  });

  it("空の記録は位なし", () => {
    const parsed = parseRecord(v1(null, []));
    expect(parsed.ok && parsed.record.rank).toBeNull();
  });

  it("おかしな 1 版は、今までどおり断る", () => {
    expect(parseRecord(v1(runAt(10, 900, "きのう"), [])).ok).toBe(false);
    expect(parseRecord(JSON.stringify({ version: 1, best: null, history: [], missKeys: { __proto__x: 1 } })).ok).toBe(false);
  });

  it("localStorage に残っていた 1 版も、読むときに移し替える", () => {
    const store = memoryStore();
    const run = runAt(240, 960);
    store.setItem(STORAGE_KEY, v1(run, [run]));
    const loaded = loadRecord(store);
    expect(loaded.broken).toBe(false);
    expect(loaded.record.version).toBe(2);
    expect(loaded.record.rank?.name).toBe("初段");
  });

  it("deriveRank は、同じ位が続くときは最初の日時を使う", () => {
    const a = runAt(240, 960, "2026-11-01T00:00:00.000Z");
    const b = runAt(250, 960, "2026-11-05T00:00:00.000Z");
    expect(deriveRank(b, [b, a])).toEqual({ name: "初段", at: "2026-11-01T00:00:00.000Z" });
  });
});

describe("2 版の取り込みの確かめ(位)", () => {
  const base = () => applyRun(emptyRecord(), runAt(300, 970), {}).record;

  it("書き出して取り込むと、位も元に戻る", () => {
    const r = base();
    expect(parseRecord(serializeRecord(r))).toEqual({ ok: true, record: r });
  });

  it.each([
    ["位の日時がおかしい", { name: "三段", at: "きのう" }],
    ["位が文字列", "三段"],
    ["位が空の形", {}],
  ])("断る:%s", (_name, rank) => {
    const text = JSON.stringify({ ...base(), rank });
    expect(parseRecord(text).ok).toBe(false);
  });

  it("ベストがあるのに位が無い記録は断る", () => {
    expect(parseRecord(JSON.stringify({ ...base(), rank: null })).ok).toBe(false);
    expect(parseRecord(JSON.stringify({ ...base(), rank: undefined })).ok).toBe(false);
  });
});

describe("表を変えたとき(前の表の記録を、今の表で読む)", () => {
  const rec = (rank: { name: string; at: string } | null, best: Run | null, history: Run[]) =>
    JSON.stringify({ version: 2, best, rank, history, missKeys: {} });

  it("前の表で一級だった記録(スコア 240・正確さ 93%)は、今の表では初段になる", () => {
    const run = runAt(240, 930, "2026-11-05T00:00:00.000Z");
    const parsed = parseRecord(rec({ name: "一級", at: "2026-11-05T00:00:00.000Z" }, run, [run]));
    expect(parsed.ok && parsed.record.rank).toEqual({ name: "初段", at: "2026-11-05T00:00:00.000Z" });
  });

  it("保存されている位が、計算し直した位より高いときは、保存されている方が残る", () => {
    const low = runAt(100, 990, "2026-11-05T00:00:00.000Z");
    const stored = { name: "五段", at: "2026-10-01T00:00:00.000Z" };
    const parsed = parseRecord(rec(stored, low, [low]));
    expect(parsed.ok && parsed.record.rank).toEqual(stored);
  });

  it("同じ位なら、保存されている日時を残す", () => {
    const run = runAt(240, 930, "2026-11-05T00:00:00.000Z");
    const stored = { name: "初段", at: "2026-11-01T00:00:00.000Z" };
    const parsed = parseRecord(rec(stored, run, [run]));
    expect(parsed.ok && parsed.record.rank).toEqual(stored);
  });

  it("保存されている位の名前が今の表に無いときは、落ちずに、計算し直した位を使う", () => {
    const run = runAt(300, 900, "2026-11-05T00:00:00.000Z");
    const parsed = parseRecord(rec({ name: "百段", at: "2026-11-01T00:00:00.000Z" }, run, [run]));
    expect(parsed.ok && parsed.record.rank).toEqual({ name: "三段", at: "2026-11-05T00:00:00.000Z" });
    // 履歴もベストも無いなら、位なし
    const empty = parseRecord(rec({ name: "百段", at: "2026-11-01T00:00:00.000Z" }, null, []));
    expect(empty.ok && empty.record.rank).toBeNull();
    expect(claimedRank({ ...emptyRecord(), rank: { name: "百段", at: "2026-11-01T00:00:00.000Z" } }).name).toBe("十級");
  });

  it("localStorage の記録も、読むときに今の表で計算し直す", () => {
    const store = memoryStore();
    const run = runAt(240, 930);
    store.setItem(STORAGE_KEY, rec({ name: "一級", at: run.at }, run, [run]));
    expect(loadRecord(store).record.rank?.name).toBe("初段");
  });
});
