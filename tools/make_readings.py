"""Vorge の CSV から、タイピング用のデータ(public/sentences.json)を作る。

使い方(リポジトリ直下で):
    .venv\\Scripts\\python tools\\make_readings.py [Vorge の csv フォルダ]

- csv フォルダを省くと、このリポジトリのフォルダの隣にある Vorge/csv を使う。
- 例文の読みは sudachipy(形態素解析=文を語に分けて読みを付ける道具)で作り、ひらがなにする。
- 飛ばす記号(、。「」〜 など)は読みに変えず、書かれた字のまま kana に残す。
- data/word-reading-fix.csv に語の読みがあれば、wordReading と文の中のお題の語の読みに使う。
- data/readings-fix.csv に手で直した読みがあれば、それで文の読みを上書きする。
  kana 欄が「(除外)」の文は、データに入れない。
- おかしな点(手直しの元の文が変わった、手直しに対応する文がない、
  kana にひらがな・「ー」・飛ばす記号以外が残った、記号の並びが合わない)があれば、
  理由を出して 0 以外の終了コードで止まる。このとき sentences.json は書き換えない。
- 参考の知らせ(要注意の字など)は private/check.tsv に書き出す(公開しない)。
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

from sudachipy import Dictionary, SplitMode

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = ROOT.parent / "Vorge" / "csv"
OUT = ROOT / "public" / "sentences.json"
FIX = ROOT / "data" / "readings-fix.csv"
WORD_FIX = ROOT / "data" / "word-reading-fix.csv"
CHECK = ROOT / "private" / "check.tsv"

EXCLUDE = "(除外)"
# 打たずに飛ばす記号
SKIP_SYMBOLS = "、。「」『』〜・…（）()？！?!，．"
KANA_OK = re.compile(r"^[ぁ-ゖゔー" + re.escape(SKIP_SYMBOLS) + r"]+$")
# 文脈で読みが変わりやすい書き方(抜き取り確認の候補にする)
AMBIGUOUS = [
    "今日", "明日", "昨日", "今年", "一日", "一人", "上手", "下手", "大人", "行っ",
    "何", "人気", "生物", "最中", "目下", "寒気", "風車", "工夫", "市場", "仮名",
    "方", "後", "間", "汚", "辛", "開く", "日本", "私",
]


# 解析の読みを語の単位で直す表((書き方, 解析の読み) → 正しい読み)。
# 文ごとの手直しは data/readings-fix.csv に書く。
TOKEN_FIX = {
    ("言う", "ユウ"): "イウ",      # 発音どおりの「ゆう」ではなく、書くとおりの「いう」で打つ
    ("私", "ワタクシ"): "ワタシ",
    ("日本", "ニッポン"): "ニホン",
    ("明", "ミン"): "メイ",        # 先見の明
    ("異", "コト"): "イ",          # 異を唱える
    ("箱", "バコ"): "ハコ",
    ("富士山", "フジヤマ"): "フジサン",
}
# 続けて並んだ語の読みを直す表。
# 左:並んだ語の (書き方, 解析の読み)、右:それぞれの語の正しい読み。
# 十分 が 十+分 に分かれて「じゅうふん」になる、など。
SEQ_FIX = [
    ((("十", "ジュウ"), ("分", "フン")), ("ジュウ", "ブン")),
    ((("四", "ヨン"), ("月", "ガツ")), ("シ", "ガツ")),
]


class StopBuild(Exception):
    """作るのを止めるときに使う。"""


def is_symbols(s: str) -> bool:
    return s != "" and all(ch in SKIP_SYMBOLS for ch in s)


def symbols_in(s: str) -> str:
    return "".join(ch for ch in s if ch in SKIP_SYMBOLS)


def morph_readings(morphs) -> list[str]:
    """語ごとの読み(カタカナ)。飛ばす記号だけの語は、書かれた字のまま。"""
    out = []
    for m in morphs:
        surface = m.surface()
        if is_symbols(surface):
            out.append(surface)
        else:
            out.append(TOKEN_FIX.get((surface, m.reading_form()), m.reading_form()))
    for pattern, fixed in SEQ_FIX:
        n = len(pattern)
        for i in range(len(morphs) - n + 1):
            if all((morphs[i + j].surface(), out[i + j]) == pattern[j] for j in range(n)):
                out[i:i + n] = fixed
    return out


def to_hiragana(s: str) -> str:
    out = []
    for ch in s:
        c = ord(ch)
        if 0x30A1 <= c <= 0x30F6:  # ァ〜ヶ → ぁ〜ゖ
            out.append(chr(c - 0x60))
        else:
            out.append(ch)
    return "".join(out)


def word_spans(morphs, text: str, word: str) -> tuple[list[tuple[int, int]], int]:
    """お題の語が書かれた範囲を、語の番号の範囲 [i, j) で返す。
    語の切れ目と合わない出現の数も返す。"""
    spans, misaligned = [], 0
    starts = {m.begin(): i for i, m in enumerate(morphs)}
    ends = {m.end(): i + 1 for i, m in enumerate(morphs)}
    pos = text.find(word)
    while pos >= 0:
        end = pos + len(word)
        if pos in starts and end in ends:
            spans.append((starts[pos], ends[end]))
        else:
            misaligned += 1
        pos = text.find(word, end)
    return spans, misaligned


def read_vorge(src: Path) -> list[dict]:
    rows = []
    for f in sorted(src.glob("*.csv")):
        with f.open(encoding="utf-8-sig", newline="") as fp:
            for r in csv.DictReader(fp):
                rows.append(r)
    return rows


def read_csv_by(path: Path, key: str) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8-sig", newline="") as fp:
        return {r[key].strip(): r for r in csv.DictReader(fp)}


def find_src() -> Path:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    if not src.is_dir() or not any(src.glob("*.csv")):
        raise StopBuild(
            f"Vorge の CSV が見つかりません: {src}\n"
            "  Vorge の csv フォルダの場所を、引数で渡してください。\n"
            "  例: .venv\\Scripts\\python tools\\make_readings.py D:\\Vorge\\csv"
        )
    return src


def build(src: Path, tok) -> tuple[list[dict], list[tuple], list[tuple[str, str]], int]:
    fixes = read_csv_by(FIX, "key")
    word_fixes = {w: to_hiragana(r["reading"].strip()) for w, r in read_csv_by(WORD_FIX, "word").items()}
    used_fix: set[str] = set()
    sentences = []
    checks = []      # 参考の知らせ(private/check.tsv)
    errors = []      # 止める理由 (key, 理由)

    for r in read_vorge(src):
        word = r["word"].strip()
        word_kana = word_fixes.get(word, to_hiragana(r["reading"].strip()))
        for n in (1, 2):
            text = r[f"example_{n}"].strip()
            if not text:
                continue
            key = f"{word}#{n}"
            morphs = tok.tokenize(text)
            pieces = [to_hiragana(p) for p in morph_readings(morphs)]
            reasons = []

            # お題の語は、Vorge(または上書き表)の読み(学ぶ対象の読み)にそろえる。
            # 置き換えるのは、お題の語が書かれた範囲の語だけ。
            # 語の切れ目と合わない出現(「具体的」の中の「具体」など)はそのままにする。
            # 読みが空の語(カタカナ語など)はそろえない。
            if word_kana:
                for i, j in word_spans(morphs, text, word)[0]:
                    alone = "".join(pieces[i:j])
                    if alone != word_kana:
                        pieces[i:j] = [word_kana] + [""] * (j - i - 1)
                        reasons.append(f"語の読みを Vorge に合わせた({alone}→{word_kana})")
            kana = "".join(pieces)

            fix = fixes.get(key)
            if fix:
                used_fix.add(key)
                if fix["text"] != text:
                    errors.append((key, "手直しの元の文が変わった"
                                        f"(手直し:{fix['text']} / 今:{text})"))
                elif fix["kana"] == EXCLUDE:
                    continue
                else:
                    kana = fix["kana"]

            if not KANA_OK.match(kana):
                errors.append((key, f"kana にひらがな・「ー」・飛ばす記号以外が残った({kana})"))
            if symbols_in(text) != symbols_in(kana):
                errors.append((key, f"記号の並びが合わない(文:{symbols_in(text)} / kana:{symbols_in(kana)})"))
            if re.search(r"[0-9０-９A-Za-zＡ-Ｚａ-ｚ]", text):
                reasons.append("数字・英字")
            if word in text and word_kana not in kana:
                reasons.append(f"語の読み({word_kana})が見当たらない")
            amb = [a for a in AMBIGUOUS if a in text]
            if amb:
                reasons.append("要注意の字:" + "・".join(amb))
            if reasons:
                checks.append((key, text, kana, " / ".join(reasons),
                               "/".join(f"{m.surface()}={m.reading_form()}" for m in morphs)))

            sentences.append({
                "key": key,
                "word": word,
                "wordReading": word_kana,
                "meaning": r["meaning"].strip(),
                "text": text,
                "kana": kana,
                "category": r["category"].strip(),
                "difficulty": int(r["difficulty"] or 0),
            })

    for key in sorted(set(fixes) - used_fix):
        errors.append((key, "手直しに対応する文が見つからない"))

    return sentences, checks, errors, len(used_fix)


def main() -> int:
    try:
        src = find_src()
    except StopBuild as e:
        print(e, file=sys.stderr)
        return 1

    tok = Dictionary(dict="core").tokenizer(SplitMode.C)
    sentences, checks, errors, n_fix = build(src, tok)

    CHECK.parent.mkdir(parents=True, exist_ok=True)
    with CHECK.open("w", encoding="utf-8", newline="") as fp:
        w = csv.writer(fp, delimiter="\t")
        w.writerow(["key", "text", "kana", "理由", "解析"])
        w.writerows(checks)

    if errors:
        print(f"おかしな点が {len(errors)} 件あるので、sentences.json は書き換えずに止めます。", file=sys.stderr)
        for key, why in errors:
            print(f"  {key}: {why}", file=sys.stderr)
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = {"version": 1, "count": len(sentences), "sentences": sentences}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")

    print(f"文: {len(sentences)}  手直し: {n_fix}  要確認: {len(checks)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
