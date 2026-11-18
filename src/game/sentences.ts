// 例文のデータ(public/sentences.json)の型と読み込み。

export interface Sentence {
  key: string;
  word: string;
  wordReading: string;
  meaning: string;
  text: string;
  kana: string;
  category: string;
  difficulty: number;
}

const STRING_FIELDS = ["key", "word", "wordReading", "meaning", "text", "kana", "category"] as const;

/** JSON の中身を確かめて、例文の一覧にする。おかしければ例外。 */
export function parseSentences(data: unknown): Sentence[] {
  const list = (data as { sentences?: unknown })?.sentences;
  if (!Array.isArray(list) || list.length === 0) throw new Error("例文のデータの形がおかしい");
  return list.map((raw, i) => {
    for (const f of STRING_FIELDS) {
      if (typeof raw?.[f] !== "string") throw new Error(`${i + 1} 番目の例文の ${f} がおかしい`);
    }
    return { ...raw, difficulty: Number(raw.difficulty) || 0 } as Sentence;
  });
}

/** 例文を読み込む。baseUrl は import.meta.env.BASE_URL(先頭が / の書き方は使わない)。 */
export async function loadSentences(baseUrl: string, fetchFn: typeof fetch = fetch): Promise<Sentence[]> {
  const res = await fetchFn(baseUrl + "sentences.json");
  if (!res.ok) throw new Error(`例文を読み込めなかった(${res.status})`);
  return parseSentences(await res.json());
}
