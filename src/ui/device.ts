// 端末の種類の判断。

type MatchMedia = (query: string) => { matches: boolean };

/** タッチだけの端末か(指で触る入力だけで、マウスなどの細かい入力が無い) */
export function isTouchOnly(matchMedia: MatchMedia | undefined): boolean {
  if (!matchMedia) return false;
  try {
    return matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
  } catch {
    return false;
  }
}
