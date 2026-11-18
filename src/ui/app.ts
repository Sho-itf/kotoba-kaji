// 画面の切り替えと、キー入力・時間の扱い。画面は「待機」「稽古」「結果」の 3 つ。

import { DURATION_MS, RESULT_GUARD_MS, TOP_MISSES } from "../game/config.ts";
import { highlightRange } from "../game/highlight.ts";
import { Keiko, type RunResult } from "../game/keiko.ts";
import { nextRank, rankOf } from "../game/ranks.ts";
import { topMisses } from "../game/score.ts";
import { loadSentences, type Sentence } from "../game/sentences.ts";
import { applyRun, parseRecord, serializeRecord, type RecordData, type Run } from "../storage/record.ts";
import { getLocalStorage, loadRecord, saveRecord, type KeyValueStore } from "../storage/store.ts";
import { el, rankSeal } from "./dom.ts";

type Screen = "loading" | "error" | "idle" | "play" | "result";

interface PlayState {
  keiko: Keiko;
  startAt: number;
  timer: number;
  view: PlayView;
}

interface PlayView {
  timeText: HTMLElement;
  barFill: HTMLElement;
  card: HTMLElement;
  sentence: HTMLElement;
  kanaDone: HTMLElement;
  kanaRest: HTMLElement;
  romajiTyped: HTMLElement;
  romajiRest: HTMLElement;
  notice: HTMLElement;
  ippon: HTMLElement;
  prev: HTMLElement;
  missTimer: number;
  ipponTimer: number;
}

export function startApp(root: HTMLElement): void {
  const store: KeyValueStore | null = getLocalStorage();
  let record: RecordData = loadRecord(store);
  let sentences: Sentence[] = [];
  let screen: Screen = "loading";
  let play: PlayState | null = null;
  let resultShownAt = 0;
  let message = "";
  let saveFailed = false;

  const show = (...nodes: Node[]) => root.replaceChildren(...nodes);

  // ---------- 待機の画面 ----------
  function renderIdle(): void {
    screen = "idle";
    const bestScore = record.best?.score ?? 0;
    const rank = rankOf(bestScore);
    const next = nextRank(bestScore);

    const fileInput = el("input", { attrs: { type: "file", accept: "application/json,.json", hidden: "" } });
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) void importFile(file);
    });

    const start = el("button", { class: "primary", text: "稽古を始める", attrs: { type: "button" } });
    start.addEventListener("click", startPlay);
    const exportBtn = el("button", { class: "quiet", text: "記録を書き出す", attrs: { type: "button" } });
    exportBtn.addEventListener("click", exportRecord);
    const importBtn = el("button", { class: "quiet", text: "記録を取り込む", attrs: { type: "button" } });
    importBtn.addEventListener("click", () => fileInput.click());

    show(
      el("main", { class: "screen idle" },
        el("h1", { class: "title", text: "ことば鍛冶" }),
        el("p", { class: "lead", text: "語彙の例文を、読みのローマ字で打つ稽古です。" }),
        el("section", { class: "standing" },
          el("div", { class: "standing-rank" }, el("span", { class: "label", text: "位" }), rankSeal(rank.name, rank.dan)),
          el("div", { class: "standing-best" },
            el("span", { class: "label", text: "ベスト" }),
            el("span", { class: "num", text: record.best ? String(record.best.score) : "―" }),
          ),
          el("p", { class: "muted small", text: next ? `次の ${next.name} まで あと ${next.min - bestScore}` : "いちばん上の位です。" }),
        ),
        el("ul", { class: "howto" },
          el("li", { text: "Enter か Space で稽古を始める" }),
          el("li", { text: "Esc で中断(中断した回は記録しない)" }),
          el("li", { text: "稽古は 60 秒。入力は半角英数にしてください" }),
        ),
        start,
        el("footer", { class: "foot" },
          el("div", { class: "tools" }, exportBtn, importBtn, fileInput),
          el("p", { class: "status", text: message, attrs: { role: "status" } }),
          store ? el("span") : el("p", { class: "status", text: "この環境では記録を保存できません。遊ぶことはできます。" }),
        ),
      ),
    );
    message = "";
  }

  function exportRecord(): void {
    const blob = new Blob([serializeRecord(record)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { attrs: { href: url, download: `kotoba-kaji-記録-${new Date().toISOString().slice(0, 10)}.json` } });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("記録を書き出しました。");
  }

  async function importFile(file: File): Promise<void> {
    if (file.size > 2_000_000) return setStatus("ファイルが大きすぎるので、読み込めません。");
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setStatus("ファイルを読めませんでした。");
    }
    const parsed = parseRecord(text);
    if (!parsed.ok) return setStatus(parsed.error);
    const now = record.best ? `${record.best.score}` : "なし";
    const incoming = parsed.record.best ? `${parsed.record.best.score}` : "なし";
    const ok = window.confirm(
      `今の記録を、読み込んだ記録に置き換えます。\nベスト:${now} → ${incoming}\n稽古の記録:${record.history.length} 回 → ${parsed.record.history.length} 回\nよろしいですか。`,
    );
    if (!ok) return setStatus("取り込みをやめました。");
    record = parsed.record;
    saveFailed = !saveRecord(store, record);
    message = saveFailed ? "取り込みましたが、保存できませんでした(この画面を閉じるまで有効です)。" : "記録を取り込みました。";
    renderIdle();
  }

  function setStatus(text: string): void {
    message = text;
    if (screen === "idle") renderIdle();
  }

  // ---------- 稽古の画面 ----------
  function startPlay(): void {
    if (sentences.length === 0) return;
    stopPlay();
    screen = "play";
    const keiko = new Keiko(sentences);
    const view = buildPlayView();
    show(view.root);
    const state: PlayState = { keiko, startAt: performance.now(), timer: 0, view: view.parts };
    play = state;
    setSentence(state);
    updateTime(state);
    state.timer = window.setInterval(() => updateTime(state), 100);
  }

  function stopPlay(): void {
    if (!play) return;
    window.clearInterval(play.timer);
    window.clearTimeout(play.view.missTimer);
    window.clearTimeout(play.view.ipponTimer);
    play = null;
  }

  function buildPlayView(): { root: HTMLElement; parts: PlayView } {
    const timeText = el("span", { class: "time", text: "60" });
    const barFill = el("div", { class: "bar-fill" });
    const sentence = el("p", { class: "sentence", attrs: { lang: "ja" } });
    const kanaDone = el("span", { class: "done" });
    const kanaRest = el("span", { class: "rest" });
    const romajiTyped = el("span", { class: "typed" });
    const romajiRest = el("span", { class: "rest" });
    const notice = el("p", { class: "notice", attrs: { role: "alert" } });
    const ippon = el("span", { class: "ippon", text: "一本", attrs: { "aria-live": "polite" } });
    const prev = el("p", { class: "prev" });
    const card = el("section", { class: "card" },
      sentence,
      el("p", { class: "kana", attrs: { lang: "ja" } }, kanaDone, kanaRest),
      el("p", { class: "romaji" }, romajiTyped, romajiRest),
    );
    const rootNode = el("main", { class: "screen play" },
      el("header", { class: "hud" },
        el("span", { class: "label", text: "残り" }),
        el("span", {}, timeText, el("span", { class: "unit", text: " 秒" })),
        el("span", { class: "hud-gap" }),
        ippon,
      ),
      el("div", { class: "bar" }, barFill),
      card,
      notice,
      prev,
      el("p", { class: "hint", text: "Esc で中断" }),
    );
    return {
      root: rootNode,
      parts: { timeText, barFill, card, sentence, kanaDone, kanaRest, romajiTyped, romajiRest, notice, ippon, prev, missTimer: 0, ipponTimer: 0 },
    };
  }

  function setSentence(state: PlayState): void {
    const { keiko, view } = state;
    const s = keiko.sentence;
    const range = highlightRange(s.text, s.word, s.wordReading);
    const nodes: (Node | string)[] = [];
    if (range) {
      nodes.push(s.text.slice(0, range.start), el("mark", { text: s.text.slice(range.start, range.end) }), s.text.slice(range.end));
    } else {
      nodes.push(s.text);
    }
    view.sentence.replaceChildren(...nodes);
    const p = keiko.previous;
    view.prev.replaceChildren(
      ...(p ? [`${p.sentence.word}(${p.sentence.wordReading})― ${p.sentence.meaning}`] : []),
    );
    updateTyping(state);
  }

  function updateTyping(state: PlayState): void {
    const { typer, sentence } = state.keiko;
    const v = state.view;
    v.kanaDone.textContent = sentence.kana.slice(0, typer.kanaDone);
    v.kanaRest.textContent = sentence.kana.slice(typer.kanaDone);
    v.romajiTyped.textContent = typer.typed;
    v.romajiRest.textContent = typer.remaining;
  }

  function updateTime(state: PlayState): void {
    const left = Math.max(0, DURATION_MS - (performance.now() - state.startAt));
    state.view.timeText.textContent = String(Math.ceil(left / 1000));
    state.view.barFill.style.width = `${(left / DURATION_MS) * 100}%`;
    if (left <= 0) finishPlay(state);
  }

  function finishPlay(state: PlayState): void {
    if (play !== state) return;
    const run = state.keiko.result();
    stopPlay();
    const before = rankOf(record.best?.score ?? 0);
    const entry: Run = {
      at: new Date().toISOString(),
      keystrokes: run.keystrokes,
      misses: run.misses,
      accuracy: run.accuracy,
      score: run.score,
      sentences: run.sentences,
      ippon: run.ippon,
    };
    const applied = applyRun(record, entry, run.missKeys);
    record = applied.record;
    saveFailed = !saveRecord(store, record);
    renderResult(run, applied.newBest, before.name, rankOf(record.best?.score ?? 0));
  }

  function onPlayKey(e: KeyboardEvent): void {
    const state = play;
    if (!state) return;
    if (e.key === "Escape") {
      stopPlay();
      renderIdle();
      return;
    }
    // 日本語入力がオンのときは、打鍵として扱わず、案内を出す(ミスには数えない)
    if (e.isComposing || e.key === "Process" || e.keyCode === 229) {
      state.view.notice.textContent = "入力を半角英数にしてください。";
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return; // ブラウザのショートカットは邪魔しない
    if (e.key.length !== 1) return;
    e.preventDefault();
    state.view.notice.textContent = "";

    const { result, finished } = state.keiko.input(e.key);
    if (result === "miss") {
      const v = state.view;
      v.card.classList.add("miss");
      window.clearTimeout(v.missTimer);
      v.missTimer = window.setTimeout(() => v.card.classList.remove("miss"), 160);
    }
    if (finished) {
      if (finished.ippon) {
        const v = state.view;
        v.ippon.classList.add("show");
        window.clearTimeout(v.ipponTimer);
        v.ipponTimer = window.setTimeout(() => v.ippon.classList.remove("show"), 900);
      }
      setSentence(state);
    } else {
      updateTyping(state);
    }
  }

  // ---------- 結果の画面 ----------
  function renderResult(run: RunResult, newBest: boolean, rankBefore: string, rankAfter: ReturnType<typeof rankOf>): void {
    screen = "result";
    resultShownAt = performance.now();
    const misses = topMisses(run.missKeys, TOP_MISSES);
    const row = (label: string, value: string) => el("div", { class: "row" }, el("dt", { text: label }), el("dd", { text: value }));

    const notes: Node[] = [];
    if (newBest) notes.push(el("p", { class: "note accent", text: "ベストを更新しました。" }));
    if (rankAfter.name !== rankBefore) notes.push(el("p", { class: "note accent", text: `位が上がりました:${rankBefore} → ${rankAfter.name}` }));
    if (saveFailed) notes.push(el("p", { class: "note muted", text: "この環境では記録を保存できませんでした。" }));

    show(
      el("main", { class: "screen result" },
        el("h2", { class: "heading", text: "稽古の結果" }),
        el("div", { class: "score-line" },
          el("span", { class: "label", text: "スコア" }),
          el("span", { class: "score", text: String(run.score) }),
          rankSeal(rankAfter.name, rankAfter.dan),
        ),
        ...notes,
        el("dl", { class: "stats" },
          row("1 分あたりの打鍵数", String(run.keystrokes)),
          row("正確さ", `${(run.accuracy * 100).toFixed(1)} %`),
          row("打てた文", `${run.sentences} 文`),
          row("一本", `${run.ippon} 本`),
          row("ミス", `${run.misses} 回`),
          row("ベスト", record.best ? String(record.best.score) : "―"),
        ),
        el("section", { class: "misses" },
          el("h3", { text: "ミスの多いキー" }),
          misses.length === 0
            ? el("p", { class: "muted", text: "ミスはありませんでした。" })
            : el("ol", {}, ...misses.map((m) => el("li", {}, `「${m.kana}」の `, el("code", { text: m.key }), `  ${m.count} 回`))),
        ),
        el("p", { class: "hint", text: "Enter か Space でもう一度 ・ Esc で戻る" }),
      ),
    );
  }

  // ---------- 全体のキー入力 ----------
  window.addEventListener("keydown", (e) => {
    if (screen === "play") return onPlayKey(e);
    if (screen !== "idle" && screen !== "result") return;
    // ボタンやファイル選択の上では、そのキーはボタンのものにする
    const t = e.target;
    if (t instanceof HTMLButtonElement || t instanceof HTMLInputElement || t instanceof HTMLAnchorElement) return;
    if (e.repeat || e.isComposing) return;
    if (e.key === "Enter" || e.key === " ") {
      if (screen === "result" && performance.now() - resultShownAt < RESULT_GUARD_MS) return;
      e.preventDefault();
      startPlay();
    } else if (e.key === "Escape" && screen === "result") {
      renderIdle();
    }
  });

  // ---------- 起動 ----------
  show(el("main", { class: "screen" }, el("p", { class: "muted", text: "読み込み中です。" })));
  loadSentences(import.meta.env.BASE_URL)
    .then((list) => {
      sentences = list;
      renderIdle();
    })
    .catch(() => {
      screen = "error";
      show(el("main", { class: "screen" }, el("h1", { class: "title", text: "ことば鍛冶" }), el("p", { text: "例文を読み込めませんでした。ページを開き直してください。" })));
    });
}
