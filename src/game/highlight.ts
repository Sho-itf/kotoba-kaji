// お題の語を、漢字の文のどこで強調するかを決める。

export interface Range {
  start: number;
  end: number;
}

/**
 * 1. word がそのまま文にあれば、その部分
 * 2. 無ければ、wordReading が文にあれば、その部分(敢えて → あえて)
 * 3. それも無ければ、語の頭から一致するいちばん長い部分(論う → 論っ の「論」)。
 *    活用する語(立つ → 立った)は、語尾の変わった部分まで含めて強調する。
 * 4. どれも無ければ null(強調しない)
 */
/** 活用のあとに続く形(って・た・ない・ず など)。長いものを先に並べる。 */
const ENDINGS = /^(かなかっ|かない|って|った|なかっ|ない|なく|ました|ません|ます|した|して|ず|ぬ|ば|て|た|だ|ん|く|かっ|い|さ|し|り|れ|ら)/;

export function highlightRange(text: string, word: string, wordReading: string): Range | null {
  let i = word ? text.indexOf(word) : -1;
  if (i >= 0) return { start: i, end: i + word.length };

  i = wordReading ? text.indexOf(wordReading) : -1;
  if (i >= 0) return { start: i, end: i + wordReading.length };

  for (let len = word.length - 1; len >= 1; len--) {
    const head = word.slice(0, len);
    i = text.indexOf(head);
    if (i >= 0) return { start: i, end: i + len + inflectionLength(text.slice(i + len), word.slice(len)) };
  }
  return null;
}

/** 語の残り(tail)がひらがなだけなら、文の中で語尾が変わった形の長さ。そうでなければ 0。 */
function inflectionLength(after: string, tail: string): number {
  if (!/^[ぁ-ゖ]+$/.test(tail)) return 0;
  return ENDINGS.exec(after)?.[0].length ?? 0;
}
