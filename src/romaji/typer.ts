// ローマ字の判定(状態機械)。
// 状態 = 「今どの単位を打っているか」と「その単位で何を打ったか」。
// 1 キー受け取るたびに、正解の候補を絞り込んで次の状態を決める。

import { toUnits, type Candidate, type Unit } from "./units.ts";

/** 1 キーの結果。ignored は Shift などの文字でないキーや、打ち終えた後のキー。 */
export type InputResult = "progress" | "miss" | "complete" | "ignored";

/** ミス 1 回の記録 */
export interface Miss {
  /** 打っていた単位のかな */
  kana: string;
  /** 打つべきだったキー(標準の綴りでの次の 1 字) */
  expected: string;
  /** 実際に打ったキー */
  typed: string;
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

  constructor(kana: string) {
    this.kana = kana;
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
    if (this.isComplete(unit, this.current)) {
      const following = this.units.slice(this.index + 1).find((u) => !u.skip);
      if (following && this.alive(following, k).length > 0) {
        this.finishUnit();
        this.current = k;
        this.correctKeys++;
        this.settle();
        return this.done ? "complete" : "progress";
      }
    }

    this.missList.push({ kana: this.missKana(), expected: this.remaining[0] ?? "", typed: k });
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

  /** ミスしたキーの集計。「かな:打つべきだったキー」ごとの回数。 */
  missSummary(): Map<string, number> {
    const m = new Map<string, number>();
    for (const x of this.missList) {
      const key = `${x.kana}:${x.expected}`;
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

  /** ミスを数える単位のかな。今の単位が打ち終えられる形なら、次の単位。 */
  private missKana(): string {
    const unit = this.units[this.index];
    if (this.isComplete(unit, this.current)) {
      const following = this.units.slice(this.index + 1).find((u) => !u.skip);
      if (following) return following.kana;
    }
    return unit.kana;
  }
}
