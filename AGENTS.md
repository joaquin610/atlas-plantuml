# AGENTS.md

Reglas para cualquier persona o agente de IA que modifique esta extensión. Conversación en
español; código, comentarios, commits y mensajes de la interfaz en inglés.

## Regla cero

Ningún cambio está terminado si `pnpm run verify` no pasa. El hook de pre-commit y el CI
lo corren solos; no los saltees (`--no-verify` está prohibido).

## Comandos

    pnpm install            # dependencias de desarrollo y hooks de git
    pnpm run build          # esbuild: out/extension.cjs y out/webview.js
    pnpm run build:watch    # lo mismo, recompilando al guardar
    pnpm run typecheck      # tsc sobre extensión, webview y tests (el build NO chequea tipos)
    pnpm run test           # node --test: unitarios, Java real, navegador headless, extensión
    pnpm run check:write    # Biome: formatea y aplica fixes
    pnpm run verify         # typecheck + Biome + build + tests (lo mismo que el CI)
    pnpm run package        # verify + build de producción + .vsix

Solo `pnpm`. `out/` es generado: nunca se edita a mano ni se commitea.

## Capas

    src/core/       lógica pura: Arrange, modo oscuro, errores de PlantUML, layouts, HTML
    src/shared/     contrato de mensajes entre extensión y webview (tipos + validación)
    src/infra/      E/S de Node: proceso Java, jar de PlantUML, cachés
    src/extension/  adaptadores de VS Code: sesiones de preview, comandos, diagnósticos
    src/webview/    página del preview (navegador): vista, snapshot, búsqueda, minimapa...

Importaciones permitidas (las valida `test/architecture.test.ts`, que falla si se rompen):

| Capa | Puede importar |
| --- | --- |
| core | core |
| shared | core, shared |
| infra | core, infra, `node:*` |
| webview | core, shared, webview |
| extension | todo lo anterior salvo webview, más `vscode` y `node:*` |

Ningún paquete de npm en tiempo de ejecución. Las importaciones relativas llevan extensión
`.ts` (los tests corren con el soporte nativo de TypeScript de Node).

## Dónde va cada cosa

- Regla o cálculo que se puede probar sin VS Code ni DOM: `core/` (o una función pura
  exportada en `webview/`, como `planDetail` o `rankMatches`). Siempre con test.
- Mensaje nuevo entre webview y extensión: tipo en `shared/messages.ts`, validación en
  `parseWebviewMessage`, handler en `PreviewSession.createHandlers()` (el tipo `Handlers`
  obliga a cubrir todos). Test en `test/shared/messages.test.ts`.
- Comando, editor o clave de estado: el ID va en `extension/ids.ts` y en `package.json`;
  `test/manifest.test.ts` verifica que coincidan.
- Estado de un preview (layout, Arrange, último SVG): en `PreviewSession`, no en mapas
  globales. Lo global (modo oscuro) pasa por `PreviewManager`.
- `extension.ts` solo arma objetos y los registra (composition root): sin lógica.
- Elementos del DOM: `byId()` de `webview/host.ts`, que falla si el id no existe.

## Patrones del código

- Errores esperables como valores: `Result<T>` (`core/result.ts`) o uniones con `kind`
  (`ArrangeOutcome`). `throw` solo para lo que no debería pasar nunca.
- Dependencias por constructor o por parámetro (`BatchRenderer`, `SessionDeps`), para poder
  probar con fakes. Nada de singletons.
- Clases sin propiedades de parámetro (`constructor(private x)`): Node no las ejecuta al
  quitar tipos y `erasableSyntaxOnly` las rechaza. Campo declarado + asignación.
- Sin `any`; `unknown` y validación en los bordes (mensajes, estado persistido, JSON).
- Funciones cortas con nombre que diga qué hacen; comentarios solo para el porqué, en inglés,
  hasta 3 líneas.

## Tests

- Todo cambio de comportamiento lleva test; todo bug corregido, un test que lo reproduzca.
- `test/fixtures/golden.json` guarda la salida de la versión 0.0.19 (Arrange, puntaje,
  modo oscuro). Si cambiás ese comportamiento a propósito, regenerá el golden en el mismo
  commit y explicá por qué en el mensaje.
- `test/webview/page.test.ts` abre la página real en Edge o Chrome headless y
  `test/extension/activate.test.ts` carga el bundle con un `vscode` falso. Necesitan
  `pnpm run build` antes (lo hace `verify`). Los de Java y navegador se saltean solos si
  falta la herramienta; en el CI no faltan.
- No uses diagramas de proyectos reales como fixtures: solo diagramas sintéticos.

## Jar de PlantUML

- El jar no se commitea. `node scripts/fetch-plantuml-jar.mjs` baja la versión fijada en
  `scripts/plantuml-jar.json` y verifica su SHA-256; si el archivo ya está y coincide, no
  hace nada. El CI lo corre antes de `verify`.
- Para cambiar de versión: actualizá `version`, `url` y `sha256` en el mismo commit, y
  `THIRD_PARTY_NOTICES.md`. El checksum sale de la Release oficial de plantuml/plantuml.
- `path` tiene que ser donde el código busca el jar, y `.vscodeignore` no lo puede excluir.

## Ramas y publicación

- `main`: lo publicado en el Marketplace. Solo recibe merges desde `develop`.
- `develop`: integración. Las `feature/<tema>` salen de `develop` y vuelven a `develop`.
- `plan-uml-original`: copia de referencia del repo original (justuskarlsson/plan-uml,
  remoto `plan-uml-original`). No se desarrolla ni se mergea ahí; se compara contra ella para
  traer cambios del original a una `feature/*`.
- Publicar: subir `version` en `package.json` y `CHANGELOG.md` en `develop`, mergear a
  `main` y crear el tag `vX.Y.Z` sobre `main`. El workflow `release.yml` verifica, empaqueta,
  crea la Release con el `.vsix` y publica con Trusted Publishing (OIDC, sin token). Nunca
  publiques a mano.
- Si hiciera falta un token (`VSCE_PAT`), vive solo como secreto del repo. Nunca en
  archivos, commits ni chats.

## Antes de terminar

- [ ] `pnpm run verify` en verde
- [ ] Tests nuevos para lo que cambió
- [ ] Sin dependencias de runtime nuevas; las de desarrollo, justificadas
- [ ] IDs nuevos en `ids.ts` y `package.json`
- [ ] Entrada en `CHANGELOG.md` si el usuario lo nota
- [ ] Si se toca el jar o algo de terceros: `THIRD_PARTY_NOTICES.md` actualizado
