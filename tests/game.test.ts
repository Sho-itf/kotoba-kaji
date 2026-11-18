import { describe, expect, it } from "vitest";
import data from "../public/sentences.json";
import { Deck } from "../src/game/deck.ts";
import { highlightRange } from "../src/game/highlight.ts";
import { Keiko } from "../src/game/keiko.ts";
import { nextRank, RANKS, rankOf } from "../src/game/ranks.ts";
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

describe("位", () => {
  it.each([
    [0, "十級"], [39, "十級"], [40, "九級"], [59, "九級"], [60, "八級"], [199, "二級"], [200, "一級"],
    [229, "一級"], [230, "初段"], [259, "初段"], [260, "二段"], [300, "三段"], [350, "四段"], [399, "四段"], [400, "五段"], [1000, "五段"],
  ])("スコア %i は %s", (score, name) => {
    expect(rankOf(score).name).toBe(name);
  });

  it("段だけが dan", () => {
    expect(RANKS.filter((r) => r.dan).map((r) => r.name)).toEqual(["初段", "二段", "三段", "四段", "五段"]);
  });

  it("次の位", () => {
    expect(nextRank(0)?.name).toBe("九級");
    expect(nextRank(229)?.name).toBe("初段");
    expect(nextRank(400)).toBeNull();
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
