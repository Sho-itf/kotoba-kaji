// public/sentences.json の全文が、いろいろな綴りで最後まで打てることを確かめる。

import { describe, expect, it } from "vitest";
import data from "../public/sentences.json";
import { RomajiTyper, toUnits, type Candidate } from "../src/romaji/index.ts";

type Pick = (cands: Candidate[]) => Candidate;

/** 単位ごとに綴りを選んで、全体のキーの並びを作る */
function keysFor(kana: string, pick: Pick): string {
  return toUnits(kana)
    .filter((u) => !u.skip)
    .map((u) => pick(u.candidates).romaji)
    .join("");
}

const standard: Pick = (c) => c[0];
const shortest: Pick = (c) => c.reduce((a, b) => (b.romaji.length < a.romaji.length ? b : a));
// 標準以外の綴り(si・tu・hu など)を優先する。無ければ標準。
const PREFER = ["si", "tu", "hu", "zi", "ti", "sy", "ty", "zy", "ca", "co", "cu", "xn"];
const nonStandard: Pick = (c) => c.find((x) => PREFER.some((p) => x.romaji.includes(p))) ?? c[0];
// それぞれの単位で、いちばん後ろの候補(分けた拗音や、単独の っ になりやすい)
const lastOne: Pick = (c) => c[c.length - 1];

const sentences = data.sentences;

describe("全文テスト", () => {
  it("文の数", () => {
    expect(sentences.length).toBe(1538);
  });

  for (const [name, pick] of [
    ["標準の綴り", standard],
    ["最短の綴り", shortest],
    ["標準以外の綴りを混ぜた打ち方", nonStandard],
    ["いちばん後ろの候補", lastOne],
  ] as const) {
    it(`${name}で全文を打てる`, () => {
      const failed: string[] = [];
      for (const s of sentences) {
        const keys = keysFor(s.kana, pick);
        const t = new RomajiTyper(s.kana);
        if (name === "標準の綴り" && t.remaining !== keys) failed.push(`${s.key}: 表示が標準と違う`);
        let last = "";
        for (const k of keys) last = t.input(k);
        if (last !== "complete" || t.missCount > 0 || t.kanaDone !== s.kana.length) {
          failed.push(`${s.key}: ${s.kana} を ${keys} で打てない(ミス ${t.missCount})`);
        }
      }
      expect(failed).toEqual([]);
    });
  }
});
