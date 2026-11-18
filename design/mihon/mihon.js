// 見本の画面を作る(例の値は決め打ち)。本番のコードではない。
const ANVIL = '<svg viewBox="0 0 44 26" aria-hidden="true"><path d="M1 2 H34 V8 H25 C26 11 28 13 32 14 V19 H36 V24 H8 V19 H12 V14 C16 13 18 11 19 8 H10 C5 8 2 5 1 2 Z"/></svg>';
const CHEV = '<svg viewBox="0 0 14 22" aria-hidden="true"><path d="M3 3 L11 11 L3 19"/></svg>';
const bar = (right = '') => `<header class="bar"><div class="brand">${ANVIL}<span class="vline"></span><span class="name">ことば鍛冶</span></div><span class="grow"></span>${right}</header>`;
const btn = (label, small = '') => `<button class="btn ${small}" type="button"><span>${label}</span>${CHEV}</button>`;
const seal = (name, dan) => `<span class="seal${dan ? ' dan' : ''}">${name}</span>`;

// 足もと(Vorge の web/index.html と同じ形)。稽古中の画面には出さない(朱の時間の線と重ならないように)。
const FOOTER = '<footer class="site-footer"><p>Source code is available on <a href="https://github.com/Sho-itf/kotoba-kaji" target="_blank" rel="noopener">GitHub</a>.</p><p>Contributed by Sho.</p></footer>';

const state = { screen: 'idle', play: 'normal', rank: 'dan', note: 'on', brush: '1' };

function idle() {
  return `<div class="stage"><div class="brush"></div>${bar()}
  <main class="idle-main">
    ${btn('稽古を始める')}
    <div class="links"><button type="button">記録を書き出す</button><span class="vline"></span><button type="button">記録を取り込む</button></div>
    <div class="standing">
      <span class="item">${seal('二段', true)}</span>
      <span class="item">ベスト <span class="num">290</span></span>
      <span class="item">次の 三段 まで:スコア あと 10・正確さ 87.5% 以上</span>
    </div>
    <p class="howto">Enter か Space で稽古を始める ・ Esc で中断</p>
  </main>${FOOTER}</div>`;
}

function play() {
  const cls = state.play === 'miss' ? 'miss' : state.play === 'ippon' ? 'ippon-on' : '';
  return `<div class="stage dim ${cls}"><div class="brush"></div>
  ${bar('<div class="timer"><span class="lbl">残り</span><span class="num">58</span><span class="unit">秒</span></div>')}
  <main class="play-main">
    <div class="ippon-row" aria-live="polite">一本</div>
    <p class="sentence">昭和の街並みに<mark>郷愁</mark>を覚える</p>
    <p class="kana"><span class="done">しょうわのまち</span>なみにきょうしゅうをおぼえる</p>
    <div class="field" aria-hidden="true"><span class="typed">shouwanomachi</span><span class="caret"></span><span class="rest">naminikyoushuuwooboeru</span></div>
    <p class="prev">癒着(ゆちゃく)― 本来離れているべきものが不正に結びつくこと</p>
  </main>
  <div class="timeline"><i></i></div></div>`;
}

const RESULTS = {
  dan: { score: 325, seal: seal('三段', true), rows: ['335', '97.1 %', '11 文', '4 本', '8 回', '465'], note: null },
  danNote: { score: 325, seal: seal('二段', true), rows: ['335', '85.5 %', '11 文', '4 本', '8 回', '465'], note: 'スコアは三段に届いています。正確さ 85.5%(三段は 87.5% 以上)' },
  kyu: { score: 185, seal: seal('二級', false), rows: ['191', '96.0 %', '7 文', '2 本', '8 回', '465'], note: null },
};
const LABELS = ['1 分あたりの打鍵数', '正確さ', '打てた文', '一本', 'ミス', 'ベスト'];
const MISSES = [['じ', 'j', 2], ['た', 't', 2], ['りょ', 'r', 2], ['ば', 'b', 1], ['ゆ', 'y', 1]];

function result() {
  const key = state.rank === 'kyu' ? 'kyu' : state.note === 'on' ? 'danNote' : 'dan';
  const r = RESULTS[key];
  const rows = LABELS.map((l, i) => `<div class="row"><dt>${l}</dt><dd>${r.rows[i]}</dd></div>`).join('');
  const misses = MISSES.map(([k, c, n], i) => `<li><span class="n">${i + 1}.</span><span>「${k}」の <code>${c}</code></span><span class="times">${n} 回</span></li>`).join('');
  return `<div class="stage dim"><div class="brush"></div>${bar()}
  <main class="result-main">
    <h1 class="heading" style="align-self:stretch"><span>稽古の結果</span></h1>
    <div class="cols">
      <section>
        <div class="score-line"><span class="lbl">スコア</span><span class="score">${r.score}</span>${r.seal}</div>
        <dl class="stats">${rows}</dl>
        ${r.note ? `<p class="note">${r.note}</p>` : ''}
      </section>
      <div class="divider"></div>
      <section class="misses"><h3>ミスの多いキー</h3><ol>${misses}</ol></section>
    </div>
    ${btn('もう一度', 'small')}
  </main>${FOOTER}</div>`;
}

function render() {
  document.getElementById('root').innerHTML = { idle, play, result }[state.screen]();
  document.documentElement.style.setProperty('--brush-opacity', state.brush);
  for (const b of document.querySelectorAll('#ctl button')) b.setAttribute('aria-pressed', String(state[b.dataset.k] === b.dataset.v));
  document.getElementById('g-play').style.opacity = state.screen === 'play' ? 1 : 0.35;
  document.getElementById('g-result').style.opacity = state.screen === 'result' ? 1 : 0.35;
  const noteBtns = document.querySelectorAll('[data-k="note"]');
  for (const b of noteBtns) b.disabled = state.rank === 'kyu';
  location.hash = [state.screen, state.screen === 'play' ? state.play : state.screen === 'result' ? state.rank + (state.rank === 'dan' ? '-' + state.note : '') : ''].filter(Boolean).join('-');
}

document.getElementById('ctl').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  state[b.dataset.k] = b.dataset.v;
  render();
});

// URL の # と ?bare で、状態と操作の表示を決める(例:#result-dan-on、#play-miss、?bare)
const q = new URLSearchParams(location.search);
if (q.has('bare')) document.body.classList.add('bare');
const [s, a, b2] = location.hash.slice(1).split('-');
if (['idle', 'play', 'result'].includes(s)) state.screen = s;
if (s === 'play' && ['normal', 'miss', 'ippon'].includes(a)) state.play = a;
if (s === 'result') { if (a === 'kyu' || a === 'dan') state.rank = a; if (b2 === 'on' || b2 === 'off') state.note = b2; }
if (q.has('brush')) state.brush = q.get('brush');
render();
