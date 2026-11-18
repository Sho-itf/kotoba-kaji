// 読み(かな)を「打つ単位」に分け、単位ごとに正解の綴りの候補を作る。

import { DOUBLE, SINGLE, SKIP_SYMBOLS, SMALL_TSU } from "./table.ts";

/** 綴りの一部分と、そこまで打てば進むかなの字数 */
export interface Segment {
  romaji: string;
  kana: number;
}

/** 正解の綴りの候補 1 つ。segments をつなげたものが綴り全体。 */
export interface Candidate {
  romaji: string;
  segments: Segment[];
}

/** 打つ単位(1〜3 字のかな、または飛ばす記号) */
export interface Unit {
  kana: string;
  /** 打たずに飛ばす記号なら true(candidates は空) */
  skip: boolean;
  /** 先頭が標準の綴り */
  candidates: Candidate[];
}

const SMALL = "ぁぃぅぇぉゃゅょゎ";
const VOWELS = "aiueo";

function cand(...segments: Segment[]): Candidate {
  return { romaji: segments.map((s) => s.romaji).join(""), segments };
}

function uniq(list: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.romaji) ? false : (seen.add(c.romaji), true)));
}

function singleCandidates(ch: string): Candidate[] {
  const list = SINGLE[ch];
  if (!list) throw new Error(`打ち方の分からない字があります: 「${ch}」`);
  return list.map((r) => cand({ romaji: r, kana: 1 }));
}

/** 拗音など 2 字の単位。まとめた綴りのあとに、分けて打つ綴り(ki + xya)を足す。 */
function doubleCandidates(pair: string): Candidate[] {
  const joined = DOUBLE[pair].map((r) => cand({ romaji: r, kana: 2 }));
  const split: Candidate[] = [];
  for (const a of singleCandidates(pair[0])) {
    for (const b of singleCandidates(pair[1])) split.push(cand(...a.segments, ...b.segments));
  }
  return uniq([...joined, ...split]);
}

/** 次の字(記号は飛ばして見る)。無ければ空文字。 */
function nextKana(kana: string, from: number): string {
  for (let i = from; i < kana.length; i++) {
    if (!SKIP_SYMBOLS.includes(kana[i])) return kana[i];
  }
  return "";
}

/** ん の後ろが母音・な行・や行・ん・文末なら、n 1 回では打てない */
function nNeedsDouble(next: string): boolean {
  return next === "" || "あいうえおなにぬねのやゆよん".includes(next);
}

function nCandidates(next: string): Candidate[] {
  const list = nNeedsDouble(next) ? ["nn", "xn"] : ["n", "nn", "xn"];
  return list.map((r) => cand({ romaji: r, kana: 1 }));
}

/**
 * っ + 次の単位。次の綴りの最初の子音を重ねる綴りと、っ を単独で打つ綴り。
 * symbols は っ と次の単位のあいだにある飛ばす記号(「たっ、た」の「、」)。
 */
function sokuonCandidates(next: Unit | undefined, symbols = ""): Candidate[] {
  const alone = SMALL_TSU.map((r) => cand({ romaji: r, kana: 1 }));
  if (!next || next.skip) return alone;
  // 記号は打たないので、綴りの長さ 0 の部分として入れる(かなの進みだけ数える)
  const gap: Segment[] = symbols ? [{ romaji: "", kana: symbols.length }] : [];
  const doubled: Candidate[] = [];
  for (const c of next.candidates) {
    const head = c.romaji[0];
    if (/[a-z]/.test(head) && !(VOWELS + "nxl").includes(head)) {
      doubled.push(cand({ romaji: head, kana: 1 }, ...gap, ...c.segments));
    }
  }
  // っち = tchi(ch で始まる綴りの前に t)
  for (const c of next.candidates) {
    if (c.romaji.startsWith("ch")) doubled.push(cand({ romaji: "t", kana: 1 }, ...gap, ...c.segments));
  }
  const separate: Candidate[] = [];
  for (const a of alone) {
    for (const c of next.candidates) separate.push(cand(...a.segments, ...gap, ...c.segments));
  }
  return uniq([...doubled, ...separate]);
}

const unitsCache = new Map<string, Unit[]>();

/** 読みを打つ単位に分ける。同じ読みは作り直さず、同じ結果を返す(結果は読むだけで、書き換えない)。 */
export function toUnits(kana: string): Unit[] {
  let units = unitsCache.get(kana);
  if (!units) {
    units = buildUnits(kana);
    unitsCache.set(kana, units);
  }
  return units;
}

function buildUnits(kana: string): Unit[] {
  // まず っ・ん 以外を区切る(後ろから見たときに次の単位を参照できるように)
  const raw: Unit[] = [];
  for (let i = 0; i < kana.length; ) {
    const ch = kana[i];
    if (SKIP_SYMBOLS.includes(ch)) {
      raw.push({ kana: ch, skip: true, candidates: [] });
      i += 1;
    } else if (ch === "ん") {
      raw.push({ kana: ch, skip: false, candidates: nCandidates(nextKana(kana, i + 1)) });
      i += 1;
    } else if (ch === "っ") {
      raw.push({ kana: ch, skip: false, candidates: [] }); // 後で次の単位と合わせる
      i += 1;
    } else if (i + 1 < kana.length && SMALL.includes(kana[i + 1]) && DOUBLE[ch + kana[i + 1]]) {
      raw.push({ kana: ch + kana[i + 1], skip: false, candidates: doubleCandidates(ch + kana[i + 1]) });
      i += 2;
    } else {
      raw.push({ kana: ch, skip: false, candidates: singleCandidates(ch) });
      i += 1;
    }
  }

  // っ を次の単位と合わせる(後ろから)。あいだの記号は飛ばして見る。
  // 次が ん のときは合わせない(単独だけ)。次が母音・な行なら、合わせても重ねる綴りは無い。
  // 次が っ(っっか)なら合わせて、子音を 3 つ重ねる綴り(kkka)も受け付ける。
  const units: Unit[] = [];
  for (let i = raw.length - 1; i >= 0; i--) {
    const u = raw[i];
    if (u.kana !== "っ") {
      units.unshift(u);
      continue;
    }
    const j = units.findIndex((x) => !x.skip);
    const next = j >= 0 ? units[j] : undefined;
    if (next && next.kana !== "ん") {
      const symbols = units.slice(0, j).map((x) => x.kana).join("");
      units.splice(0, j + 1, {
        kana: "っ" + symbols + next.kana,
        skip: false,
        candidates: sokuonCandidates(next, symbols),
      });
    } else {
      units.unshift({ kana: "っ", skip: false, candidates: sokuonCandidates(undefined) });
    }
  }
  return units;
}

/** 読み全体の標準の綴り */
export function standardRomaji(kana: string): string {
  return toUnits(kana)
    .map((u) => (u.skip ? "" : u.candidates[0].romaji))
    .join("");
}
