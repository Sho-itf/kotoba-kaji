// お題の語を、漢字の文のどこで強調するかを決める。

export interface Range {
  start: number;
  end: number;
}

/**
 * 1. word がそのまま文にあれば、その部分
 * 2. 無ければ、wordReading が文にあれば、その部分(敢えて → あえて)
 * 3. それも無ければ、語の頭から一致するいちばん長い部分(論う → 論っ の「論」)
 * 4. どれも無ければ null(強調しない)
 */
export function highlightRange(text: string, word: string, wordReading: string): Range | null {
  let i = word ? text.indexOf(word) : -1;
  if (i >= 0) return { start: i, end: i + word.length };

  i = wordReading ? text.indexOf(wordReading) : -1;
  if (i >= 0) return { start: i, end: i + wordReading.length };

  for (let len = word.length - 1; len >= 1; len--) {
    const head = word.slice(0, len);
    i = text.indexOf(head);
    if (i >= 0) return { start: i, end: i + len };
  }
  return null;
}
