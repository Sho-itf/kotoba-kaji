// 漢字の文(text)と読み(kana)から、「漢字が続くまとまり」ごとのふりがなを決める。
// ひらがな・カタカナ・記号の部分は、読みの中にそのまま現れるので、目印にして突き合わせる。

import { SKIP_SYMBOLS } from "../romaji/index.ts";

/** 文の 1 かたまり。ruby があれば、その上にふりがなを付ける。 */
export interface FuriganaPart {
  text: string;
  /** ふりがな(ひらがな)。かなの部分には付かない。 */
  ruby?: string;
  /** この部分の読みが、kana の何字目から何字目までか(進み具合の判定に使う) */
  kanaStart: number;
  kanaEnd: number;
}

/** 漢字など 1 字の読みの長さの範囲(ひらがなの字数)。読みの分け方を絞るのに使う。 */
const MIN_PER_CHAR = 1;
const MAX_PER_CHAR = 5;

/** 突き合わせの結果が多すぎるときに、探すのをやめる数 */
const MAX_SOLUTIONS = 2000;

function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 読みの中にそのまま現れる字(ひらがな・カタカナ・ー・飛ばす記号) */
function isKanaLike(c: string): boolean {
  return /[ぁ-ゖァ-ヺー]/.test(c) || SKIP_SYMBOLS.includes(c);
}

interface Run {
  text: string;
  kana: boolean;
}

function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
  for (const c of text) {
    const kana = isKanaLike(c);
    const last = runs[runs.length - 1];
    if (last && last.kana === kana) last.text += c;
    else runs.push({ text: c, kana });
  }
  return runs;
}

/**
 * 突き合わせて、各かたまりの読みの始まり(kana の位置)の並びを、すべての場合について求める。
 * かなのかたまりは、読みの中に同じ文字で現れる。それ以外のかたまりは、1 字以上の読みになる。
 */
function align(runs: Run[], kana: string): number[][] {
  const found: number[][] = [];
  const starts: number[] = [];
  const walk = (i: number, pos: number): void => {
    if (found.length >= MAX_SOLUTIONS) return;
    if (i === runs.length) {
      if (pos === kana.length) found.push([...starts, pos]);
      return;
    }
    const run = runs[i];
    starts.push(pos);
    if (run.kana) {
      const lit = toHiragana(run.text);
      if (kana.startsWith(lit, pos)) walk(i + 1, pos + lit.length);
    } else {
      // 次がかなのかたまりなら、その文字で終わる位置だけを試す
      const next = runs[i + 1];
      const chars = [...run.text].length;
      for (let len = chars * MIN_PER_CHAR; len <= chars * MAX_PER_CHAR && pos + len <= kana.length; len++) {
        if (next && !kana.startsWith(toHiragana(next.text), pos + len)) continue;
        walk(i + 1, pos + len);
      }
    }
    starts.pop();
  };
  walk(0, 0);
  return found;
}

/**
 * ふりがなの付け方。決められないとき(合わない・読みの分け方が何通りもある)は、
 * 前後のかたまりとまとめて 1 つにして振る。どうしてもだめなら null(その文は、ひらがなの行を出す)。
 */
export function makeFurigana(text: string, kana: string): FuriganaPart[] | null {
  const runs = splitRuns(text);
  if (runs.length === 0) return null;
  const solutions = align(runs, kana);
  if (solutions.length === 0 || solutions.length >= MAX_SOLUTIONS) return null;

  // かなのかたまりの位置が、すべての場合で同じなら「確か」
  const sure = runs.map((_, i) => solutions.every((s) => s[i] === solutions[0][i]));
  const start = solutions[0];

  const parts: FuriganaPart[] = [];
  let i = 0;
  while (i < runs.length) {
    const run = runs[i];
    if (run.kana && sure[i]) {
      parts.push({ text: run.text, kanaStart: start[i], kanaEnd: start[i + 1] });
      i++;
      continue;
    }
    // 漢字などのまとまり(または、位置が確かでないかな)から、確かなかなに当たるまで、まとめて 1 つにする
    let j = i;
    while (j + 1 < runs.length && !(runs[j + 1].kana && sure[j + 1])) j++;
    // 最後のかたまりが読みの終わりなら、そこまで含む(j は最後のかたまりの番号)
    const from = start[i];
    const to = start[j + 1];
    const group = runs.slice(i, j + 1).map((r) => r.text).join("");
    parts.push({ text: group, ruby: kana.slice(from, to), kanaStart: from, kanaEnd: to });
    i = j + 1;
  }
  return parts;
}

/**
 * 強調する範囲(text の何字目から何字目まで)にかかる部分の番号を、[はじめ, おわり) で返す。
 * 範囲の端が 1 つの部分の途中なら、その部分まるごとを含める(ふりがなは分けられないため)。
 */
export function partsInRange(parts: readonly FuriganaPart[], range: { start: number; end: number }): [number, number] | null {
  let offset = 0;
  let first = -1;
  let last = -1;
  parts.forEach((p, i) => {
    const start = offset;
    offset += p.text.length;
    if (start < range.end && offset > range.start) {
      if (first < 0) first = i;
      last = i;
    }
  });
  return first < 0 ? null : [first, last + 1];
}
