import { describe, expect, it } from "vitest";
import { accuracyShortfallNote, nextRankNote, rankUpNote } from "../src/game/messages.ts";
import { RANKS, rankByName } from "../src/game/ranks.ts";

const rank = (name: string) => rankByName(name)!;
// 合計 2000 打で、正確さ tenths/10 % の稽古
function run(score: number, tenths: number) {
  const keystrokes = Math.ceil((tenths * 2000) / 1000);
  return { score, keystrokes, misses: 2000 - keystrokes };
}

describe("結果の画面:正確さが足りなかったときの知らせ", () => {
  it("スコアは三段に届いているが、正確さが足りない", () => {
    expect(accuracyShortfallNote({ score: 320, keystrokes: 855, misses: 145 })).toBe(
      "スコアは三段に届いています。正確さ 85.5%(三段は 87.5% 以上)",
    );
  });

  it("条件の正確さが小数のときも、そのまま出す", () => {
    expect(accuracyShortfallNote({ score: 520, keystrokes: 930, misses: 70 })).toBe(
      "スコアは八段に届いています。正確さ 93.0%(八段は 94% 以上)",
    );
  });

  it("正確さの表示は切り捨て(79.996% は 79.9%)", () => {
    expect(accuracyShortfallNote({ score: 240, keystrokes: 79996, misses: 20004 })).toBe(
      "スコアは初段に届いています。正確さ 79.9%(初段は 80% 以上)",
    );
  });

  it("足りていれば出さない。級だけなら出さない", () => {
    expect(accuracyShortfallNote(run(320, 960))).toBeNull();
    expect(accuracyShortfallNote(run(150, 500))).toBeNull();
    expect(accuracyShortfallNote(run(0, 0))).toBeNull();
  });
});

describe("位が上がった知らせ", () => {
  it("名乗る位で比べる", () => {
    expect(rankUpNote(rank("十級"), rank("九級"))).toBe("位が上がりました:十級 → 九級");
    expect(rankUpNote(rank("三段"), rank("三段"))).toBeNull();
    expect(rankUpNote(rank("三段"), rank("一級"))).toBeNull();
  });
});

describe("待機の画面の、次の位までの目安", () => {
  it("次が級:スコアだけ", () => {
    expect(nextRankNote(rank("十級"), 28)).toBe("次の 九級 まで あと 12");
    expect(nextRankNote(rank("二級"), 195)).toBe("次の 一級 まで あと 5");
  });

  it("次が段:スコアと正確さ", () => {
    expect(nextRankNote(rank("一級"), 205)).toBe("次の 初段 まで:スコア あと 25・正確さ 80% 以上");
    expect(nextRankNote(rank("六段"), 450)).toBe("次の 七段 まで:スコア あと 30・正確さ 93% 以上");
    expect(nextRankNote(rank("二段"), 290)).toBe("次の 三段 まで:スコア あと 10・正確さ 87.5% 以上");
  });

  it("スコアは足りているが、その回の正確さが足りなかったとき", () => {
    expect(nextRankNote(rank("一級"), 300)).toBe("次の 初段 まで:1 回の稽古で、スコア 230 以上・正確さ 80% 以上");
  });

  it("十段のときは出さない", () => {
    expect(nextRankNote(RANKS[RANKS.length - 1], 800)).toBeNull();
  });
});
