// ローマ字の判定(状態機械)。
// 状態 = 「今どの単位を打っているか」と「その単位で何を打ったか」。
// 1 キー受け取るたびに、正解の候補を絞り込んで次の状態を決める。

import { toUnits, type Candidate, type Unit } from "./units.ts";

/** 1 キーの結果。ignored は Shift などの文字でないキーや、打ち終えた後のキー。 */
export type InputResult = "progress" | "miss" | "complete" | "ignored";

/** ミス 1 回の記録 */
export interface Miss {
  /** 打っていたかな(拗音は 2 字、っ を重ねる途中なら次の字) */
  kana: string;
  /** その時点で正しかったキーのすべて。先頭は標準の綴りの次の 1 字。 */
  expected: string[];
  /** 集計で数えるキー。expected のうち、これまでの打ち方に合う方(選べなければ先頭)。 */
  counted: string;
  /** 実際に打ったキー */
  typed: string;
}

/** 綴りの癖を見分ける印(sh と sy、ch と ty など)。集計で数えるキーを選ぶのに使う。 */
const STYLE_TAGS: [string, RegExp][] = [
  ["sh", /sh/], ["sy", /sy/], ["si", /si/], ["ci", /ci/],
  ["ch", /ch/], ["ty", /ty/], ["cy", /cy/], ["ti", /(^|[^c])ti/],
  ["j", /j(?!y)/], ["jy", /jy/], ["zy", /zy/], ["zi", /zi/],
  ["tsu", /tsu/], ["tu", /(^|[^xlt])tu/], ["fu", /fu/], ["hu", /hu/],
  ["c", /c[aueo]/], ["q", /q/], ["x", /x/], ["l", /l/],
];

function tagsOf(romaji: string): string[] {
  return STYLE_TAGS.filter(([, re]) => re.test(romaji)).map(([t]) => t);
}

/**
 * 打ち方の癖の記憶。文をまたいで使えるように、RomajiTyper の外に持てる。
 * history:かな → そのかなを打った綴り、tagCount:綴りの癖(sh・sy など)ごとの回数。
 */
export interface Habit {
  history: Map<string, string>;
  tagCount: Map<string, number>;
}

export function createHabit(): Habit {
  return { history: new Map(), tagCount: new Map() };
}

/** 次に打てるキー 1 つぶんの情報 */
interface Option {
  key: string;
  unit: Unit;
  cand: Candidate;
  /** その単位で打った字数 */
  pos: number;
}

export class RomajiTyper {
  readonly kana: string;
  private readonly units: Unit[];
  /** 今の単位の番号 */
  private index = 0;
  /** 今の単位で打ったローマ字 */
  private current = "";
  /** 打ち終えた単位のローマ字 */
  private doneRomaji = "";
  /** 打ち終えた単位のかなの字数 */
  private doneKana = 0;
  private readonly missList: Miss[] = [];
  private correctKeys = 0;
  /** 打ち方の癖の記憶(ミスで数えるキーを選ぶのに使う) */
  private readonly habit: Habit;

  constructor(kana: string, habit: Habit = createHabit()) {
    this.kana = kana;
    this.habit = habit;
    this.units = toUnits(kana);
    this.skipSymbols();
  }

  /** 1 キー受け取る */
  input(key: string): InputResult {
    if (this.done || key.length !== 1) return "ignored";
    const k = key.toLowerCase();
    const unit = this.units[this.index];
    const next = this.current + k;

    if (this.alive(unit, next).length > 0) {
      this.current = next;
      this.correctKeys++;
      this.settle();
      return this.done ? "complete" : "progress";
    }

    // 今の単位がもう打ち終えられる形(ん の n など)なら、確定して次の単位で受け取る
    const following = this.followingIfComplete();
    if (following && this.alive(following, k).length > 0) {
      this.finishUnit();
      this.current = k;
      this.correctKeys++;
      this.settle();
      return this.done ? "complete" : "progress";
    }

    this.missList.push(this.makeMiss(k));
    return "miss";
  }

  /** 打ち終えたか */
  get done(): boolean {
    return this.index >= this.units.length;
  }

  /** 打ち終えたローマ字 */
  get typed(): string {
    return this.doneRomaji + this.current;
  }

  /** これから打つ標準の綴り(別の綴りで打ったら、それに合わせる) */
  get remaining(): string {
    if (this.done) return "";
    let rest = "";
    const unit = this.units[this.index];
    const c = this.alive(unit, this.current)[0];
    if (c) rest += c.romaji.slice(this.current.length);
    for (const u of this.units.slice(this.index + 1)) {
      if (!u.skip) rest += u.candidates[0].romaji;
    }
    return rest;
  }

  /** 読み(かな)の何字目まで打てたか(記号も含めて数える) */
  get kanaDone(): number {
    if (this.done) return this.kana.length;
    const c = this.alive(this.units[this.index], this.current)[0];
    let partial = 0;
    if (c) {
      let len = 0;
      for (const s of c.segments) {
        len += s.romaji.length;
        if (len > this.current.length) break;
        partial += s.kana;
      }
    }
    return this.doneKana + partial;
  }

  /** ミスの数 */
  get missCount(): number {
    return this.missList.length;
  }

  /** ミスの記録 */
  get misses(): readonly Miss[] {
    return this.missList;
  }

  /** 正しく打ったキーの数(記号は数えない) */
  get keystrokes(): number {
    return this.correctKeys;
  }

  /** ミスしたキーの集計。「かな:数えるキー」ごとの回数。 */
  missSummary(): Map<string, number> {
    const m = new Map<string, number>();
    for (const x of this.missList) {
      const key = `${x.kana}:${x.counted}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }

  // --- ここから内部の処理 ---

  /** 打った文字で始まる候補(標準に近い順) */
  private alive(unit: Unit, typed: string): Candidate[] {
    return unit.candidates.filter((c) => c.romaji.startsWith(typed));
  }

  private isComplete(unit: Unit, typed: string): boolean {
    return typed !== "" && unit.candidates.some((c) => c.romaji === typed);
  }

  /** 今の単位が打ち終えられる形なら、その次の(記号でない)単位 */
  private followingIfComplete(): Unit | undefined {
    if (!this.isComplete(this.units[this.index], this.current)) return undefined;
    return this.units.slice(this.index + 1).find((u) => !u.skip);
  }

  /** 今の単位が打ち終わったら次へ進む。長い候補も残っているときは、次のキーで決める。 */
  private settle(): void {
    const unit = this.units[this.index];
    if (!this.isComplete(unit, this.current)) return;
    const longer = this.alive(unit, this.current).some((c) => c.romaji.length > this.current.length);
    const isLast = this.units.slice(this.index + 1).every((u) => u.skip);
    if (!longer || isLast) this.finishUnit();
  }

  private finishUnit(): void {
    const unit = this.units[this.index];
    this.habit.history.set(unit.kana, this.current);
    for (const t of tagsOf(this.current)) this.habit.tagCount.set(t, (this.habit.tagCount.get(t) ?? 0) + 1);
    this.doneRomaji += this.current;
    this.doneKana += unit.kana.length;
    this.current = "";
    this.index++;
    this.skipSymbols();
  }

  private skipSymbols(): void {
    while (this.index < this.units.length && this.units[this.index].skip) {
      this.doneKana += this.units[this.index].kana.length;
      this.index++;
    }
  }

  /** 今の時点で正しいキーと、そのキーで続く候補。標準の綴りの次の字が先頭。 */
  private options(): Option[] {
    const unit = this.units[this.index];
    const pos = this.current.length;
    const list: Option[] = [];
    for (const c of this.alive(unit, this.current)) {
      if (c.romaji.length > pos) list.push({ key: c.romaji[pos], unit, cand: c, pos });
    }
    const following = this.followingIfComplete();
    if (following) {
      const tail = following.candidates.map((c) => ({ key: c.romaji[0], unit: following, cand: c, pos: 0 }));
      // 標準では、今の単位はここで打ち終わる(ん の n)ので、次の単位の方を先に置く
      const standardEnds = this.alive(unit, this.current)[0]?.romaji === this.current;
      list.splice(standardEnds ? 0 : list.length, 0, ...tail);
    }
    return list;
  }

  private makeMiss(typed: string): Miss {
    const opts = this.options();
    const expected = [...new Set(opts.map((o) => o.key))];
    const counted = this.pickCounted(opts, expected);
    const chosen = opts.find((o) => o.key === counted)!;
    return { kana: kanaAt(chosen), expected, counted, typed };
  }

  /** 集計で数えるキーを選ぶ。1 つならそれ。複数なら、これまでの打ち方に合う方。選べなければ先頭。 */
  private pickCounted(opts: Option[], expected: string[]): string {
    if (expected.length <= 1) return expected[0] ?? "";
    // 同じかなを前に打ったときの綴りに続くキー
    for (const o of opts) {
      if (this.habit.history.get(o.unit.kana) === o.cand.romaji) return o.key;
    }
    // sh / sy などの癖が、これまでの打ち方に多く出ている方
    let best = expected[0];
    let bestScore = 0;
    for (const e of expected) {
      for (const o of opts.filter((x) => x.key === e)) {
        const score = tagsOf(o.cand.romaji).reduce((s, t) => s + (this.habit.tagCount.get(t) ?? 0), 0);
        if (score > bestScore) {
          best = e;
          bestScore = score;
        }
      }
    }
    return best;
  }
}

/** 候補の pos 字目を打つときの、かな(その綴りの部分が受け持つかな) */
function kanaAt(o: Option): string {
  let len = 0;
  let off = 0;
  for (const s of o.cand.segments) {
    if (o.pos < len + s.romaji.length) return o.unit.kana.slice(off, off + s.kana);
    len += s.romaji.length;
    off += s.kana;
  }
  return o.unit.kana;
}
