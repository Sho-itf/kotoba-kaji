"""Vorge の CSV から、タイピング用のデータ(public/sentences.json)を作る。

使い方(リポジトリ直下で):
    .venv\\Scripts\\python tools\\make_readings.py [Vorge の csv フォルダ]

- 例文の読みは sudachipy(形態素解析)で作り、ひらがなにする。
- data/readings-fix.csv に手で直した読みがあれば、それで上書きする。
  kana 欄が「(除外)」の文は、データに入れない。
- 怪しい文の一覧を private/check.tsv に書き出す(公開しない)。
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

from sudachipy import Dictionary, SplitMode

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = Path(r"../Vorge/csv")
OUT = ROOT / "public" / "sentences.json"
FIX = ROOT / "data" / "readings-fix.csv"
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
# ひらがなにした後で、つながりの読みを直す表(十分 が 十+分 に分かれて「じゅうふん」になる、など)
KANA_FIX = {
    "じゅうふん": "じゅうぶん",
    "よんがつ": "しがつ",
}


def reading_of(morphs) -> str:
    return "".join(TOKEN_FIX.get((m.surface(), m.reading_form()), m.reading_form()) for m in morphs)


def to_hiragana(s: str) -> str:
    out = []
    for ch in s:
        c = ord(ch)
        if 0x30A1 <= c <= 0x30F6:  # ァ〜ヶ → ぁ〜ゖ
            out.append(chr(c - 0x60))
        else:
            out.append(ch)
    return "".join(out)


def read_vorge(src: Path) -> list[dict]:
    rows = []
    for f in sorted(src.glob("*.csv")):
        with f.open(encoding="utf-8-sig", newline="") as fp:
            for r in csv.DictReader(fp):
                rows.append(r)
    return rows


def read_fixes() -> dict[str, dict]:
    if not FIX.exists():
        return {}
    with FIX.open(encoding="utf-8-sig", newline="") as fp:
        return {r["key"]: r for r in csv.DictReader(fp)}


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    tok = Dictionary(dict="core").tokenizer(SplitMode.C)
    fixes = read_fixes()
    used_fix: set[str] = set()
    sentences = []
    checks = []

    for r in read_vorge(src):
        word = r["word"].strip()
        for n in (1, 2):
            text = r[f"example_{n}"].strip()
            if not text:
                continue
            key = f"{word}#{n}"
            morphs = tok.tokenize(text)
            auto = to_hiragana(reading_of(morphs))
            for a, b in KANA_FIX.items():
                auto = auto.replace(a, b)
            kana = auto
            reasons = []

            # お題の語は、Vorge の読み(学ぶ対象の読み)にそろえる
            word_kana = to_hiragana(r["reading"].strip())
            if word in text and word_kana not in kana:
                alone = to_hiragana(reading_of(tok.tokenize(word)))
                if alone in kana:
                    kana = kana.replace(alone, word_kana, 1)
                    reasons.append(f"語の読みを Vorge に合わせた({alone}→{word_kana})")

            fix = fixes.get(key)
            if fix:
                used_fix.add(key)
                if fix["text"] != text:
                    reasons.append("手直しの元の文が変わった(手直しを当てていない)")
                elif fix["kana"] == EXCLUDE:
                    continue
                else:
                    kana = fix["kana"]

            if not KANA_OK.match(kana):
                reasons.append("ひらがな以外が残っている")
            if re.search(r"[0-9０-９A-Za-zＡ-Ｚａ-ｚ]", text):
                reasons.append("数字・英字")
            if word in text and to_hiragana(r["reading"]) not in kana:
                reasons.append(f"語の読み({r['reading']})が見当たらない")
            amb = [a for a in AMBIGUOUS if a in text]
            if amb:
                reasons.append("要注意の字:" + "・".join(amb))
            if reasons:
                checks.append((key, text, kana, " / ".join(reasons),
                               "/".join(f"{m.surface()}={m.reading_form()}" for m in morphs)))

            sentences.append({
                "key": key,
                "word": word,
                "wordReading": r["reading"].strip(),
                "meaning": r["meaning"].strip(),
                "text": text,
                "kana": kana,
                "category": r["category"].strip(),
                "difficulty": int(r["difficulty"] or 0),
            })

    for key in sorted(set(fixes) - used_fix):
        checks.append((key, "", "", "手直しに対応する文が見つからない", ""))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = {"version": 1, "count": len(sentences), "sentences": sentences}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")

    CHECK.parent.mkdir(parents=True, exist_ok=True)
    with CHECK.open("w", encoding="utf-8", newline="") as fp:
        w = csv.writer(fp, delimiter="\t")
        w.writerow(["key", "text", "kana", "理由", "解析"])
        w.writerows(checks)

    print(f"文: {len(sentences)}  手直し: {len(used_fix)}  要確認: {len(checks)}")


if __name__ == "__main__":
    main()
