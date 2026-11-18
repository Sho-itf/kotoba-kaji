// 稽古 1 回ぶんの進行。時間は画面側で数え、ここは打鍵・ミス・文の切り替えだけを扱う。

import { RomajiTyper, type InputResult } from "../romaji/index.ts";
import { Deck, type Rng } from "./deck.ts";
import { calcScore } from "./score.ts";
import type { Sentence } from "./sentences.ts";

export interface FinishedSentence {
  sentence: Sentence;
  /** ミスなしで打ち終えたか(一本) */
  ippon: boolean;
}

export interface KeikoInput {
  result: InputResult;
  /** この 1 キーで文を打ち終えたとき */
  finished?: FinishedSentence;
}

export interface RunResult {
  keystrokes: number;
  misses: number;
  accuracy: number;
  score: number;
  /** 打ち終えた文の数 */
  sentences: number;
  ippon: number;
  /** ミスしたキーの集計("かな:キー" → 回数)。稽古 1 回ぶん。 */
  missKeys: Record<string, number>;
}

export class Keiko {
  private readonly deck: Deck;
  private _sentence!: Sentence;
  private _typer!: RomajiTyper;
  private sentenceMisses = 0;
  private keystrokes = 0;
  private misses = 0;
  private finishedCount = 0;
  private ippon = 0;
  private readonly missKeys = new Map<string, number>();
  /** 直前に打ち終えた文 */
  previous: FinishedSentence | null = null;

  constructor(sentences: readonly Sentence[], rng: Rng = Math.random) {
    this.deck = new Deck(sentences, rng);
    this.advance();
  }

  /** 今のお題 */
  get sentence(): Sentence {
    return this._sentence;
  }

  /** 今のお題の判定 */
  get typer(): RomajiTyper {
    return this._typer;
  }

  /** 1 キー受け取る */
  input(key: string): KeikoInput {
    const result = this._typer.input(key);
    if (result === "ignored") return { result };

    if (result === "miss") {
      this.misses++;
      this.sentenceMisses++;
      const m = this._typer.misses[this._typer.misses.length - 1];
      const id = `${m.kana}:${m.counted}`;
      this.missKeys.set(id, (this.missKeys.get(id) ?? 0) + 1);
      return { result };
    }

    this.keystrokes++;
    if (result === "complete") {
      const finished = { sentence: this._sentence, ippon: this.sentenceMisses === 0 };
      this.finishedCount++;
      if (finished.ippon) this.ippon++;
      this.previous = finished;
      this.advance();
      return { result, finished };
    }
    return { result };
  }

  /** 今までの結果(打ち終えていない文の打鍵・ミスも含める) */
  result(): RunResult {
    const { accuracy, score } = calcScore(this.keystrokes, this.misses);
    return {
      keystrokes: this.keystrokes,
      misses: this.misses,
      accuracy,
      score,
      sentences: this.finishedCount,
      ippon: this.ippon,
      missKeys: Object.fromEntries(this.missKeys),
    };
  }

  private advance(): void {
    // 読みが記号だけの文は打つものが無いので飛ばす
    for (let tries = 0; tries < 100; tries++) {
      const s = this.deck.next();
      const typer = new RomajiTyper(s.kana);
      if (!typer.done) {
        this._sentence = s;
        this._typer = typer;
        this.sentenceMisses = 0;
        return;
      }
    }
    throw new Error("打てる文がありません");
  }
}
