// Every identifier that must match package.json lives here; test/manifest.test.ts checks both.
export const VIEW_TYPES = {
  preview: 'atlasPlantuml.preview',
  split: 'atlasPlantuml.split',
} as const;

export const COMMANDS = {
  openPreview: 'atlasPlantuml.openPreview',
  closePreview: 'atlasPlantuml.closePreview',
  reloadWebviews: 'atlasPlantuml.reloadWebviews',
  writeCursorRules: 'atlasPlantuml.writeCursorRules',
} as const;

export const STATE_KEYS = {
  darkMode: 'atlasPlantuml.darkMode',
} as const;

export const DIAGNOSTICS_NAME = 'atlas-plantuml';
