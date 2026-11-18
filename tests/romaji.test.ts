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
  expect(results.includes("miss") || !t.done, `「${kana}」を ${keys} と打てないこと`).toBe(true);
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
    expect(t.misses[0]).toEqual({ kana: "か", expected: "a", typed: "i" });
    expect(t.missSummary().get("き:k")).toBe(2);
    expect(t.input("k")).toBe("progress");
    expect(t.input("i")).toBe("complete");
  });

  it("n を打った後のミスは、次の字のミスとして数える", () => {
    const t = new RomajiTyper("かんじ");
    for (const k of "kan") t.input(k);
    expect(t.input("q")).toBe("miss");
    expect(t.misses[0]).toEqual({ kana: "じ", expected: "j", typed: "q" });
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
