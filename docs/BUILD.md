# Builds empaquetados de la app de escritorio

Cómo generar los instalables de **Digital Power Fichaje** (Electron) para Mac y
Windows con electron-builder. La configuración vive en
[`desktop/electron-builder.yml`](../desktop/electron-builder.yml) y la salida en
`desktop/release/` (ignorada por git).

## Requisitos

- Node.js ≥ 20 y `npm install` ejecutado en la raíz del monorepo.
- `@digital-power/shared` compilado (`npm run build --workspace @digital-power/shared`,
  o simplemente `npm run build` en la raíz). El build del desktop lo importa.
- Conexión a internet la primera vez: electron-builder descarga el runtime de
  Electron de cada plataforma (~100 MB, se cachea en `~/Library/Caches/electron`).

## Comandos

Desde `desktop/` (o con `--workspace @digital-power/desktop` desde la raíz):

```bash
npm run dist:mac   # → release/Digital Power Fichaje-<versión>-arm64.dmg y .zip
npm run dist:win   # → release/Digital Power Fichaje-<versión>-win.zip (x64 portable)
```

`dist:win` ejecuta antes `scripts/fetch-win-binding.cjs`: al hacer cross-build
desde un Mac, el binding N-API de Windows de `get-windows` no está en
`node_modules` (el install script solo baja el de la plataforma actual) y ese
script lo descarga de las releases de GitHub. En una máquina Windows no hace
falta (es idempotente: si ya está, no hace nada).

## Qué sale y qué no

| Plataforma | Artefacto | Notas |
|---|---|---|
| macOS | `…-arm64.dmg` + `…-arm64-mac.zip` | Apple Silicon. Para Intel: `npx electron-builder --mac --x64` (el binario de get-windows es universal, vale igual) |
| Windows | `…-win.zip` (portable x64) | Descomprimir y ejecutar `Digital Power Fichaje.exe` |

**Instalador NSIS de Windows** (`Setup.exe`): `npx electron-builder --win nsis --x64`.
Ojo: el `makensis` que descarga electron-builder es un binario x86_64; en un Mac
Apple Silicon necesita Rosetta 2 (`softwareupdate --install-rosetta`) o un
`makensis` nativo en el PATH. Alternativa: generar el instalador en una máquina
Windows. El target por defecto es `zip` justamente para que el build funcione en
cualquier máquina.

## Decisiones de la configuración

- **`electronVersion` fijado** en `electron-builder.yml`: en el monorepo con npm
  workspaces, electron vive hoisted en la raíz y electron-builder no resuelve el
  rango `^33` por sí solo. Si se actualiza la devDependency `electron`, actualizar
  también ese campo.
- **`asarUnpack` de get-windows**: en macOS ejecuta un binario externo (`main`) y
  en Windows carga un addon N-API; ninguno puede correr dentro del asar.
- **`npmRebuild: false`**: get-windows trae binarios precompilados y su
  `binding.gyp` es solo para Windows; un rebuild en Mac fallaría sin necesidad.
- **`@mapbox/node-pre-gyp` es dependencia de producción** del desktop: en Windows,
  `get-windows` lo importa en runtime para localizar su binding (no lo declara
  como dependencia propia); sin él, el paquete de Windows arrancaría sin tracking.
- **react/react-dom van en devDependencies**: Vite los deja bundleados en
  `dist/renderer`, no hacen falta en `node_modules` del paquete final.

## Pendiente antes del piloto (ver docs/PENDIENTE.md)

- **Sin firmar.** macOS: hace falta Developer ID + notarización — además los
  permisos TCC (Accesibilidad/Grabación de pantalla) se asocian a la firma, y sin
  firma estable macOS los re-pide al actualizar. Windows: certificado Authenticode
  para evitar el SmartScreen. Con certificados: variables `CSC_LINK`/`CSC_KEY_PASSWORD`.
- **Icono propio.** Ahora sale el icono por defecto de Electron (falta `.icns`/`.ico`).

## Problemas conocidos

- Si la app empaquetada "muere nada más abrirla" al lanzarla desde un terminal
  integrado (VS Code), comprueba que `ELECTRON_RUN_AS_NODE` no esté en el
  entorno: `env -u ELECTRON_RUN_AS_NODE open "release/mac-arm64/Digital Power Fichaje.app"`.
  Desde el Finder no pasa.
