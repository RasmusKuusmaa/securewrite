const GLYPHS = [
  "▓", "▒", "░", "■", "□", "●", "◆", "◇", "★", "☆",
  "#", "%", "&", "@", "*", "~", "^", "§", "¤",
];

/**
 * Character-for-character substitution, not a blur: whitespace/newlines are
 * kept so the layout doesn't reflow, but every other character becomes a
 * random glyph. Callers should recompute this on every content change (not
 * memoize the mapping) so repeated letters don't get the same glyph twice in
 * a row - that would let a careful observer infer patterns over time.
 */
export function scrambleText(text: string): string {
  let result = "";
  for (const ch of text) {
    if (ch === "\n" || ch === " " || ch === "\t" || ch === "\r") {
      result += ch;
    } else {
      result += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }
  }
  return result;
}
