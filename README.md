# Atlas PlantUML

> **Draft.** This README is written ahead of the 0.1.0 source. Review every section marked
> `TODO` against the real extension before publishing.

Interactive preview for PlantUML diagrams in Visual Studio Code.

Atlas PlantUML is based on [Plan UML](https://github.com/justuskarlsson/plan-uml) by
Justus Karlsson, released under the MIT License. It is an independent derivative, not
affiliated with or endorsed by the original author.

## Features

<!-- TODO: confirm each item against 0.1.0 and add screenshots or a GIF. -->

- Live preview of `.puml` files that re-renders as you edit.
- Arrange: automatic layout of the diagram, with selectable layouts.
- Dark mode for the rendered diagram.
- Search inside the preview and a minimap for large diagrams.
- Snapshot export of the current view.
- PlantUML errors shown as diagnostics in the editor.

## Requirements

- **Java** (TODO: minimum version) on your `PATH`. The extension bundles the PlantUML jar
  and runs it locally; diagrams never leave your machine.
- **Graphviz** (TODO: confirm whether the Default layout needs it installed; the bundled jar
  does not ship native binaries).

## Getting started

1. Install Atlas PlantUML from the Visual Studio Code Marketplace.
2. Open a `.puml` file.
3. Run **Atlas PlantUML: Open Atlas PlantUML Preview** from the Command Palette, or click the preview icon in the
   editor title bar.

## Settings

<!-- TODO: list each contributes.configuration key from package.json with its default. -->

| Setting | Default | Description |
| --- | --- | --- |
| TODO | TODO | TODO |

## Migrating from the previous build

If you installed the earlier internal build of this extension, uninstall it first: Atlas
PlantUML uses a new extension ID, so VS Code treats it as a different extension.

## Contributing

Read [AGENTS.md](AGENTS.md) before changing anything. Every change must pass
`pnpm run verify`.

## License

<!-- TODO: THIRD_PARTY_NOTICES.md arrives with the 0.1.0 source; check this link then. -->

[MIT](LICENSE). Third-party components and their licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
