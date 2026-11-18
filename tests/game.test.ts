import { describe, expect, it } from "vitest";
import data from "../public/sentences.json";
import { Deck } from "../src/game/deck.ts";
import { highlightRange } from "../src/game/highlight.ts";
import { Keiko } from "../src/game/keiko.ts";
import { accuracyTenths, nextRankAfter, RANKS, rankByName, rankByScoreOnly, rankOfRun } from "../src/game/ranks.ts";
import { calcScore, topMisses } from "../src/game/score.ts";
import { parseSentences, type Sentence } from "../src/game/sentences.ts";

function sentence(key: string, kana: string, text = kana): Sentence {
  return { key, word: key, wordReading: kana, meaning: "意味", text, kana, category: "", difficulty: 1 };
}

describe("スコアと正確さ", () => {
  it("打鍵数 × 正確さ(切り捨て)", () => {
    expect(calcScore(100, 0)).toEqual({ accuracy: 1, score: 100 });
    expect(calcScore(90, 10)).toEqual({ accuracy: 0.9, score: 81 });
    expect(calcScore(3, 1)).toEqual({ accuracy: 0.75, score: 2 }); // 2.25 → 2
    expect(calcScore(199, 1).score).toBe(198); // 199 × 0.995 = 198.005
  });

  it("0 打鍵でも 0 で割らない", () => {
    expect(calcScore(0, 0)).toEqual({ accuracy: 0, score: 0 });
    expect(calcScore(0, 5)).toEqual({ accuracy: 0, score: 0 });
  });
});

/** 打鍵数 1000 のうち、ミス m 回の稽古(正確さ = 1000 ÷ (1000 + m))を作る代わりに、正確さの 10 倍の整数から作る */
function runWith(score: number, tenths: number) {
  // 正確さ tenths/10 % になる打鍵数とミスの数(合計 2000 打)
  const total = 2000;
  const keystrokes = Math.ceil((tenths * total) / 1000);
  return { score, keystrokes, misses: total - keystrokes };
}

describe("位", () => {
  it("級はスコアだけで決まる(正確さは見ない)", () => {
    for (const [score, name] of [
      [0, "十級"], [39, "十級"], [40, "九級"], [59, "九級"], [60, "八級"], [199, "二級"], [200, "一級"], [229, "一級"],
    ] as const) {
      expect(rankOfRun(runWith(score, 0)).name).toBe(name);
      expect(rankOfRun(runWith(score, 1000)).name).toBe(name);
    }
  });

  it("段の境目:スコアと正確さの両方が要る", () => {
    // 初段 230 / 80.0%
    expect(rankOfRun(runWith(230, 800)).name).toBe("初段");
    expect(rankOfRun(runWith(229, 1000)).name).toBe("一級");
    expect(rankOfRun(runWith(230, 799)).name).toBe("一級");
    // 三段 300 / 87.5%
    expect(rankOfRun(runWith(300, 875)).name).toBe("三段");
    expect(rankOfRun(runWith(300, 874)).name).toBe("二段");
    // 十段 600 / 96.0%
    expect(rankOfRun(runWith(600, 960)).name).toBe("十段");
    expect(rankOfRun(runWith(600, 959)).name).toBe("九段");
    expect(rankOfRun(runWith(599, 1000)).name).toBe("九段");
    expect(rankOfRun(runWith(5000, 1000)).name).toBe("十段");
  });

  it("正確さが足りないと、スコアに見合う段より下になる", () => {
    // スコア 240・正確さ 70% → 一級(初段は 80% が要る)
    expect(rankOfRun(runWith(240, 700)).name).toBe("一級");
    // スコア 320・正確さ 86% → 二段(三段は 87.5% が要る)
    expect(rankOfRun(runWith(320, 860)).name).toBe("二段");
    expect(rankByScoreOnly(320).name).toBe("三段");
    // スコア 240・正確さ 93% は、新しい表では初段
    expect(rankOfRun(runWith(240, 930)).name).toBe("初段");
  });

  it("正確さは、画面に出す値(小数第 1 位まで、それ以下は切り捨て)で比べる", () => {
    // 正確さ 79.996% は、画面では 79.9% なので、初段(80.0%)に届かない
    expect(accuracyTenths(79996, 20004)).toBe(799);
    expect(rankOfRun({ score: 230, keystrokes: 79996, misses: 20004 }).name).toBe("一級");
    // ちょうど 80.0%
    expect(accuracyTenths(80, 20)).toBe(800);
    expect(rankOfRun({ score: 230, keystrokes: 80, misses: 20 }).name).toBe("初段");
    // 割り切れない値も、整数で数えるので誤差が出ない
    expect(accuracyTenths(19, 1)).toBe(950);
    expect(accuracyTenths(0, 0)).toBe(0);
    expect(accuracyTenths(0, 5)).toBe(0);
  });

  it("段の表:スコアの下限も正確さの下限も、上がる向きに並ぶ", () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].min).toBeGreaterThan(RANKS[i - 1].min);
      expect(RANKS[i].minAccuracy).toBeGreaterThanOrEqual(RANKS[i - 1].minAccuracy);
    }
    expect(RANKS.filter((r) => r.dan).map((r) => r.name)).toEqual([
      "初段", "二段", "三段", "四段", "五段", "六段", "七段", "八段", "九段", "十段",
    ]);
    expect(rankByName("三段")).toMatchObject({ min: 300, minAccuracy: 87.5 });
    expect(rankByName("十段")).toMatchObject({ min: 600, minAccuracy: 96 });
  });

  it("次の位", () => {
    expect(nextRankAfter(RANKS[0])?.name).toBe("九級");
    expect(nextRankAfter(rankByName("一級")!)?.name).toBe("初段");
    expect(nextRankAfter(rankByName("十段")!)).toBeNull();
  });
});

describe("お題の選び方", () => {
  const list = Array.from({ length: 50 }, (_, i) => sentence(`s${i}`, "あ"));

  it("1 周のあいだは同じ文が出ない", () => {
    const deck = new Deck(list);
    const seen = new Set<string>();
    for (let i = 0; i < list.length; i++) seen.add(deck.next().key);
    expect(seen.size).toBe(list.length);
  });

  it("1 周したあとも、続けて同じ文は出ない", () => {
    const deck = new Deck(list, () => 0);
    let prev = "";
    for (let i = 0; i < list.length * 3; i++) {
      const k = deck.next().key;
      expect(k).not.toBe(prev);
      prev = k;
    }
  });

  it("実際の例文でも重ならない", () => {
    const deck = new Deck(parseSentences(data));
    const keys = new Set<string>();
    for (let i = 0; i < 200; i++) keys.add(deck.next().key);
    expect(keys.size).toBe(200);
  });
});

describe("強調の決め方", () => {
  const text = (t: string, w: string, r: string) => {
    const range = highlightRange(t, w, r);
    return range ? t.slice(range.start, range.end) : null;
  };

  it("word がそのまま文にあれば、その部分", () => {
    expect(text("相手の主張に真っ向から反駁する", "反駁", "はんばく")).toBe("反駁");
  });
  it("無ければ、wordReading の部分(敢えて → あえて)", () => {
    expect(text("彼女はあえて反対意見を述べた", "敢えて", "あえて")).toBe("あえて");
  });
  it("無ければ、語の頭から一致するいちばん長い部分(論う → 論)", () => {
    expect(text("細かい欠点を論っても議論は進まない", "論う", "あげつらう")).toBe("論");
    expect(text("どうも腑に落ちない話だ", "腑に落ちる", "ふにおちる")).toBe("腑に落ち");
  });
  it("どれも無ければ、強調しない", () => {
    expect(highlightRange("まったく関係のない文", "論う", "あげつらう")).toBeNull();
  });
  it("実際の例文は、すべて強調する部分が見つかる", () => {
    const none = parseSentences(data).filter((s) => !highlightRange(s.text, s.word, s.wordReading));
    expect(none.map((s) => s.key)).toEqual([]);
  });
});

describe("稽古の進行", () => {
  it("ミスと打鍵を数え、一本を数える", () => {
    const k = new Keiko([sentence("a", "かき")], () => 0);
    expect(k.input("k").result).toBe("progress");
    expect(k.input("x").result).toBe("miss"); // 正しくは a
    k.input("a");
    k.input("k");
    const last = k.input("i");
    expect(last.result).toBe("complete");
    expect(last.finished?.ippon).toBe(false); // ミスがあったので一本ではない
    const r = k.result();
    expect(r.keystrokes).toBe(4);
    expect(r.misses).toBe(1);
    expect(r.sentences).toBe(1);
    expect(r.ippon).toBe(0);
    expect(r.score).toBe(Math.floor((4 * 4) / 5));
  });

  it("ミスなしで打ち終えた文は一本", () => {
    const k = new Keiko([sentence("a", "あ"), sentence("b", "い")], () => 0);
    const first = k.sentence.kana;
    const res = k.input(first === "あ" ? "a" : "i");
    expect(res.finished?.ippon).toBe(true);
    expect(k.result().ippon).toBe(1);
    expect(k.previous?.sentence.kana).toBe(first);
    expect(k.sentence.kana).not.toBe(first); // 次のお題へ進んでいる
  });

  it("記号だけの読みの文は出さない", () => {
    const k = new Keiko([sentence("x", "。。"), sentence("y", "あ")], () => 0);
    expect(k.sentence.key).toBe("y");
  });

  it("ミスしたキーを、稽古 1 回ぶん足し合わせる", () => {
    const k = new Keiko([sentence("a", "しゃ")], () => 0);
    k.input("s");
    k.input("x");
    k.input("x");
    k.input("z");
    k.input("h");
    k.input("a");
    expect(k.result().missKeys).toEqual({ "しゃ:h": 3 });
    expect(k.result().misses).toBe(3);
    // 次の文でも足していく
    k.input("s");
    k.input("x");
    expect(k.result().missKeys["しゃ:h"]).toBe(4);
  });

  it("文字でないキーは数えない", () => {
    const k = new Keiko([sentence("a", "あ")], () => 0);
    expect(k.input("Shift").result).toBe("ignored");
    expect(k.result().keystrokes + k.result().misses).toBe(0);
  });

  it("ミスの上位を多い順に出す", () => {
    expect(topMisses({ "か:k": 2, "き:k": 5, "く:k": 1, "け:k": 0 }, 2)).toEqual([
      { kana: "き", key: "k", count: 5 },
      { kana: "か", key: "k", count: 2 },
    ]);
  });
});

describe("例文データ", () => {
  it("読み込み時に形を確かめる", () => {
    expect(parseSentences(data).length).toBe(1538);
    expect(() => parseSentences({})).toThrow();
    expect(() => parseSentences({ sentences: [{ key: "a" }] })).toThrow();
  });
});
