import { context2d, decodeSvg, svgSize } from './svgImage.ts';
import type { Size } from './viewport.ts';

const MAX_SCALE = 2;
const MAX_PIXELS = 40e6;
const MAX_SIDE = 16384;

/** 2x for crisp text, capped in pixels and per side to bound memory. */
export function exportScale(diagram: Size): number {
  return Math.min(
    MAX_SCALE,
    Math.sqrt(MAX_PIXELS / (diagram.width * diagram.height)),
    MAX_SIDE / Math.max(diagram.width, diagram.height),
  );
}

/** Renders the SVG as shown to a PNG, base64-encoded for the message to the extension. */
export async function renderPngBase64(
  svg: SVGSVGElement,
  background: string,
  decoded: HTMLImageElement | null,
): Promise<string> {
  const diagram = svgSize(svg);
  if (!diagram) {
    throw new Error('The diagram has no size');
  }
  const image = decoded ?? (await decodeSvg(svg));
  const scale = exportScale(diagram);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(diagram.width * scale);
  canvas.height = Math.round(diagram.height * scale);
  const ctx = context2d(canvas);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas is empty'))), 'image/png');
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
