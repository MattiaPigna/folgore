/** Text case applied to a text element (also re-applied when bound data updates the text). */
export type TextCase = 'upper' | 'lower' | 'title' | 'none';

export function applyTextCase(text: string, mode: TextCase | undefined): string {
  if (!mode || mode === 'none') return text;
  if (mode === 'upper') return text.toUpperCase();
  if (mode === 'lower') return text.toLowerCase();
  // Title case: first letter of each word, keeping apostrophes/dots ("S. Angelo all'Esca").
  return text.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}
