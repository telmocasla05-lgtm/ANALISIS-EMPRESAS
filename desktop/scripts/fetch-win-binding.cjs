// Descarga el binding N-API de Windows x64 de get-windows para poder
// empaquetar la app de Windows desde un Mac (cross-build). En una máquina
// Windows no hace falta: el install script de get-windows ya baja el suyo.
// Idempotente: si el binding ya está, no hace nada.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// El exports de get-windows no expone ./package.json: se resuelve su entry
// (index.js) y de ahí el directorio del paquete.
const getWindowsDir = path.dirname(require.resolve('get-windows'));
const bindingDir = path.join(getWindowsDir, 'lib', 'binding', 'napi-9-win32-unknown-x64');

if (fs.existsSync(bindingDir)) {
  console.log('binding de Windows ya presente:', bindingDir);
  process.exit(0);
}

console.log('descargando binding win32-x64 de get-windows…');
execFileSync(
  'npx',
  [
    'node-pre-gyp',
    'install',
    '--target_platform=win32',
    '--target_arch=x64',
    '--target_libc=unknown',
    '--fallback-to-build=false',
  ],
  { cwd: getWindowsDir, stdio: 'inherit' },
);

if (!fs.existsSync(bindingDir)) {
  console.error('el binding no apareció en', bindingDir);
  process.exit(1);
}
console.log('binding de Windows listo:', bindingDir);
