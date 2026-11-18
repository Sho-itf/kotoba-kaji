// 画面の切り替えと、キー入力・時間の扱い。画面は「待機」「稽古」「結果」の 3 つ。

import { DURATION_MS, RESULT_GUARD_MS, TOP_MISSES } from "../game/config.ts";
import { highlightRange } from "../game/highlight.ts";
import { decideMenuKey, type KeyInfo } from "../game/input.ts";
import { Keiko, type RunResult } from "../game/keiko.ts";
import { Practice, type PracticeEvent } from "../game/practice.ts";
import { accuracyShortfallNote, nextRankNote, rankUpNote } from "../game/messages.ts";
import { accuracyTenths, formatAccuracy, type Rank } from "../game/ranks.ts";
import { formatTenths, keysPerSecondTenths, topMisses } from "../game/score.ts";
import { loadSentences, type Sentence } from "../game/sentences.ts";
import { claimedRank, parseRecord, serializeRecord, type RecordData, type Run } from "../storage/record.ts";
import { commitRun, getLocalStorage, loadRecord, saveRecord, type KeyValueStore } from "../storage/store.ts";
import { isTouchOnly } from "./device.ts";
import { ctaButton, el, rankSeal, siteBar, stage } from "./dom.ts";

/** ミリ秒を「8.5」「1」のように秒で表す */
function formatSeconds(ms: number): string {
  return String(Math.round(ms / 100) / 10);
}

type Screen = "loading" | "error" | "idle" | "play" | "result";

interface PlayState {
  practice: Practice;
  timer: number;
  view: PlayView;
}

function keyInfo(e: KeyboardEvent): KeyInfo {
  const t = e.target;
  return {
    key: e.key, repeat: e.repeat, isComposing: e.isComposing, keyCode: e.keyCode,
    ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
    fromControl: t instanceof HTMLButtonElement || t instanceof HTMLInputElement || t instanceof HTMLAnchorElement,
  };
}

interface PlayView {
  timeText: HTMLElement;
  barFill: HTMLElement;
  barExtra: HTMLElement;
  card: HTMLElement;
  sentence: HTMLElement;
  kanaDone: HTMLElement;
  kanaRest: HTMLElement;
  romajiTyped: HTMLElement;
  romajiRest: HTMLElement;
  notice: HTMLElement;
  ippon: HTMLElement;
  bonus: HTMLElement;
  prev: HTMLElement;
  missTimer: number;
  ipponTimer: number;
  bonusTimer: number;
}

export function startApp(root: HTMLElement): void {
  const store: KeyValueStore | null = getLocalStorage();
  const loaded = loadRecord(store);
  let record: RecordData = loaded.record;
  let sentences: Sentence[] = [];
  let screen: Screen = "loading";
  let play: PlayState | null = null;
  let resultShownAt = 0;
  let message = loaded.broken ? "前の記録を読めませんでした。新しい記録で始めます。" : "";
  let saveFailed = false;
  const touchOnly = isTouchOnly(typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : undefined);

  const show = (...nodes: Node[]) => root.replaceChildren(...nodes);

  // ---------- 待機の画面 ----------
  function renderIdle(): void {
    screen = "idle";
    const bestScore = record.best?.score ?? 0;
    const rank = claimedRank(record);
    const nextNote = nextRankNote(rank, bestScore);

    const fileInput = el("input", { attrs: { type: "file", accept: "application/json,.json", hidden: "" } });
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) void importFile(file);
    });

    const start = ctaButton("稽古を始める");
    start.addEventListener("click", startPlay);
    const exportBtn = el("button", { text: "記録を書き出す", attrs: { type: "button" } });
    exportBtn.addEventListener("click", exportRecord);
    const importBtn = el("button", { text: "記録を取り込む", attrs: { type: "button" } });
    importBtn.addEventListener("click", () => fileInput.click());

    show(
      stage({ bar: siteBar() },
        el("main", { class: "idle-main" },
          start,
          el("div", { class: "links" }, exportBtn, el("span", { class: "vline" }), importBtn, fileInput),
          el("div", { class: "standing" },
            el("span", { class: "item" }, rankSeal(rank.name, rank.dan)),
            el("span", { class: "item" }, "ベスト ", el("span", { class: "num", text: record.best ? String(record.best.score) : "―" })),
            nextNote ? el("span", { class: "item", text: nextNote }) : el("span"),
          ),
          touchOnly ? el("p", { class: "touch-note", text: "キーボードのある端末で稽古してください。" }) : el("span"),
          el("div", { class: "howto" },
            el("p", { text: "Enter か Space で稽古を始める ・ Esc で中断(中断した回は記録しない)" }),
            el("p", { text: "稽古は 60 秒から。一本(ミスなしの 1 文)を取ると時間が延びます。入力は半角英数にしてください。" }),
          ),
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
    const practice = new Practice(new Keiko(sentences), performance.now(), DURATION_MS);
    const view = buildPlayView();
    show(view.root);
    const state: PlayState = { practice, timer: 0, view: view.parts };
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
    window.clearTimeout(play.view.bonusTimer);
    play = null;
  }

  function buildPlayView(): { root: HTMLElement; parts: PlayView } {
    const timeText = el("span", { class: "num", text: "60" });
    const bonus = el("span", { class: "bonus", attrs: { "aria-hidden": "true" } });
    const barFill = el("i");
    const barExtra = el("b");
    const sentence = el("p", { class: "sentence", attrs: { lang: "ja" } });
    const kanaDone = el("span", { class: "done" });
    const kanaRest = el("span", { class: "rest" });
    const romajiTyped = el("span", { class: "typed" });
    const romajiRest = el("span", { class: "rest" });
    const notice = el("p", { class: "notice", attrs: { role: "alert" } });
    const ippon = el("div", { class: "ippon-row", text: "一本", attrs: { "aria-live": "polite" } });
    const prev = el("p", { class: "prev" });
    const timer = el("div", { class: "timer" },
      el("span", { class: "lbl", text: "残り" }), timeText, el("span", { class: "unit", text: "秒" }), bonus);
    const rootNode = stage({ dim: true, bar: siteBar(timer) },
      el("main", { class: "play-main" },
        ippon,
        sentence,
        el("p", { class: "kana", attrs: { lang: "ja" } }, kanaDone, kanaRest),
        el("div", { class: "field", attrs: { "aria-hidden": "true" } },
          el("p", { class: "line" }, romajiTyped, el("span", { class: "caret" }), romajiRest)),
        notice,
        prev,
      ),
      el("div", { class: "timeline" }, barFill, barExtra),
    );
    return {
      root: rootNode,
      parts: { timeText, barFill, barExtra, card: rootNode, sentence, kanaDone, kanaRest, romajiTyped, romajiRest, notice, ippon, bonus, prev, missTimer: 0, ipponTimer: 0, bonusTimer: 0 },
    };
  }

  function setSentence(state: PlayState): void {
    const keiko = state.practice.keiko;
    const view = state.view;
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
    const { typer, sentence } = state.practice.keiko;
    const v = state.view;
    v.kanaDone.textContent = sentence.kana.slice(0, typer.kanaDone);
    v.kanaRest.textContent = sentence.kana.slice(typer.kanaDone);
    v.romajiTyped.textContent = typer.typed;
    v.romajiRest.textContent = typer.remaining;
  }

  function updateTime(state: PlayState): void {
    const left = state.practice.remaining(performance.now());
    state.view.timeText.textContent = String(Math.ceil(left / 1000));
    // 時間の線:最初の 60 秒ぶんは朱、60 秒を超えて延びたぶんは右に明るい朱で足す。
    // 全体の長さを「残り時間(60 秒より長いとき)」に取るので、時間が減ると、先に延びたぶんから縮む。
    const scale = Math.max(DURATION_MS, left);
    state.view.barFill.style.width = `${(Math.min(left, DURATION_MS) / scale) * 100}%`;
    state.view.barExtra.style.width = `${((left - Math.min(left, DURATION_MS)) / scale) * 100}%`;
    const over = state.practice.tick(performance.now());
    if (over && over.type === "timeup") finishPlay(state, over.result);
  }

  function finishPlay(state: PlayState, run: RunResult): void {
    if (play !== state) return;
    stopPlay();
    const entry: Run = {
      at: new Date().toISOString(),
      keystrokes: run.keystrokes,
      misses: run.misses,
      accuracy: run.accuracy,
      score: run.score,
      sentences: run.sentences,
      ippon: run.ippon,
    };
    // 保存の直前に、保存されている記録を読み直してから足す
    const done = commitRun(store, record, entry, run.missKeys);
    record = done.record;
    saveFailed = !done.saved;
    renderResult(run, state.practice.bonusMs, state.practice.totalMs, done.newBest, claimedRank(done.previous), claimedRank(record));
  }

  function onPlayKey(e: KeyboardEvent): void {
    const state = play;
    if (!state) return;
    const ev: PracticeEvent = state.practice.handleKey(keyInfo(e), performance.now());
    if (ev.preventDefault) e.preventDefault();
    const v = state.view;
    switch (ev.type) {
      case "abort":
        stopPlay();
        renderIdle();
        return;
      case "timeup":
        finishPlay(state, ev.result);
        return;
      case "ime":
        v.notice.textContent = "入力を半角英数にしてください。";
        return;
      case "none":
        return;
      case "miss":
        v.notice.textContent = "";
        v.card.classList.add("miss");
        window.clearTimeout(v.missTimer);
        v.missTimer = window.setTimeout(() => v.card.classList.remove("miss"), 160);
        return;
      case "progress":
        v.notice.textContent = "";
        if (ev.finished) {
          if (ev.finished.ippon) {
            v.ippon.classList.add("show");
            if (ev.bonusMs) {
              v.bonus.textContent = `+${formatSeconds(ev.bonusMs)} 秒`;
              v.bonus.classList.add("show");
              window.clearTimeout(v.bonusTimer);
              v.bonusTimer = window.setTimeout(() => v.bonus.classList.remove("show"), 1200);
              updateTime(state);
            }
            window.clearTimeout(v.ipponTimer);
            v.ipponTimer = window.setTimeout(() => v.ippon.classList.remove("show"), 900);
          }
          setSentence(state);
        } else {
          updateTyping(state);
        }
        return;
    }
  }

  // ---------- 結果の画面 ----------
  function renderResult(run: RunResult, bonusMs: number, totalMs: number, newBest: boolean, rankBefore: Rank, rankAfter: Rank): void {
    screen = "result";
    resultShownAt = performance.now();
    const misses = topMisses(run.missKeys, TOP_MISSES);
    const row = (label: string, value: string) => el("div", { class: "row" }, el("dt", { text: label }), el("dd", { text: value }));

    const notes: Node[] = [];
    if (newBest) notes.push(el("p", { class: "note", text: "ベストを更新しました。" }));
    const up = rankUpNote(rankBefore, rankAfter);
    if (up) notes.push(el("p", { class: "note", text: up }));
    const shortfall = accuracyShortfallNote(run);
    if (shortfall) notes.push(el("p", { class: "note", text: shortfall }));
    if (saveFailed) notes.push(el("p", { class: "note", text: "この環境では記録を保存できませんでした。" }));

    const again = ctaButton("もう一度", true);
    again.addEventListener("click", startPlay);

    show(
      stage({ dim: true, bar: siteBar() },
        el("main", { class: "result-main" },
          el("h1", { class: "heading" }, el("span", { text: "稽古の結果" })),
          el("div", { class: "cols" },
            el("section", {},
              el("div", { class: "score-line" },
                el("span", { class: "lbl", text: "スコア" }),
                el("span", { class: "score", text: String(run.score) }),
                rankSeal(rankAfter.name, rankAfter.dan),
              ),
              el("dl", { class: "stats" },
                row("打鍵数", String(run.keystrokes)),
                row("1 秒あたりの打鍵数", formatTenths(keysPerSecondTenths(run.keystrokes, totalMs))),
                ...(bonusMs > 0 ? [row("延びた時間", `${formatSeconds(bonusMs)} 秒`)] : []),
                row("正確さ", `${formatAccuracy(accuracyTenths(run.keystrokes, run.misses))} %`),
                row("打てた文", `${run.sentences} 文`),
                row("一本", `${run.ippon} 本`),
                row("ミス", `${run.misses} 回`),
                row("ベスト", record.best ? String(record.best.score) : "―"),
              ),
              ...notes,
            ),
            el("div", { class: "divider" }),
            el("section", { class: "misses" },
              el("h3", { text: "ミスの多いキー" }),
              misses.length === 0
                ? el("p", { class: "none", text: "ミスはありませんでした。" })
                : el("ol", {}, ...misses.map((m, i) => el("li", {},
                    el("span", { class: "n", text: `${i + 1}.` }),
                    el("span", {}, `「${m.kana}」の `, el("code", { text: m.key })),
                    el("span", { class: "times", text: `${m.count} 回` })))),
            ),
          ),
          again,
          el("div", { class: "howto" }, el("p", { text: "Enter か Space でもう一度 ・ Esc で戻る" })),
        ),
      ),
    );
  }

  // ---------- 全体のキー入力 ----------
  window.addEventListener("keydown", (e) => {
    if (screen === "play") return onPlayKey(e);
    if (screen !== "idle" && screen !== "result") return;
    const d = decideMenuKey(screen, keyInfo(e), performance.now() - resultShownAt, RESULT_GUARD_MS);
    if (d.preventDefault) e.preventDefault();
    if (d.action === "start") startPlay();
    else if (d.action === "idle") renderIdle();
  });

  // ---------- 起動 ----------
  show(stage({ bar: siteBar() }, el("main", { class: "idle-main" }, el("p", { class: "status", text: "読み込み中です。" }))));
  loadSentences(import.meta.env.BASE_URL)
    .then((list) => {
      sentences = list;
      renderIdle();
    })
    .catch(() => {
      screen = "error";
      show(stage({ bar: siteBar() }, el("main", { class: "idle-main" }, el("p", { class: "status", text: "例文を読み込めませんでした。ページを開き直してください。" }))));
    });
}
