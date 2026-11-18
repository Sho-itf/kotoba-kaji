// 稽古 1 回ぶんの流れ(時間・キー・終わり方)。画面は、返ってきた出来事を見て描き直すだけにする。

import { decidePlayKey, type KeyInfo } from "./input.ts";
import { Keiko, type FinishedSentence, type RunResult } from "./keiko.ts";

export type PracticeEvent =
  /** 何もしない(ブラウザ本来の動きを止めるかだけ返す) */
  | { type: "none"; preventDefault: boolean }
  /** 日本語入力がオン。案内を出す。 */
  | { type: "ime"; preventDefault: boolean }
  /** 正しいキーで進んだ(sentence は、文を打ち終えたときだけ) */
  | { type: "progress"; preventDefault: boolean; finished?: FinishedSentence }
  | { type: "miss"; preventDefault: boolean }
  /** 時間切れ。この回の結果。 */
  | { type: "timeup"; preventDefault: boolean; result: RunResult }
  /** Esc で中断。この回は記録しない。 */
  | { type: "abort"; preventDefault: boolean };

export type PracticeState = "playing" | "finished" | "aborted";

export class Practice {
  readonly keiko: Keiko;
  private _state: PracticeState = "playing";
  private readonly startAt: number;
  private readonly durationMs: number;

  constructor(keiko: Keiko, startAt: number, durationMs: number) {
    this.keiko = keiko;
    this.startAt = startAt;
    this.durationMs = durationMs;
  }

  get state(): PracticeState {
    return this._state;
  }

  /** 残り時間(ミリ秒)。タブを隠しても時間は進む。 */
  remaining(now: number): number {
    return Math.max(0, this.durationMs - (now - this.startAt));
  }

  /** 時間を確かめる。時間切れなら、結果を返して終える。 */
  tick(now: number): PracticeEvent | null {
    if (this._state !== "playing" || this.remaining(now) > 0) return null;
    this._state = "finished";
    return { type: "timeup", preventDefault: false, result: this.keiko.result() };
  }

  /** キーを 1 つ受け取る。毎回、先に時間を確かめる(時間切れのあとのキーは数えない)。 */
  handleKey(e: KeyInfo, now: number): PracticeEvent {
    if (this._state !== "playing") return { type: "none", preventDefault: false };

    const over = this.tick(now);
    if (over) return { ...over, preventDefault: true };

    const { action, preventDefault } = decidePlayKey(e);
    switch (action.type) {
      case "abort":
        this._state = "aborted";
        return { type: "abort", preventDefault };
      case "ime":
        return { type: "ime", preventDefault };
      case "ignore":
        return { type: "none", preventDefault };
      case "type": {
        const { result, finished } = this.keiko.input(action.key);
        if (result === "miss") return { type: "miss", preventDefault };
        if (result === "ignored") return { type: "none", preventDefault };
        return { type: "progress", preventDefault, finished };
      }
    }
  }
}
