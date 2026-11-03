# Third-party notices

Atlas PlantUML includes or is derived from the components below. Each keeps its own license.

## Plan UML

Atlas PlantUML is derived from Plan UML 0.0.8 by Justus Karlsson, Copyright (c) 2025 Justus
Karlsson, licensed under the MIT License. The original notice and license text are kept in
`LICENSE`. Source: https://github.com/justuskarlsson/plan-uml

## PlantUML for VS Code (syntax highlighting)

`syntaxes/plantuml.tmLanguage`, `syntaxes/codeblock.json` and `language-configuration.json` are
copied unmodified from PlantUML for VS Code by jebbs, licensed under the MIT License.
See `third-party/JEBBS-PLANTUML-LICENSE.txt`. Source: https://github.com/qjebbs/vscode-plantuml

## PlantUML

This extension bundles `plantuml-1.2025.10.jar`, unmodified, and runs it as a separate program.

```
PlantUML : a free UML diagram generator
(C) Copyright 2009-2024, Arnaud Roques
Project Info: https://plantuml.com

PlantUML is free software; you can redistribute it and/or modify it
under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

PlantUML is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
License for more details.
```

- Full license text: `third-party/PLANTUML-GPL-3.0.txt`
- Source code: https://github.com/plantuml/plantuml (tag `v1.2025.10`)
- Release: https://github.com/plantuml/plantuml/releases/tag/v1.2025.10

The jar is the official build from the PlantUML release and contains, as published by the
PlantUML project, third-party libraries under their own licenses, among them Eclipse Layout
Kernel (EPL 2.0), Google Guava (Apache 2.0) and JLaTeXMath (GPL v2 or later) with its fonts
(SIL Open Font License and others). Their license texts are inside the jar (`META-INF/`,
`about.html` and `org/scilab/forge/jlatexmath/fonts/licences/`). The jar contains no native
binaries; Graphviz is not bundled.

The GPL applies to the bundled JAR only. The rest of this extension remains under the MIT License.
