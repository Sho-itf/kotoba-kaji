import { describe, expect, it } from "vitest";
import { decideMenuKey, decidePlayKey, type KeyInfo } from "../src/game/input.ts";
import { Keiko } from "../src/game/keiko.ts";
import { Practice, ipponBonusMs } from "../src/game/practice.ts";
import type { Sentence } from "../src/game/sentences.ts";
import { isTouchOnly } from "../src/ui/device.ts";

function key(k: string, extra: Partial<KeyInfo> = {}): KeyInfo {
  return { key: k, repeat: false, isComposing: false, keyCode: 0, ctrlKey: false, metaKey: false, altKey: false, ...extra };
}

function sentence(key: string, kana: string): Sentence {
  return { key, word: key, wordReading: kana, meaning: "意味", text: kana, kana, category: "", difficulty: 1 };
}

const DURATION = 60_000;
function practice(kanaList: string[]): Practice {
  return new Practice(new Keiko(kanaList.map((k, i) => sentence(`s${i}`, k)), () => 0), 1000, DURATION);
}

describe("稽古中のキーの扱い", () => {
  it("文字のキーは打鍵にする", () => {
    expect(decidePlayKey(key("a"))).toEqual({ action: { type: "type", key: "a" }, preventDefault: true });
  });

  it("Space は無視して、ページを下へ送る動きを止める", () => {
    expect(decidePlayKey(key(" "))).toEqual({ action: { type: "ignore" }, preventDefault: true });
  });

  it("押しっぱなしの繰り返しは無視する", () => {
    expect(decidePlayKey(key("a", { repeat: true })).action).toEqual({ type: "ignore" });
  });

  it("Ctrl・Alt・Meta 付きは無視して、ブラウザのショートカットは止めない", () => {
    for (const mod of ["ctrlKey", "altKey", "metaKey"] as const) {
      expect(decidePlayKey(key("r", { [mod]: true }))).toEqual({ action: { type: "ignore" }, preventDefault: false });
    }
  });

  it("日本語入力がオンなら案内を出す(打鍵にしない)", () => {
    expect(decidePlayKey(key("Process")).action).toEqual({ type: "ime" });
    expect(decidePlayKey(key("a", { isComposing: true })).action).toEqual({ type: "ime" });
    expect(decidePlayKey(key("a", { keyCode: 229 })).action).toEqual({ type: "ime" });
  });

  it("Shift などの文字でないキーは無視する", () => {
    expect(decidePlayKey(key("Shift")).action).toEqual({ type: "ignore" });
    expect(decidePlayKey(key("Tab")).action).toEqual({ type: "ignore" });
  });

  it("Esc は中断", () => {
    expect(decidePlayKey(key("Escape")).action).toEqual({ type: "abort" });
  });
});

describe("稽古の流れ", () => {
  it("Space・繰り返し・Ctrl 付き・日本語入力のキーは、打鍵にもミスにも数えない", () => {
    const p = practice(["か"]);
    p.handleKey(key(" "), 2000);
    p.handleKey(key("k", { repeat: true }), 2000);
    p.handleKey(key("k", { ctrlKey: true }), 2000);
    expect(p.handleKey(key("Process"), 2000).type).toBe("ime");
    expect(p.handleKey(key("k", { isComposing: true }), 2000).type).toBe("ime");
    const r = p.keiko.result();
    expect(r.keystrokes + r.misses).toBe(0);
  });

  it("正しいキーは進み、間違ったキーはミス", () => {
    const p = practice(["か"]);
    expect(p.handleKey(key("k"), 2000).type).toBe("progress");
    expect(p.handleKey(key("x"), 2000).type).toBe("miss");
    expect(p.keiko.result()).toMatchObject({ keystrokes: 1, misses: 1 });
  });

  it("時間切れのあとに打ったキーは数えない(0.1 秒ごとの確かめを待たない)", () => {
    const p = practice(["かか"]);
    p.handleKey(key("k"), 30_000);
    // 時間切れ(1000 + 60000)を過ぎたあと、画面の確かめが来る前にキーが来た
    const ev = p.handleKey(key("a"), 61_050);
    expect(ev.type).toBe("timeup");
    if (ev.type === "timeup") {
      expect(ev.result.keystrokes).toBe(1);
      expect(ev.result.misses).toBe(0);
    }
    expect(p.state).toBe("finished");
    // 終わったあとのキーは何もしない
    expect(p.handleKey(key("a"), 61_100).type).toBe("none");
    expect(p.keiko.result().keystrokes).toBe(1);
  });

  it("ちょうど時間切れのときも、キーは数えない", () => {
    const p = practice(["か"]);
    expect(p.handleKey(key("k"), 61_000).type).toBe("timeup");
    expect(p.keiko.result().keystrokes).toBe(0);
  });

  it("時間切れのあとの Esc は中断にせず、記録できる形で終える", () => {
    const p = practice(["か"]);
    expect(p.handleKey(key("Escape"), 70_000).type).toBe("timeup");
  });

  it("タブを隠しても時間は進む(戻った時点の時刻で残り時間が決まる)", () => {
    const p = practice(["か"]);
    expect(p.remaining(1000)).toBe(DURATION);
    expect(p.remaining(31_000)).toBe(30_000);
    expect(p.remaining(500_000)).toBe(0);
    expect(p.tick(500_000)?.type).toBe("timeup");
    expect(p.tick(500_001)).toBeNull(); // 結果は 1 回だけ
  });

  it("Esc で中断した回は、結果を出さない(記録されない)", () => {
    const p = practice(["か"]);
    p.handleKey(key("k"), 2000);
    const ev = p.handleKey(key("Escape"), 3000);
    expect(ev.type).toBe("abort");
    expect(p.state).toBe("aborted");
    // そのあと時間が過ぎても、結果は出ない
    expect(p.tick(100_000)).toBeNull();
    expect(p.handleKey(key("a"), 100_000).type).toBe("none");
  });

  it("文を打ち終えたことを知らせる", () => {
    const p = practice(["あ"]);
    const ev = p.handleKey(key("a"), 2000);
    expect(ev.type).toBe("progress");
    if (ev.type === "progress") expect(ev.finished?.ippon).toBe(true);
  });
});

describe("待機・結果の画面のキー", () => {
  const GUARD = 700;

  it("待機では Enter・Space で始める", () => {
    expect(decideMenuKey("idle", key("Enter"), 0, GUARD)).toEqual({ action: "start", preventDefault: true });
    expect(decideMenuKey("idle", key(" "), 0, GUARD)).toEqual({ action: "start", preventDefault: true });
    expect(decideMenuKey("idle", key("a"), 0, GUARD).action).toBe("none");
  });

  it("結果の画面は、受付止めの間は始めない。ただし Space で下へ送る動きは止める", () => {
    expect(decideMenuKey("result", key(" "), 100, GUARD)).toEqual({ action: "none", preventDefault: true });
    expect(decideMenuKey("result", key("Enter"), 699, GUARD).action).toBe("none");
    expect(decideMenuKey("result", key(" "), 700, GUARD)).toEqual({ action: "start", preventDefault: true });
  });

  it("結果の画面の Esc は待機へ戻る。待機の Esc は何もしない", () => {
    expect(decideMenuKey("result", key("Escape"), 0, GUARD).action).toBe("idle");
    expect(decideMenuKey("idle", key("Escape"), 0, GUARD).action).toBe("none");
  });

  it("繰り返し・ボタンの上・日本語入力のキーでは始めない", () => {
    expect(decideMenuKey("idle", key("Enter", { repeat: true }), 0, GUARD).action).toBe("none");
    expect(decideMenuKey("idle", key("Enter", { fromControl: true }), 0, GUARD)).toEqual({ action: "none", preventDefault: false });
    expect(decideMenuKey("idle", key("Enter", { isComposing: true }), 0, GUARD).action).toBe("none");
  });
});

describe("文をまたいだ打ち方の癖", () => {
  it("sy で打った人は、次の文の最初のミスも y で数える", () => {
    // しゅ → しゃ の順(rng が 0 だと並びが逆になるので、出た順に合わせる)
    const keiko = new Keiko([sentence("a", "しゅ"), sentence("b", "しゃ")], () => 0);
    const first = keiko.sentence.kana;
    const second = first === "しゅ" ? "しゃ" : "しゅ";
    for (const k of first === "しゅ" ? "syu" : "sya") keiko.input(k);
    expect(keiko.sentence.kana).toBe(second);
    keiko.input("s");
    keiko.input("x");
    expect(keiko.typer.misses[0].expected).toEqual(["h", "y", "i"]);
    expect(keiko.typer.misses[0].counted).toBe("y");
    expect(keiko.result().missKeys).toEqual({ [`${second}:y`]: 1 });
  });

  it("sh で打った人は h で数える", () => {
    const keiko = new Keiko([sentence("a", "しゅ"), sentence("b", "しゃ")], () => 0);
    const first = keiko.sentence.kana;
    for (const k of first === "しゅ" ? "shu" : "sha") keiko.input(k);
    keiko.input("s");
    keiko.input("x");
    expect(keiko.typer.misses[0].counted).toBe("h");
  });
});

describe("タッチだけの端末", () => {
  const mm = (coarse: boolean, fine: boolean) => (q: string) => ({
    matches: q.includes("any-pointer") ? fine : coarse,
  });
  it("指だけの入力ならタッチだけ", () => {
    expect(isTouchOnly(mm(true, false))).toBe(true);
  });
  it("マウスなどもあれば違う", () => {
    expect(isTouchOnly(mm(true, true))).toBe(false);
    expect(isTouchOnly(mm(false, true))).toBe(false);
  });
  it("判断できないときは、タッチだけとしない", () => {
    expect(isTouchOnly(undefined)).toBe(false);
    expect(isTouchOnly(() => { throw new Error("だめ"); })).toBe(false);
  });
});

describe("一本で時間が延びる", () => {
  const bonusOf = (ev: ReturnType<Practice["handleKey"]>) => (ev.type === "progress" ? ev.bonusMs : undefined);

  it("延び方は 1 本目 0.5 秒、2 本目からは 1 秒", () => {
    expect([0, 1, 2, 3, 10].map(ipponBonusMs)).toEqual([0, 500, 1000, 1000, 1000]);
  });

  it("一本を続けると 0.5 → 1 → 1 秒と延び、残り時間と合計に反映される", () => {
    const p = practice(["あ", "あ", "あ"]);
    expect(bonusOf(p.handleKey(key("a"), 2000))).toBe(500);
    expect(bonusOf(p.handleKey(key("a"), 3000))).toBe(1000);
    expect(bonusOf(p.handleKey(key("a"), 4000))).toBe(1000);
    expect(p.bonusMs).toBe(2500);
    expect(p.totalMs).toBe(DURATION + 2500);
    expect(p.remaining(4000)).toBe(DURATION + 2500 - 3000);
  });

  it("ミスのある文で終えると連続が切れ、次の一本はまた 0.5 秒から", () => {
    const p = practice(["あ", "あ", "あ", "あ"]);
    expect(bonusOf(p.handleKey(key("a"), 2000))).toBe(500);
    expect(bonusOf(p.handleKey(key("a"), 3000))).toBe(1000);
    // 3 文目はミスしてから打ち終える(一本にならず、延びない)
    expect(p.handleKey(key("x"), 4000).type).toBe("miss");
    expect(bonusOf(p.handleKey(key("a"), 5000))).toBeUndefined();
    expect(p.bonusMs).toBe(1500);
    expect(bonusOf(p.handleKey(key("a"), 6000))).toBe(500);
    expect(p.bonusMs).toBe(2000);
  });

  it("途中のミスだけでは連続は切れない(その文を打ち終えたときに切れる)", () => {
    const p = practice(["ああ", "ああ"]);
    p.handleKey(key("x"), 2000); // ミス
    p.handleKey(key("a"), 3000);
    expect(bonusOf(p.handleKey(key("a"), 4000))).toBeUndefined();
    p.handleKey(key("a"), 5000);
    expect(bonusOf(p.handleKey(key("a"), 6000))).toBe(500);
  });

  it("延びたあとの時間切れは、延びた分だけ遅れて起きる", () => {
    const p = practice(["あ", "あ"]);
    p.handleKey(key("a"), 2000); // +0.5
    p.handleKey(key("a"), 3000); // +1
    // 元の終わり(61_000)を過ぎても、1.5 秒のあいだは続く
    expect(p.tick(61_000)).toBeNull();
    expect(p.tick(62_499)).toBeNull();
    expect(p.remaining(62_499)).toBe(1);
    expect(p.tick(62_500)?.type).toBe("timeup");
    expect(p.tick(62_501)).toBeNull();
  });

  it("時間切れのあとのキーは数えず、延びもしない", () => {
    const p = practice(["あ", "あ"]);
    p.handleKey(key("a"), 2000); // +0.5
    const late = p.handleKey(key("a"), 61_600); // 元の終わり 61_000 + 0.5 秒 = 61_500 を過ぎている
    expect(late.type).toBe("timeup");
    expect(p.bonusMs).toBe(500);
    if (late.type === "timeup") expect(late.result.keystrokes).toBe(1);
  });
});
