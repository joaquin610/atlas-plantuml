# Changelog

## 0.1.0

Renamed to Atlas PlantUML (publisher `JoaquinBanchero`). Command, editor and state IDs now
use the `atlasPlantuml.` prefix, so the previous build must be uninstalled. The "Write
plan-uml cursor rules" command is removed.

Rewritten in TypeScript with automated tests. Features are the same as 0.0.19, with these
changes:

- Typing in the `.puml` no longer reloads the preview when the diagram did not change.
- Rendering runs through PlantUML's `-pipe` with a memory and disk cache, and a 2-minute
  timeout, so a stuck Java process no longer hangs the preview.
- Diagrams with `!include` are not cached, so changes in included files show up.
- The preview page uses a strict Content Security Policy (only its own script runs).
- Zoom buttons zoom around the center of the view.
- Typing `F` with elements selected now opens the Journeys input like any other letter.
- The jar is no longer downloaded from the original project's releases: it ships with the
  extension.

## 0.0.19

Last build made by editing the compiled JavaScript of Plan UML 0.0.8.
