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
                         #   crea la BD digital_power_test y aplica migraciones
npx tsx scripts/verify-seed.ts       # comprobación del seed (conteos, PINs, CHECKs)
npx tsx scripts/simulate-session.ts  # simula una sesión de 2 h (registro cada 5 s)
                                     #   y verifica que el resumen por categoría cuadra
```

Tras cambiar `prisma/schema.prisma` o hacer pull con migraciones nuevas: `npx prisma generate` (el cliente generado en `src/generated/prisma` no se regenera solo) y `npm run db:migrate`.

**BD local:** este Mac usa **Postgres.app v18** (`/Applications/Postgres.app`, binarios en `/Applications/Postgres.app/Contents/Versions/18/bin`, no están en el PATH) escuchando en el puerto 5432. El proyecto usa la base `digital_power` (desarrollo) y `digital_power_test` (tests) con el usuario del sistema sin contraseña (`postgresql://pellotellechea@localhost:5432/digital_power` en `backend/.env`). En producción será Railway.

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
- `POST /auth/pin` — login con `employeeId` + PIN de 4 dígitos. 5 fallos seguidos → bloqueo de 5 min (429). Mensajes de error genéricos.
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
- **En curso (Fase B — app de escritorio, primera iteración el 2026-07-08):** flujo de fichaje completo en `desktop/` sobre Electron + React: configuración por dispositivo (slug de empresa + URL del servidor, persistida en `userData/config.json`), selección de empleado, PIN tipo cajero (auto-submit, 401 genérico, 429 con cuenta atrás) y ON/OFF con reanudación de sesión al recibir 409 y vuelta a la selección tras OFF (ordenadores compartidos). Arquitectura: main es dueño de config, cliente API, token JWT y tracker; renderer React (Vite) habla solo por IPC tipado (`desktop/src/common/ipc-contract.ts`, sandbox + contextBridge). El pipeline de tracking es real (muestreo cada 5 s, lotes cada 60 s, flush final con reintentos al OFF) pero el detector es **mock** (`MockActivityDetector` implementa `ActivityDetector`; se sustituirá por `get-windows`). Falta de Fase B: detección real (+ permisos de accesibilidad en Mac), inactividad con aviso, icono de bandeja, aviso LOPDGDD de primer uso, empaquetado/firma.
- **Deuda técnica y decisiones pendientes:** ver [docs/PENDIENTE.md](docs/PENDIENTE.md).
- Las fases C–E (tablet, admin, piloto) están definidas en la sección 12 de la especificación.
