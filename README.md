# Atlas PlantUML

Interactive preview for PlantUML diagrams in Visual Studio Code: smooth pan and zoom, dark
mode, layout selector, search, minimap, export and an Arrange tool that looks for a more
readable order of your declarations.

## Credits

Atlas PlantUML is an independent derivative of
[Plan UML](https://github.com/justuskarlsson/plan-uml) by **Justus Karlsson**, released under
the MIT License. It keeps Plan UML's interactive preview and Journeys panel, rewritten in
TypeScript, and adds the features listed below. It is not affiliated with or endorsed by
Justus Karlsson.

It also includes, unmodified:

- [PlantUML](https://plantuml.com) 1.2025.10 by Arnaud Roques, under the GNU GPL v3 or later.
  The extension runs it as a separate program.
- The PlantUML syntax grammar from
  [PlantUML for VS Code](https://github.com/qjebbs/vscode-plantuml) by jebbs, under the MIT
  License.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the full notices.

## Features

- **Live preview** that opens with any `.puml` file and re-renders when the diagram changes.
- **Smooth pan and zoom** for large diagrams, with animated wheel zoom.
- **Dark mode** that recolors the diagram without changing its layout.
- **Layout selector**: Default, Polyline, Curves, Left to right, LR + polyline, ELK and
  Smetana, without editing the file.
- **Search** classes and packages with `Ctrl+F`, and a **minimap** to move around.
- **Relations**: click a class to dim everything that is not connected to it.
- **Go to source**: double-click a class, package or arrow to open its line.
- **Export** to PNG (up to 2x) or SVG.
- **Arrange**: tries other orders of the top-level declarations, previews the ones with fewer
  arrow crossings, and applies the one you pick (undo with `Ctrl+Z`).
- **Syntax errors** in the Problems panel.
- **Preview + Source** editor, from "Reopen Editor With...".
- **Journeys** panel from Plan UML, hidden by default.
- **Syntax highlighting** for `.puml`, `.pu`, `.plantuml`, `.iuml`, `.wsd` and `plantuml`
  code blocks in Markdown.

## Requirements

- **Java 8 or later** on your `PATH`. PlantUML is bundled and runs locally: your diagrams
  never leave your machine.
- **Graphviz** for the Default, Polyline, Curves and Left to right layouts. Without it, use the
  ELK or Smetana layouts, which need nothing else.

## Getting started

1. Install Atlas PlantUML from the Visual Studio Code Marketplace.
2. Open a `.puml` file: the preview opens on its own.
3. To see the code next to it, use "Reopen Editor With..." and pick
   **Atlas PlantUML Preview + Source**.

Commands, in the Command Palette under **Atlas PlantUML**: Open Atlas PlantUML Preview, Close
All Previews and Reload All Previews.

## Migrating from the previous build

If you installed the earlier internal build of this extension, uninstall it first: Atlas
PlantUML uses a new extension ID, so VS Code treats it as a different extension. If the
original Plan UML is installed, uninstall it too so only one preview opens `.puml` files.

## Contributing

Read [AGENTS.md](AGENTS.md) before changing anything. Every change must pass
`pnpm run verify`.

## License

The extension's own code is under the [MIT License](LICENSE), which keeps Justus Karlsson's
original copyright notice. The bundled PlantUML jar stays under the GNU GPL v3 or later, and
its source code is available at
[plantuml/plantuml, tag v1.2025.10](https://github.com/plantuml/plantuml/tree/v1.2025.10).
Third-party components and their licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
