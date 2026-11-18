import { describe, expect, it } from "vitest";
import { RomajiTyper, standardRomaji, toUnits } from "../src/romaji/index.ts";

/** keys を順に打ち、ミスなしで最後まで打てたかを確かめる */
function typeAll(kana: string, keys: string): RomajiTyper {
  const t = new RomajiTyper(kana);
  [...keys].forEach((k, i) => {
    const r = t.input(k);
    const want = i === keys.length - 1 ? "complete" : "progress";
    expect(r, `「${kana}」を ${keys} と打つ ${i + 1} 字目(${k})`).toBe(want);
  });
  expect(t.missCount).toBe(0);
  expect(t.typed).toBe(keys.toLowerCase());
  return t;
}

/** keys を打ったら、どこかでミスになることを確かめる */
function rejects(kana: string, keys: string): void {
  const t = new RomajiTyper(kana);
  const results = [...keys].map((k) => t.input(k));
  expect(results, `「${kana}」を ${keys} と打つとミスになること`).toContain("miss");
}

describe("1 字の綴り", () => {
  it.each([
    ["し", ["shi", "si", "ci"]],
    ["ち", ["chi", "ti"]],
    ["つ", ["tsu", "tu"]],
    ["ふ", ["fu", "hu"]],
    ["じ", ["ji", "zi"]],
    ["を", ["wo"]],
    ["ぢ", ["di"]],
    ["づ", ["du"]],
    ["ゔ", ["vu"]],
    ["か", ["ka", "ca"]],
  ])("%s", (kana, list) => {
    for (const r of list) typeAll(kana, r);
    expect(standardRomaji(kana)).toBe(list[0]);
  });
});

describe("拗音", () => {
  it.each([
    ["しゃ", ["sha", "sya"]],
    ["ちゃ", ["cha", "tya", "cya"]],
    ["じゃ", ["ja", "zya", "jya"]],
    ["きょ", ["kyo"]],
    ["てぃ", ["thi"]],
    ["ふぁ", ["fa"]],
  ])("%s", (kana, list) => {
    for (const r of list) typeAll(kana, r);
    expect(standardRomaji(kana)).toBe(list[0]);
  });

  it("分けて打てる(ki + xya など)", () => {
    typeAll("きゃ", "kixya");
    typeAll("きゃ", "kilya");
    typeAll("しょ", "shixyo");
    typeAll("じゅ", "zilyu");
    typeAll("ちぇ", "tixe");
  });

  it("分けて打つと、き を打ち終えた時点でかなが 1 字進む", () => {
    const t = new RomajiTyper("きゃ");
    t.input("k");
    expect(t.kanaDone).toBe(0);
    t.input("i");
    expect(t.kanaDone).toBe(1);
    expect(t.remaining).toBe("xya");
  });
});

describe("小さい字", () => {
  it("単独で打てる", () => {
    typeAll("ぁ", "xa");
    typeAll("ぁ", "la");
    typeAll("ぃ", "xi");
    typeAll("ゃ", "xya");
    typeAll("ゅ", "lyu");
    typeAll("ょ", "xyo");
    typeAll("ゎ", "xwa");
  });
});

describe("ん", () => {
  it("次が子音なら n 1 回でよい", () => {
    typeAll("かんじ", "kanji");
    typeAll("かんじ", "kannji");
    typeAll("かんじ", "kaxnji");
    expect(standardRomaji("かんじ")).toBe("kanji");
  });

  it("次が母音・な行・や行・ん なら nn が要る", () => {
    for (const [kana, std] of [
      ["きんえん", "kinnenn"],
      ["こんな", "konnna"],
      ["こんや", "konnya"],
      ["ほんにん", "honnninn"],
      ["あんい", "anni"],
      ["かんの", "kannno"],
    ]) {
      expect(standardRomaji(kana)).toBe(std);
      typeAll(kana, std);
    }
    rejects("きんえん", "kinen");
    rejects("こんや", "konya");
    rejects("こんな", "konna");
  });

  it("文末は nn が要る", () => {
    expect(standardRomaji("ほん")).toBe("honn");
    typeAll("ほん", "honn");
    typeAll("ほん", "hoxn");
    const t = new RomajiTyper("ほん");
    for (const k of "hon") t.input(k);
    expect(t.done).toBe(false);
  });

  it("記号の手前は、その先の字で決める", () => {
    typeAll("ほん。", "honn");
    typeAll("ほん、かく", "honkaku");
    typeAll("ほん、あ", "honna");
    rejects("ほん、あ", "hona");
  });

  it("n を 1 回打って子音が来たら、ん は確定して次へ進む", () => {
    const t = new RomajiTyper("かんじ");
    for (const k of "kan") t.input(k);
    expect(t.kanaDone).toBe(2);
    expect(t.remaining).toBe("ji");
    expect(t.input("j")).toBe("progress");
    expect(t.typed).toBe("kanj");
  });

  it("n の後の y は、や行でなければ次の字(にゃ など)ではなく ん として扱わない", () => {
    // ん + きょ:n の後に k
    typeAll("べんきょう", "benkyou");
    // ん + にゅ:nn が要る
    typeAll("しんにゅう", "shinnnyuu");
    rejects("しんにゅう", "shinnyuu");
  });
});

describe("っ", () => {
  it("次の子音を重ねる", () => {
    typeAll("がっこう", "gakkou");
    typeAll("きって", "kitte");
    typeAll("ざっし", "zasshi");
    typeAll("ざっし", "zassi");
    typeAll("いっぱい", "ippai");
    typeAll("けっしょう", "kesshou");
    expect(standardRomaji("がっこう")).toBe("gakkou");
  });

  it("っち は cchi・tchi・tti", () => {
    typeAll("まっち", "macchi");
    typeAll("まっち", "matchi");
    typeAll("まっち", "matti");
    typeAll("まっちゃ", "maccha");
    typeAll("まっちゃ", "matcha");
    expect(standardRomaji("まっち")).toBe("macchi");
  });

  it("単独でも打てる", () => {
    typeAll("がっこう", "gaxtukou");
    typeAll("がっこう", "galtukou");
    typeAll("がっこう", "gaxtsukou");
    typeAll("がっこう", "galtsukou");
  });

  it("次が母音・な行・ん・文末なら単独だけ", () => {
    typeAll("あっあ", "axtua");
    typeAll("あっな", "axtuna");
    typeAll("あっ", "axtu");
    typeAll("あっん", "axtunn");
    expect(standardRomaji("あっ")).toBe("axtu");
    rejects("あっな", "anna");
    rejects("あっあ", "aaa");
  });

  it("っ を重ねた子音を打った時点で、っ のかなが進む", () => {
    const t = new RomajiTyper("がっこう");
    for (const k of "gak") t.input(k);
    expect(t.kanaDone).toBe(2);
    expect(t.remaining).toBe("kou");
  });
});

describe("ー と 記号", () => {
  it("ー は -", () => {
    typeAll("あいろにー", "aironi-");
  });

  it("記号は打たずに飛ばし、打鍵にもミスにも数えない", () => {
    const t = typeAll("「たしかに〜だが」という", "tashikanidagatoiu");
    expect(t.keystrokes).toBe("tashikanidagatoiu".length);
    expect(t.kanaDone).toBe("「たしかに〜だが」という".length);
  });

  it("先頭の記号も飛ばしておく", () => {
    const t = new RomajiTyper("「あ」");
    expect(t.kanaDone).toBe(1);
    expect(t.input("a")).toBe("complete");
    expect(t.kanaDone).toBe(3);
  });

  it("記号の打ち方は単位に入らない", () => {
    expect(toUnits("、。").every((u) => u.skip)).toBe(true);
  });
});

describe("入力の扱い", () => {
  it("間違ったキーでは進まず、ミスとして数える", () => {
    const t = new RomajiTyper("かき");
    expect(t.input("k")).toBe("progress");
    expect(t.input("i")).toBe("miss");
    expect(t.typed).toBe("k");
    expect(t.kanaDone).toBe(0);
    expect(t.input("a")).toBe("progress");
    expect(t.input("x")).toBe("miss");
    expect(t.input("x")).toBe("miss");
    expect(t.missCount).toBe(3);
    expect(t.misses[0]).toEqual({ kana: "か", expected: ["a"], counted: "a", typed: "i" });
    expect(t.misses[1]).toEqual({ kana: "き", expected: ["k"], counted: "k", typed: "x" });
    expect(t.missSummary().get("き:k")).toBe(2);
    expect(t.input("k")).toBe("progress");
    expect(t.input("i")).toBe("complete");
  });

  it("n を打った後のミスは、次の字のミスとして数える", () => {
    const t = new RomajiTyper("かんじ");
    for (const k of "kan") t.input(k);
    expect(t.input("q")).toBe("miss");
    // 正しいキーは、じ の j・z と、ん を nn にする n
    expect(t.misses[0]).toEqual({ kana: "じ", expected: ["j", "z", "n"], counted: "j", typed: "q" });
    // ミスの後も n のまま続けられる
    expect(t.input("j")).toBe("progress");
  });

  it("大文字は小文字として扱う", () => {
    typeAll("しゃしん", "SHASHINN");
    typeAll("しゃしん", "ShaSiNn");
  });

  it("文字でないキーと、打ち終えた後のキーは無視する", () => {
    const t = new RomajiTyper("あ");
    expect(t.input("Shift")).toBe("ignored");
    expect(t.missCount).toBe(0);
    expect(t.input("a")).toBe("complete");
    expect(t.input("a")).toBe("ignored");
  });
});

describe("別の綴りで打ったときの表示", () => {
  it("残りの綴りが、打った綴りに追従する", () => {
    const t = new RomajiTyper("しゃしん");
    expect(t.remaining).toBe("shashinn");
    t.input("s");
    expect(t.remaining).toBe("hashinn");
    t.input("y");
    expect(t.remaining).toBe("ashinn");
    t.input("a");
    expect(t.typed).toBe("sya");
    expect(t.kanaDone).toBe(2);
    t.input("s");
    t.input("i");
    expect(t.remaining).toBe("nn");
    expect(t.kanaDone).toBe(3);
  });

  it("ち を t で打ち始めると ti に変わる", () => {
    const t = new RomajiTyper("ちず");
    expect(t.remaining).toBe("chizu");
    t.input("t");
    expect(t.remaining).toBe("izu");
  });

  it("っ を x で打ち始めると単独の綴りに変わる", () => {
    const t = new RomajiTyper("きって");
    t.input("k");
    t.input("i");
    expect(t.remaining).toBe("tte");
    t.input("x");
    expect(t.remaining).toBe("tute");
  });

  it("ん を nn と打てば次の字に進む", () => {
    const t = new RomajiTyper("かんじ");
    for (const k of "kann") t.input(k);
    expect(t.typed).toBe("kann");
    expect(t.remaining).toBe("ji");
    expect(t.kanaDone).toBe(2);
  });
});

describe("見直しで足したテスト:ん", () => {
  it("xn で打って、や行に続けられる", () => {
    typeAll("こんや", "koxnya");
  });

  it("わ・を の前は n 1 回でよい", () => {
    typeAll("ほんを", "honwo");
    typeAll("ほんわ", "honwa");
  });

  it("ミスになる打ち方", () => {
    // かんい を kanni と打つつもりで n を 3 つ打つと、い の所で n はミス
    rejects("かんい", "kannni");
    rejects("こんや", "konya");
  });
});

describe("見直しで足したテスト:っ", () => {
  it("y・cy・ty で始まる綴りも重ねられる", () => {
    typeAll("さっや", "sayya");
    typeAll("まっちゃ", "maccya");
    typeAll("まっちゃ", "mattya");
  });

  it("あっん は n を重ねられない", () => {
    rejects("あっん", "annn");
    typeAll("あっん", "axtunn");
  });

  it("っ の直後に記号があっても、子音を重ねられる", () => {
    const t = typeAll("たっ、た", "tatta");
    expect(t.kanaDone).toBe(4);
    typeAll("たっ、た", "taxtuta");
    typeAll("あっ。「か", "akka");
    // 子音を重ねた時点で、っ と記号のぶんだけかなが進む
    const u = new RomajiTyper("たっ、た");
    for (const k of "tat") u.input(k);
    expect(u.kanaDone).toBe(3);
    expect(u.remaining).toBe("ta");
  });

  it("っ の後ろが記号で終わるときは単独だけ", () => {
    typeAll("あっ。", "axtu");
    rejects("あっ。", "aa");
  });

  it("っっ は子音を 3 つ重ねられる", () => {
    typeAll("っっか", "kkka");
    typeAll("っっか", "xtukka");
    typeAll("っっか", "xtuxtuka");
    typeAll("あっっち", "accchi");
    expect(standardRomaji("っっか")).toBe("kkka");
  });

  it("っ の途中でミスしたときは、次の字のミスとして記録する", () => {
    const t = new RomajiTyper("がっこう");
    for (const k of "gak") t.input(k);
    expect(t.input("a")).toBe("miss");
    expect(t.misses[0]).toEqual({ kana: "こ", expected: ["k"], counted: "k", typed: "a" });
    // まだ何も打っていなければ、っ のミス
    const u = new RomajiTyper("がっこう");
    for (const k of "ga") u.input(k);
    u.input("q");
    expect(u.misses[0].kana).toBe("っ");
    expect(u.misses[0].expected).toEqual(["k", "c", "x", "l"]);
    expect(u.misses[0].counted).toBe("k");
  });
});

describe("見直しで足したテスト:拗音の表示", () => {
  it("c で打ち始めると、残りが ha になる", () => {
    const t = new RomajiTyper("ちゃ");
    t.input("c");
    expect(t.remaining).toBe("ha");
    t.input("y");
    expect(t.remaining).toBe("a");
  });

  it("ch から chixya に切り替えると、表示と進みが追従する", () => {
    const t = new RomajiTyper("ちゃ");
    t.input("c");
    t.input("h");
    expect(t.remaining).toBe("a");
    expect(t.kanaDone).toBe(0);
    t.input("i");
    expect(t.remaining).toBe("xya");
    expect(t.kanaDone).toBe(1);
    t.input("x");
    t.input("y");
    expect(t.remaining).toBe("a");
    expect(t.input("a")).toBe("complete");
    expect(t.kanaDone).toBe(2);
  });
});

describe("見直しで足したテスト:ミスの記録", () => {
  it("正しかったキーをすべて記録する", () => {
    const t = new RomajiTyper("しゃ");
    t.input("s");
    t.input("x");
    expect(t.misses[0]).toEqual({ kana: "しゃ", expected: ["h", "y", "i"], counted: "h", typed: "x" });
  });

  it("sy と打つ人のミスは y で数える", () => {
    const t = new RomajiTyper("しゅしょ");
    for (const k of "syus") t.input(k);
    t.input("x");
    expect(t.misses[0]).toEqual({ kana: "しょ", expected: ["h", "y", "i"], counted: "y", typed: "x" });
    expect(t.missSummary().get("しょ:y")).toBe(1);
  });

  it("同じかなを前に打った綴りに合わせて数える", () => {
    const t = new RomajiTyper("ちちち");
    for (const k of "tit") t.input(k);
    expect(t.input("x")).toBe("miss");
    // ち を ti と打ってきたので、t の次は i
    expect(t.misses[0]).toEqual({ kana: "ち", expected: ["i"], counted: "i", typed: "x" });
    t.input("i");
    t.input("x");
    expect(t.misses[1]).toEqual({ kana: "ち", expected: ["c", "t"], counted: "t", typed: "x" });
  });

  it("癖が分からないときは、標準の綴りの方で数える", () => {
    const t = new RomajiTyper("じ");
    t.input("x");
    expect(t.misses[0]).toEqual({ kana: "じ", expected: ["j", "z"], counted: "j", typed: "x" });
  });
});

describe("表に無い字", () => {
  it("カタカナなどが来たら、エラーで止まる", () => {
    expect(() => new RomajiTyper("カ")).toThrow(/打ち方の分からない字/);
    expect(() => new RomajiTyper("あa")).toThrow(/打ち方の分からない字/);
  });
});
