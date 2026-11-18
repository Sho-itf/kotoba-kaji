import { describe, expect, it } from "vitest";
import data from "../public/sentences.json";
import { makeFurigana, partsInRange, type FuriganaPart } from "../src/game/furigana.ts";
import { parseSentences } from "../src/game/sentences.ts";

const sentences = parseSentences(data);

/** [漢字|よみ] の形で見やすくする */
function show(parts: FuriganaPart[] | null): string | null {
  return parts && parts.map((p) => (p.ruby ? `[${p.text}|${p.ruby}]` : p.text)).join("");
}

describe("ふりがな", () => {
  it("漢字が続くまとまりごとに振る(字ごとには分けない)", () => {
    expect(show(makeFurigana("形而上学的な問いに取り組む", "けいじじょうがくてきなといにとりくむ"))).toBe(
      "[形而上学的|けいじじょうがくてき]な[問|と]いに[取|と]り[組|く]む",
    );
  });

  it("ひらがな・カタカナ・記号には振らない", () => {
    expect(show(makeFurigana("「ゆるい」ルールを守る。", "「ゆるい」るーるをまもる。"))).toBe("「ゆるい」ルールを[守|まも]る。");
  });

  it("カタカナ語の読みは、ひらがなに直して突き合わせる", () => {
    expect(show(makeFurigana("データを用いて仮説を論証する", "でーたをもちいてかせつをろんしょうする"))).toBe(
      "データを[用|もち]いて[仮説|かせつ]を[論証|ろんしょう]する",
    );
    expect(show(makeFurigana("インターネットは産業のパラダイムを変えた", "いんたーねっとはさんぎょうのぱらだいむをかえた"))).toBe(
      "インターネットは[産業|さんぎょう]のパラダイムを[変|か]えた",
    );
  });

  it("数字・英字・記号まじりも、読みを付ける", () => {
    expect(show(makeFurigana("第3章で詳述する", "だいさんしょうでしょうじゅつする"))).toBe("[第3章|だいさんしょう]で[詳述|しょうじゅつ]する");
    expect(show(makeFurigana("円周率を3.14で近似する", "えんしゅうりつをさんてんいちよんできんじする"))).toBe(
      "[円周率|えんしゅうりつ]を[3.14|さんてんいちよん]で[近似|きんじ]する",
    );
  });

  it("活用する語は、漢字のまとまりだけに振る", () => {
    expect(show(makeFurigana("新規事業の責任者に白羽の矢が立った", "しんきじぎょうのせきにんしゃにしらはのやがたった"))).toBe(
      "[新規事業|しんきじぎょう]の[責任者|せきにんしゃ]に[白羽|しらは]の[矢|や]が[立|た]った",
    );
  });

  it("読みの分け方が決まらないところは、前後とまとめて 1 つに振る", () => {
    // 「は」が読みの中にも現れるので、どこで区切るか決まらない
    const parts = makeFurigana("真相は判然としない", "しんそうははんぜんとしない");
    expect(show(parts)).toBe("[真相は判然|しんそうははんぜん]としない");
  });

  it("合わないときは null(ひらがなの行に戻す)", () => {
    expect(makeFurigana("問いに取り組む", "まったくちがうよみ")).toBeNull();
  });

  it("かなだけの文は、振るものが無い(null にはしない)", () => {
    expect(show(makeFurigana("ねんごろにもてなす", "ねんごろにもてなす"))).toBe("ねんごろにもてなす");
  });
});

describe("全文にかける", () => {
  const results = sentences.map((s) => ({ s, parts: makeFurigana(s.text, s.kana) }));
  const fallback = results.filter((r) => r.parts === null);
  const merged = results.filter((r) => r.parts?.some((p) => p.ruby && /[ぁ-ゖァ-ヺー]/.test(p.text)));

  it("結果の数(まとまりごとに振れた文 / まとめて振った文 / 逃げ道に入った文)", () => {
    console.log(`全 ${sentences.length} 文:まとまりごと ${results.length - fallback.length - merged.length}、まとめて振った ${merged.length}、逃げ道 ${fallback.length}`);
    for (const r of fallback) console.log(`逃げ道: ${r.s.key} ${r.s.text} | ${r.s.kana}`);
    expect(results.length).toBe(1538);
  });

  it("逃げ道に入る文は、ほとんど無い", () => {
    expect(fallback.length).toBeLessThanOrEqual(5);
  });

  it("文字がそのままつながり、読みが最初から最後まで途切れずにつながる", () => {
    for (const { s, parts } of results) {
      if (!parts) continue;
      expect(parts.map((p) => p.text).join(""), s.key).toBe(s.text);
      let pos = 0;
      for (const p of parts) {
        expect(p.kanaStart, s.key).toBe(pos);
        expect(p.kanaEnd, s.key).toBeGreaterThan(p.kanaStart);
        if (p.ruby) expect(p.ruby, s.key).toBe(s.kana.slice(p.kanaStart, p.kanaEnd));
        pos = p.kanaEnd;
      }
      expect(pos, s.key).toBe(s.kana.length);
    }
  });
});

describe("強調の範囲にかかる部分", () => {
  const parts = makeFurigana("問いに取り組む", "といにとりくむ")!;
  it("語の範囲にかかる部分の番号を返す", () => {
    expect(partsInRange(parts, { start: 3, end: 7 })).toEqual([2, 6]); // 取り組む(取・り・組・む)
  });
  it("範囲の端が部分の途中なら、その部分まるごとを含める", () => {
    const p = makeFurigana("責任者に白羽の矢", "せきにんしゃにしらはのや")!;
    expect(partsInRange(p, { start: 1, end: 3 })).toEqual([0, 1]); // 責任者の途中 → 責任者
  });
  it("かかる部分が無ければ null", () => {
    expect(partsInRange(parts, { start: 20, end: 25 })).toBeNull();
  });
});
