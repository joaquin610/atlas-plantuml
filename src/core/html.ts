export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Replaces {{name}} tokens in a single pass, so inserted values (an SVG, the source) are
 * never scanned for tokens themselves. Unknown tokens are left as they are.
 */
export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? values[key] : match,
  );
}

// JSON escape for "<", so the content cannot close the <script> element it is placed in
const ESCAPED_LESS_THAN = `${'\\'}u003c`;

/** JSON that is safe to place inside a <script> element. */
export function toScriptJson(value: unknown): string {
  return JSON.stringify(value ?? null).replace(/</g, ESCAPED_LESS_THAN);
}
