import type { Size } from './viewport.ts';

/** Intrinsic size of a PlantUML SVG (width/height attributes, else the viewBox). */
export function svgSize(svg: SVGSVGElement): Size | null {
  const viewBox = svg.viewBox?.baseVal;
  const width = Number.parseFloat(svg.getAttribute('width') ?? '') || viewBox?.width || 0;
  const height = Number.parseFloat(svg.getAttribute('height') ?? '') || viewBox?.height || 0;
  return width && height ? { width, height } : null;
}

/** Decodes the SVG as it is now (inline styles included) into an image. */
export async function decodeSvg(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    // The decoded image stays valid after the URL is revoked
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Background of the rendered diagram: white, or dark when recolored by the extension. */
export function diagramBackground(svg: SVGSVGElement | null): string {
  const match = svg && /background:\s*(#[0-9a-fA-F]{3,8})/.exec(svg.getAttribute('style') ?? '');
  return match ? match[1] : '#ffffff';
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D is not available');
  }
  return ctx;
}
