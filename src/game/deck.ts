// お題の選び方。シャッフルした順に出すので、1 周するまで同じ文は出ない。

import type { Sentence } from "./sentences.ts";

export type Rng = () => number;

export class Deck {
  private order: Sentence[] = [];
  private pos = 0;
  private readonly sentences: readonly Sentence[];
  private readonly rng: Rng;

  constructor(sentences: readonly Sentence[], rng: Rng = Math.random) {
    if (sentences.length === 0) throw new Error("例文がありません");
    this.sentences = sentences;
    this.rng = rng;
    this.shuffle();
  }

  next(): Sentence {
    if (this.pos >= this.order.length) {
      const last = this.order[this.order.length - 1];
      this.shuffle();
      // 周の切れ目で、同じ文が続けて出ないようにする
      if (this.order.length > 1 && this.order[0] === last) {
        [this.order[0], this.order[1]] = [this.order[1], this.order[0]];
      }
    }
    return this.order[this.pos++];
  }

  private shuffle(): void {
    this.order = [...this.sentences];
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    this.pos = 0;
  }
}
