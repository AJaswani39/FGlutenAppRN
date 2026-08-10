export const MAX_AI_MENU_CONTEXT_CHARS = 12_000;

const DIETARY_SIGNAL = /\b(gluten[\s-]?free|\bgf\b|celiac|coeliac|allergen|allergy|wheat|barley|rye|shared|cross[\s-]?contamin|fryer|dairy|milk|nut|peanut|soy)\b/i;
const PRICE_SIGNAL = /(?:[$£€]\s?\d|\b\d{1,3}\.\d{2}\b)/;

function addLine(output: string[], line: string, maxChars: number): boolean {
  const nextLength = output.length === 0 ? line.length : output.join('\n').length + line.length + 1;
  if (nextLength > maxChars) return false;
  output.push(line);
  return true;
}

/**
 * Produces a bounded AI context without changing the menu text shown to the user.
 * For large menus, dietary-risk and priced item lines are retained before general text.
 */
export function buildMenuAiContext(menuText: string, maxChars = MAX_AI_MENU_CONTEXT_CHARS): string {
  const normalized = menuText.replace(/\r/g, '').trim();
  if (normalized.length <= maxChars) return normalized;

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // A scanned image or PDF can occasionally arrive as one very long line.
  if (lines.length <= 1) return normalized.slice(0, maxChars);

  const selected = new Set<number>();
  for (let index = 0; index < lines.length; index += 1) {
    if (DIETARY_SIGNAL.test(lines[index])) selected.add(index);
  }
  for (let index = 0; index < lines.length; index += 1) {
    if (PRICE_SIGNAL.test(lines[index])) selected.add(index);
  }

  const output: string[] = [];
  const addIndexes = (indexes: Iterable<number>) => {
    for (const index of indexes) {
      addLine(output, lines[index], maxChars);
    }
  };

  addIndexes([...selected].sort((left, right) => left - right));
  addIndexes(lines.map((_, index) => index).filter((index) => !selected.has(index)));

  return output.join('\n');
}
