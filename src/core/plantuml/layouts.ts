export interface Layout {
  readonly label: string;
  readonly directive: string;
}

// Directives are injected before @enduml, so the file on disk never changes
export const LAYOUTS: readonly Layout[] = [
  { label: 'Default', directive: '' },
  { label: 'Polyline', directive: 'skinparam linetype polyline' },
  { label: 'Curves', directive: 'skinparam linetype splines' },
  { label: 'Left to right', directive: 'left to right direction' },
  {
    label: 'Left to right + polyline',
    directive: 'left to right direction\nskinparam linetype polyline',
  },
  { label: 'ELK', directive: '!pragma layout elk' },
  { label: 'Smetana', directive: '!pragma layout smetana' },
];

export function isLayoutIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < LAYOUTS.length;
}

export function stepLayout(index: number, step: 1 | -1): number {
  return (index + step + LAYOUTS.length) % LAYOUTS.length;
}
