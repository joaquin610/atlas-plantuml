type PaintAttribute = 'fill' | 'stroke';

// PlantUML default colors and their dark equivalents (keys in upper case)
export const DARK_PALETTE = {
  background: '#1E1E1E',
  fill: {
    '#000000': '#D4D4D4', // text and stereotype letters
    '#181818': '#9DA5B4', // arrow heads
    '#F1F1F1': '#2D2D30', // class body
    '#FEFFDD': '#3B3A2E', // notes
    '#FFFFFF': '#1E1E1E', // white areas
    '#ADD1B2': '#3E6B48', // class circle
    '#B4A7E5': '#5B4B9A', // interface circle
    '#EB937F': '#9A4A3A', // enum circle
  } as Readonly<Record<string, string>>,
  stroke: {
    '#181818': '#9DA5B4', // borders and arrows
  } as Readonly<Record<string, string>>,
} as const;

/**
 * Recolors PlantUML's default palette. Only colors change, so the layout is identical to the
 * light render; colors set in the diagram itself are left as they are.
 */
export function toDarkSvg(svg: string): string {
  return svg
    .replace(/background:\s*#FFFFFF/gi, `background:${DARK_PALETTE.background}`)
    .replace(/(fill|stroke)(="|:)(#[0-9A-Fa-f]{6})/g, (match, attr: PaintAttribute, sep, color) => {
      const mapped = DARK_PALETTE[attr][color.toUpperCase()];
      return mapped ? `${attr}${sep}${mapped}` : match;
    });
}
