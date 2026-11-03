// PlantUML renders syntax errors as an image that names the failing line
const FROM_LINE = /\[From [^\]]*\(line (\d+)\)/;
const SYNTAX_MESSAGE = /(Syntax Error\?[^<]*)/;
const DEFAULT_MESSAGE = 'PlantUML could not render this line';

export interface RenderError {
  /** 1-based line, as PlantUML reports it. */
  readonly line: number;
  readonly message: string;
}

export function isErrorRender(svg: string): boolean {
  return FROM_LINE.test(svg);
}

export function parseRenderError(svg: string): RenderError | null {
  const lineMatch = FROM_LINE.exec(svg);
  if (!lineMatch) {
    return null;
  }
  const messageMatch = SYNTAX_MESSAGE.exec(svg);
  const message = messageMatch ? decodeEntities(messageMatch[1]).trim() : DEFAULT_MESSAGE;
  return { line: Number(lineMatch[1]), message };
}

function decodeEntities(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
