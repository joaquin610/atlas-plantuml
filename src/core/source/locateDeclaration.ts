const NEARBY_OFFSETS = [0, 1, -1, 2, -2, 3, -3];
const DECLARATION_KEYWORDS = 'class|interface|enum|abstract|annotation|entity|package|object|note';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Line (0-based) to open for a diagram element. PlantUML line numbers can be off by a few
 * lines, so the element name is looked up nearby: declaration first, then any whole word.
 */
export function locateDeclarationLine(
  lines: readonly string[],
  line: number,
  name?: string,
): number {
  const last = Math.max(0, lines.length - 1);
  const target = Math.max(0, Math.min(last, Number.isFinite(line) ? Math.trunc(line) : 0));
  if (!name) {
    return target;
  }
  const word = escapeRegExp(name);
  const patterns = [
    new RegExp(`\\b(${DECLARATION_KEYWORDS})\\b.*(\\b|")${word}(\\b|")`),
    new RegExp(`(^|[^\\w])${word}([^\\w]|$)`),
  ];
  for (const pattern of patterns) {
    for (const offset of NEARBY_OFFSETS) {
      const candidate = target + offset;
      if (candidate >= 0 && candidate < lines.length && pattern.test(lines[candidate])) {
        return candidate;
      }
    }
  }
  return target;
}
