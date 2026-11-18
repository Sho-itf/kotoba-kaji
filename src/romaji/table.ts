// かな → ローマ字の綴りの表。各行の先頭が「標準の綴り」(画面に出すもの)。
// 標準はヘボン式寄り(し=shi、ち=chi、つ=tsu、ふ=fu、じ=ji)。

/** 打たずに自動で飛ばす記号(tools/make_readings.py の SKIP_SYMBOLS と同じ) */
export const SKIP_SYMBOLS = "、。「」『』〜・…（）()？！?!，．";

/** 1 字のかな */
export const SINGLE: Record<string, string[]> = {
  あ: ["a"], い: ["i", "yi"], う: ["u", "wu", "whu"], え: ["e"], お: ["o"],
  か: ["ka", "ca"], き: ["ki"], く: ["ku", "cu", "qu"], け: ["ke"], こ: ["ko", "co"],
  さ: ["sa"], し: ["shi", "si", "ci"], す: ["su"], せ: ["se", "ce"], そ: ["so"],
  た: ["ta"], ち: ["chi", "ti"], つ: ["tsu", "tu"], て: ["te"], と: ["to"],
  な: ["na"], に: ["ni"], ぬ: ["nu"], ね: ["ne"], の: ["no"],
  は: ["ha"], ひ: ["hi"], ふ: ["fu", "hu"], へ: ["he"], ほ: ["ho"],
  ま: ["ma"], み: ["mi"], む: ["mu"], め: ["me"], も: ["mo"],
  や: ["ya"], ゆ: ["yu"], よ: ["yo"],
  ら: ["ra"], り: ["ri"], る: ["ru"], れ: ["re"], ろ: ["ro"],
  わ: ["wa"], ゐ: ["wyi"], ゑ: ["wye"], を: ["wo"],
  が: ["ga"], ぎ: ["gi"], ぐ: ["gu"], げ: ["ge"], ご: ["go"],
  ざ: ["za"], じ: ["ji", "zi"], ず: ["zu"], ぜ: ["ze"], ぞ: ["zo"],
  だ: ["da"], ぢ: ["di"], づ: ["du"], で: ["de"], ど: ["do"],
  ば: ["ba"], び: ["bi"], ぶ: ["bu"], べ: ["be"], ぼ: ["bo"],
  ぱ: ["pa"], ぴ: ["pi"], ぷ: ["pu"], ぺ: ["pe"], ぽ: ["po"],
  ゔ: ["vu"],
  ぁ: ["xa", "la"], ぃ: ["xi", "li", "xyi", "lyi"], ぅ: ["xu", "lu"],
  ぇ: ["xe", "le", "xye", "lye"], ぉ: ["xo", "lo"],
  ゃ: ["xya", "lya"], ゅ: ["xyu", "lyu"], ょ: ["xyo", "lyo"], ゎ: ["xwa", "lwa"],
  ゕ: ["xka", "lka"], ゖ: ["xke", "lke"],
  ー: ["-"],
};

/** っ を単独で打つ綴り */
export const SMALL_TSU = ["xtu", "ltu", "xtsu", "ltsu"];

/** 2 字で 1 単位になるかな(拗音など)。「き」+「ゃ」と分けて打つ綴りは units.ts で足す。 */
export const DOUBLE: Record<string, string[]> = {};

function addRow(prefixes: string[], first: string, kana: string[]) {
  // kana: ゃ ぃ ゅ ぇ ょ の順。prefixes の各子音に a i u e o を付ける。
  const vowels = ["a", "i", "u", "e", "o"];
  kana.forEach((k, i) => {
    DOUBLE[first + k] = prefixes.map((p) => p + vowels[i]);
  });
}

const YOON = ["ゃ", "ぃ", "ゅ", "ぇ", "ょ"];
addRow(["ky"], "き", YOON);
addRow(["ny"], "に", YOON);
addRow(["hy"], "ひ", YOON);
addRow(["my"], "み", YOON);
addRow(["ry"], "り", YOON);
addRow(["gy"], "ぎ", YOON);
addRow(["by"], "び", YOON);
addRow(["py"], "ぴ", YOON);
addRow(["dy"], "ぢ", YOON);
addRow(["sy"], "し", YOON);
addRow(["zy", "jy"], "じ", YOON);
addRow(["ty", "cy"], "ち", YOON);
addRow(["th"], "て", YOON);
addRow(["dh"], "で", YOON);
addRow(["fy"], "ふ", ["ゃ", "ぃ", "ゅ", "ぇ", "ょ"]);
addRow(["vy"], "ゔ", ["ゃ", "ぃ", "ゅ", "ぇ", "ょ"]);
addRow(["qy"], "く", ["ゃ", "ぃ", "ゅ", "ぇ", "ょ"]);

// ヘボン式の綴りを先頭に足す(標準にする)
function prepend(kana: string, ...romaji: string[]) {
  DOUBLE[kana] = [...romaji, ...(DOUBLE[kana] ?? []).filter((r) => !romaji.includes(r))];
}
prepend("しゃ", "sha"); prepend("しゅ", "shu"); prepend("しぇ", "she"); prepend("しょ", "sho");
prepend("ちゃ", "cha"); prepend("ちゅ", "chu"); prepend("ちぇ", "che"); prepend("ちょ", "cho");
prepend("じゃ", "ja"); prepend("じゅ", "ju"); prepend("じぇ", "je"); prepend("じょ", "jo");
prepend("てぃ", "thi"); prepend("でぃ", "dhi");
prepend("てゅ", "thu"); prepend("でゅ", "dhu");

// 外来語などの音
Object.assign(DOUBLE, {
  ふぁ: ["fa", "fwa"], ふぃ: ["fi", "fwi", "fyi"], ふぅ: ["fwu"], ふぇ: ["fe", "fwe", "fye"], ふぉ: ["fo", "fwo"],
  うぁ: ["wha"], うぃ: ["wi", "whi"], うぇ: ["we", "whe"], うぉ: ["who"],
  いぇ: ["ye"],
  ゔぁ: ["va"], ゔぃ: ["vi", "vyi"], ゔぇ: ["ve", "vye"], ゔぉ: ["vo"],
  くぁ: ["qa", "kwa", "qwa"], くぃ: ["qi", "qwi", "qyi"], くぅ: ["qwu"], くぇ: ["qe", "qwe", "qye"], くぉ: ["qo", "qwo"],
  ぐぁ: ["gwa"], ぐぃ: ["gwi"], ぐぅ: ["gwu"], ぐぇ: ["gwe"], ぐぉ: ["gwo"],
  すぁ: ["swa"], すぃ: ["swi"], すぅ: ["swu"], すぇ: ["swe"], すぉ: ["swo"],
  つぁ: ["tsa"], つぃ: ["tsi"], つぇ: ["tse"], つぉ: ["tso"],
  とぁ: ["twa"], とぃ: ["twi"], とぅ: ["twu"], とぇ: ["twe"], とぉ: ["two"],
  どぁ: ["dwa"], どぃ: ["dwi"], どぅ: ["dwu"], どぇ: ["dwe"], どぉ: ["dwo"],
});
