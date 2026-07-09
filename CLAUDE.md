# CLAUDE.md — Digital Power · Sistema de Tracking Pasivo

## Qué es este proyecto

Plataforma multi-tenant de Digital Power que mide de forma **automática y pasiva** en qué invierte el tiempo cada empleado de una empresa cliente. El empleado solo pulsa ON al empezar su turno y OFF al acabar; mientras está en ON, el sistema detecta en segundo plano la aplicación/ventana activa y la categoriza según reglas predefinidas por sector (clínica, gestoría, inmobiliaria…).

Sirve como: (1) diagnóstico inicial de qué automatizar, (2) prueba de ROI continua tras automatizar, y (3) registro horario (obligatorio por ley en España).

**La especificación completa está en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md) — leerla antes de implementar cualquier funcionalidad.**

Puntos clave que no hay que olvidar:

- **Multi-tenant**: un solo backend/BD para todos los clientes. Cada empresa es un workspace aislado; **toda consulta debe filtrar por empresa**. Los datos de un cliente nunca se mezclan con los de otro.
- **Tracking pasivo solo en Windows/Mac** (Electron). En tablet/móvil no es viable sin MDM: allí se usa **selección activa simplificada** (4-6 botones grandes de categoría por rol).
- Identificación por **PIN de 4 dígitos** (sin fricción, tipo cajero automático).
- Detección de inactividad **con aviso previo** (nunca pausar en silencio).
- Transparencia: icono visible en bandeja mientras trackea + aviso informativo en el primer uso (LOPDGDD).
- Las **reglas de categorización viven en la base de datos** (configurables por sector/cliente), nunca hardcodeadas.
- Los informes generados con la API de Claude son **borradores**: siempre los revisa Digital Power antes de enviarse al cliente.

## Stack

| Componente | Tecnología |
|---|---|
| Backend API | Node.js + Express + TypeScript |
| Base de datos | PostgreSQL + Prisma 7 (config en `backend/prisma.config.ts`; cliente generado en `backend/src/generated/prisma`, requiere driver adapter `@prisma/adapter-pg`) |
| App escritorio (Windows/Mac) | Electron + React + TypeScript (detección de ventana activa con librería tipo `active-win` / `get-windows`) |
| App tablet/móvil | Web app responsive en React (selección activa de categoría) |
| Panel admin | React + Recharts |
| Informes | API de Claude (Anthropic) sobre datos agregados, con revisión humana |
| Infraestructura | Railway (backend + BD) + Vercel (admin). Nueva y separada de `app-conta` |

## Estructura del monorepo

```
.
├── backend/    API REST (Express + TypeScript) — auth por PIN, sesiones, registros, categorización, informes
├── desktop/    App Electron (Windows/Mac) — login PIN, ON/OFF, tracking pasivo, inactividad, icono bandeja
├── tablet/     Web app responsive (React + Vite) — selección activa de categoría con botones grandes
├── admin/      Panel de administración (React + Vite + Recharts) — dashboards y revisión de informes
├── shared/     Tipos TypeScript compartidos entre paquetes (@digital-power/shared)
└── docs/       Documentación (ESPECIFICACION.md)
```

Es un monorepo con **npm workspaces** (definidos en el `package.json` raíz). Cada paquete tiene su propio `package.json` y su `tsconfig.json` que extiende `tsconfig.base.json`.

## Convenciones de código

- **TypeScript estricto** (`strict: true`) en todos los paquetes; sin `any` salvo justificación.
- **Código e identificadores en inglés**; textos de UI, comentarios de dominio y documentación en español.
- Componentes React en `PascalCase`; variables/funciones en `camelCase`; archivos de componentes `PascalCase.tsx`, resto `kebab-case.ts`.
- Los tipos compartidos entre backend y frontends van en `shared/`, no se duplican.
- Nada de credenciales ni secretos en el código: todo por variables de entorno (ver `.env.example`).
- Commits en español siguiendo Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`…

## Comandos

Requiere Node.js >= 20.

```bash
npm install              # instala todas las dependencias del monorepo (raíz)

npm run dev:backend      # arranca la API en modo desarrollo (tsx watch)
npm run dev:desktop      # arranca la app Electron
npm run dev:tablet       # arranca la web app de tablet (Vite)
npm run dev:admin        # arranca el panel de administración (Vite)

npm run build            # compila todos los paquetes
npm run typecheck        # typecheck de todos los paquetes
```

Base de datos y tests (desde `backend/`, o con `--workspace @digital-power/backend`):

```bash
npm run db:migrate       # crea/aplica migraciones Prisma (desarrollo)
npm run db:seed          # seed de la Clínica Demo (idempotente)
npm run db:studio        # explorador visual de la BD
npm test                 # tests de integración (vitest + supertest); el pretest
                         #   crea la BD digital_power_test y aplica migraciones.
                         #   En otra máquina/CI: TEST_DATABASE_URL sobreescribe
                         #   la URL del .env.test
npx tsx scripts/verify-seed.ts       # comprobación del seed (conteos, PINs, CHECKs)
npx tsx scripts/simulate-session.ts  # simula una sesión de 2 h (registro cada 5 s)
                                     #   y verifica que el resumen por categoría cuadra
```

Tras cambiar `prisma/schema.prisma` o hacer pull con migraciones nuevas: `npx prisma generate` (el cliente generado en `src/generated/prisma` no se regenera solo) y `npm run db:migrate`.

Builds empaquetados del desktop (electron-builder): `npm run dist:mac` / `npm run dist:win` desde `desktop/` — ver [docs/BUILD.md](docs/BUILD.md).

**BD local:** cada máquina de desarrollo usa su propio PostgreSQL local en el puerto 5432 con las bases `digital_power` (desarrollo) y `digital_power_test` (tests), usuario del sistema sin contraseña; la cadena de conexión concreta vive en `backend/.env` (no se commitea). Setups conocidos: un Mac con Postgres.app v18 (binarios en `/Applications/Postgres.app/Contents/Versions/18/bin`, usuario `pellotellechea`) y otro con PostgreSQL 16 de Homebrew (prefijo `~/homebrew`, usuario `cas`). En producción será Railway.

## Variables de entorno

Copiar `.env.example` a `.env` en la raíz y rellenar:

- `PORT` — puerto de la API del backend.
- `DATABASE_URL` — cadena de conexión PostgreSQL.
- `JWT_SECRET` — secreto para firmar los tokens de sesión.
- `ANTHROPIC_API_KEY` — clave de la API de Claude para la generación de borradores de informe.

## API del backend (Fase A)

Todas las rutas cuelgan de `/api`. Dos tipos de token JWT discriminados por `typ` (un token de empleado nunca vale como admin ni viceversa):

**Apps de fichaje (escritorio/tablet)** — token de empleado (16 h) emitido por login PIN:

- `GET /empresas/:slug/empleados` — lista pública para la pantalla de fichaje (id, nombre, avatar).
- `POST /auth/pin` — login con `employeeId` + PIN de 4 dígitos. 5 fallos seguidos → bloqueo de 5 min (429). Mensajes de error genéricos. Devuelve también `inactivityMinutes` de la empresa (§6) para el aviso de inactividad del desktop.
- `POST /sesiones/on` · `POST /sesiones/:id/off` — abre/cierra turno (una sesión abierta por empleado).
- `POST /sesiones/:id/registros` — ingesta por lotes de registros de tracking; el backend los categoriza al insertar (reglas de empresa → reglas de sector → sin categorizar; `isIdle` no se categoriza).

**Panel admin** — token de admin (12 h), roles `SUPERADMIN` (Digital Power, ve todo) y `CLIENTE` (solo su empresa; acceso cruzado → 403):

- `POST /admin/auth/login` — email + contraseña.
- `GET /admin/empresas/:id/resumen?semana=` — horas y coste estimado agregados por categoría y por empleado (semana natural UTC; duración estimada por hueco entre lecturas con tope de 10 s, ver `services/resumen.ts`).
- `GET|POST|PUT|DELETE /admin/empresas/:companyId/empleados` — CRUD de empleados (baja lógica; el PIN se recibe en alta/edición pero **nunca se devuelve**).
- `GET|POST|PUT|DELETE /admin/empresas/:companyId/roles` — CRUD de roles.
- `GET|POST|PUT|DELETE /admin/empresas/:companyId/reglas` — reglas de categorización propias de la empresa; las de sector se listan como solo lectura (`scope: "sector"`).

Credenciales del seed (solo desarrollo): `superadmin@digitalpower.dev`/`digitalpower`, `admin@clinicademo.dev`/`clinicademo`; PINs de empleados 1234/2345/4567/3456.

## Estado actual

- **Hecho (Fase A — completa, revisada el 2026-07-08):** esquema PostgreSQL multi-tenant con Prisma + migraciones (CHECK de doble ámbito sector/empresa; `admin_users`, `slug` de empresa y bloqueo por PIN), seed de la "Clínica Demo", API Express completa (ver sección anterior), motor de categorización desde BD, resumen semanal agregado y 16 tests de integración (aislamiento multi-tenant, flujo PIN→ON→registros→OFF, bloqueo por PIN, categorización). Revisión de cierre: tests en verde, aislamiento entre empresas comprobado en vivo (403/404), sin fugas de PIN en respuestas, y simulación de 2 h con agregación exacta (`scripts/simulate-session.ts`).
- **Hecho (Fase B — tercera iteración, revisada el 2026-07-09):** detección de inactividad con aviso previo (§6): `IdleWatcher` en el main sobre `powerMonitor.getSystemIdleTime()` (umbral = `inactivityMinutes` de la empresa, que ahora devuelve el login; cuenta atrás de 60 s), modal "¿Sigues ahí?" en el renderer, pausa retroactiva desde el inicio del aviso si no hay respuesta (durante el aviso se retienen los flushes para poder re-etiquetar el buffer con `isIdle`) y reanudación automática al volver la actividad; la bandeja refleja la pausa. `DP_IDLE_THRESHOLD_SECONDS`/`DP_IDLE_COUNTDOWN_SECONDS` acortan los tiempos en pruebas manuales. Builds empaquetados con electron-builder (`docs/BUILD.md`): DMG/ZIP macOS arm64 y ZIP portable Windows x64 (con binding win32 de get-windows descargado por `desktop/scripts/fetch-win-binding.cjs`), sin firmar. Revisión verificada con dos pruebas E2E contra backend+BD reales: (1) ON → 3 apps → aviso sin respuesta → pausa → reanudación → OFF, con los registros activos categorizados, los de pausa con `is_idle=true` sin categoría y 0 registros activos dentro de la ventana de pausa; (2) corte de red real (proxy TCP) a mitad de sesión: 23/23 registros en BD, sin pérdida ni duplicados.
- **Iteración anterior (Fase B — segunda, el 2026-07-09):** flujo de fichaje completo en `desktop/` sobre Electron + React: configuración por dispositivo (slug de empresa + URL del servidor + intervalo de muestreo 5–10 s, persistida en `userData/config.json`), selección de empleado, PIN tipo cajero (auto-submit, 401 genérico, 429 con cuenta atrás) y ON/OFF con reanudación de sesión al recibir 409 y vuelta a la selección tras OFF (ordenadores compartidos). Arquitectura: main es dueño de config, cliente API, token JWT y tracker; renderer React (Vite) habla solo por IPC tipado (`desktop/src/common/ipc-contract.ts`, sandbox + contextBridge). **Tracking pasivo real** con `get-windows` (sucesor de `active-win`; ESM puro cargado con `import()` dinámico desde el main CJS): app + título + dominio (la URL del navegador —solo macOS— se reduce a hostname en el detector y jamás se guarda; nunca se captura contenido ni teclado). Buffer con espejo en disco (`userData/pending/<sessionId>.json`, escritura atómica) y recuperación en el siguiente turno del empleado si la app se cierra con registros sin subir; lotes cada 60 s troceados a 500 registros (límite de ~100 KB del `express.json()` del backend). Icono de bandeja mientras hay turno abierto (template en macOS, color en Windows) con estado y OFF rápido. En macOS, pantalla guiada de permisos tras el PIN (Grabación de pantalla → título; Accesibilidad → dominio); sin permisos el detector degrada a solo nombre de app (los checks se desactivan por lectura para que el binario no falle ni macOS re-avise). `DP_MOCK_TRACKING=1` mantiene el detector simulado para demos. Falta de Fase B: aviso LOPDGDD de primer uso, firma/notarización de los builds e iconos propios.
- **Deuda técnica y decisiones pendientes:** ver [docs/PENDIENTE.md](docs/PENDIENTE.md).
- Las fases C–E (tablet, admin, piloto) están definidas en la sección 12 de la especificación.
