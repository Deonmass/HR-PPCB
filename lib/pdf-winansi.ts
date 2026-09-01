/** Times / Helvetica (pdf-lib StandardFonts) only encode WinAnsi. */

const REPLACEMENTS: Record<string, string> = {
  '\u1D49': 'e', // modifier letter small e (5ᵉ)
  '\u1D43': 'a',
  '\u1D47': 'b',
  '\u1D48': 'd',
  '\u1D4F': 'k',
  '\u1D50': 'm',
  '\u1D52': 'o',
  '\u1D56': 'p',
  '\u1D57': 't',
  '\u1D58': 'u',
  '\u1D5B': 'v',
  '\u02B0': 'h',
  '\u02B3': 'r',
  '\u02E1': 'l',
  '\u02E2': 's',
  '\u02E3': 'x',
  '\u2013': '-',
  '\u2014': '-',
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u2026': '...',
  '\u00A0': ' ',
  '\u202F': ' ',
};

export function toWinAnsi(text: string): string {
  if (!text) return '';
  let out = '';
  for (const ch of text) {
    if (Object.prototype.hasOwnProperty.call(REPLACEMENTS, ch)) {
      out += REPLACEMENTS[ch];
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0xff) {
      out += ch;
      continue;
    }
    const folded = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (folded && (folded.codePointAt(0) ?? 0) <= 0xff) {
      out += folded;
    }
  }
  return out;
}
