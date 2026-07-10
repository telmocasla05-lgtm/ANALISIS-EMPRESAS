# Digital Power · Sistema de Tracking Pasivo

Plataforma multi-tenant de **Digital Power** que mide de forma **automática y pasiva** en qué invierte el tiempo cada empleado de una empresa cliente. El empleado solo pulsa **ON** al empezar su turno y **OFF** al acabar; mientras está en ON, el sistema detecta en segundo plano la aplicación/ventana activa y la categoriza según reglas configurables por sector (clínica, gestoría, inmobiliaria…).

Sirve como:

1. **Diagnóstico inicial** — saber qué tareas repetitivas conviene automatizar.
2. **Prueba de ROI continua** — medir el ahorro real tras automatizar.
3. **Registro horario** — obligatorio por ley en España.

Con los datos agregados, el sistema genera **borradores de informe con la API de Claude** que Digital Power revisa y edita en el panel antes de entregarlos al cliente (nunca se envían sin revisión humana).

La especificación completa está en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md); las instrucciones para agentes de IA en [CLAUDE.md](CLAUDE.md).

## Arquitectura

Monorepo con **npm workspaces**:

| Paquete | Qué es | Stack |
|---|---|---|
| [`backend/`](backend/) | API REST: auth por PIN y por email, sesiones de trabajo, ingesta y categorización de registros, resúmenes agregados e informes con Claude | Node.js + Express + TypeScript + PostgreSQL (Prisma 7) |
| [`desktop/`](desktop/) | App de fichaje para Windows/Mac con **tracking pasivo** (ventana activa vía `get-windows`), detección de inactividad con aviso e icono de bandeja | Electron + React + TypeScript |
| [`tablet/`](tablet/) | Web app responsive de fichaje para tablet/móvil con **selección activa** de categoría (botones grandes); PWA básica | React + Vite |
| [`admin/`](admin/) | Panel de administración: dashboards, gestión de empleados/roles/reglas, registro horario con export CSV e informes (generar, editar, exportar a PDF) | React + Vite + Recharts |
| [`shared/`](shared/) | Tipos y cliente HTTP de fichaje compartidos (`@digital-power/shared`) | TypeScript (build dual CJS + ESM) |
| [`docs/`](docs/) | Especificación, guía de builds y deuda técnica | — |

Puntos clave del diseño:

- **Multi-tenant**: un solo backend/BD para todos los clientes; cada empresa es un workspace aislado y toda consulta filtra por empresa.
- **Identificación por PIN** de 4 dígitos (tipo cajero), con bloqueo temporal tras 5 fallos.
- **Dos tipos de token JWT** discriminados (`employee_session` / `admin`): un token de empleado nunca vale para el panel ni viceversa.
- Las **reglas de categorización viven en la base de datos** (por sector y por empresa), nunca hardcodeadas.
- **Transparencia**: icono visible en bandeja mientras se trackea; nunca se captura contenido, teclado ni URLs completas (solo app, título y dominio).

## Requisitos

- **Node.js ≥ 20**
- **PostgreSQL** local en el puerto 5432 (Postgres.app o Homebrew) con una base `digital_power` (y `digital_power_test` para los tests, se crea sola)
- Para el flujo de informes: una `ANTHROPIC_API_KEY` válida de [Anthropic](https://platform.claude.com/)

## Puesta en marcha

```bash
git clone <repo> && cd ANALISIS-EMPRESAS
npm install                                # instala todo el monorepo

# Configuración: copiar la plantilla y rellenar (Prisma y la API leen backend/.env)
cp .env.example backend/.env
#   → DATABASE_URL, JWT_SECRET y ANTHROPIC_API_KEY

# Base de datos
npm run db:migrate --workspace @digital-power/backend   # aplica migraciones
npm run db:seed    --workspace @digital-power/backend   # seed "Clínica Demo" (idempotente)

# Arrancar (cada uno en su terminal)
npm run dev:backend    # API en http://localhost:3001
npm run dev:admin      # panel en http://localhost:5173 (proxy /api → :3001)
npm run dev:tablet     # web de tablet (proxy /api → :3001)
npm run dev:desktop    # app Electron de escritorio
```

> Tras cambiar `backend/prisma/schema.prisma` o hacer pull con migraciones nuevas: `npx prisma generate` (desde `backend/`) y `npm run db:migrate` — el cliente generado en `backend/src/generated/prisma` no se regenera solo. Si el typecheck falla tras clonar, ejecuta antes `npm run build --workspace @digital-power/shared`.

### Credenciales del seed (solo desarrollo)

| Quién | Acceso |
|---|---|
| Superadmin (Digital Power) | `superadmin@digitalpower.dev` / `digitalpower` |
| Admin del cliente demo | `admin@clinicademo.dev` / `clinicademo` |
| Empleados (PIN de fichaje) | `1234`, `2345`, `4567`, `3456` |
| Slug de la empresa demo | `clinica-demo` |

### Flujo de la demo

1. Abrir la app de escritorio (o la web de tablet aprovisionada con `?empresa=clinica-demo`), elegir empleado, meter el PIN y pulsar **ON**.
2. Trabajar con normalidad (o exportar `DP_MOCK_TRACKING=1` para simular actividad). Pulsar **OFF** al acabar.
3. Entrar en el panel admin, elegir la Clínica Demo: el **Dashboard** muestra horas y coste por categoría/empleado; **Sesiones** es el registro horario (con export CSV); en **Informes** se genera el borrador con Claude, se edita, se marca como revisado y se exporta a **PDF**.

## Tests y comprobaciones

```bash
npm run typecheck                                 # los 5 paquetes
npm test --workspace @digital-power/backend       # integración (vitest + supertest)
```

El `pretest` crea la BD `digital_power_test` y aplica las migraciones. La URL de la BD de test está en `backend/.env.test`; en otra máquina/CI se sobreescribe sin tocar el archivo:

```bash
TEST_DATABASE_URL="postgresql://<usuario>@localhost:5432/digital_power_test" npm test
```

Scripts de verificación adicionales (desde `backend/`):

```bash
npx tsx scripts/verify-seed.ts       # conteos, PINs y CHECKs del seed
npx tsx scripts/simulate-session.ts  # simula una sesión de 2 h y cuadra el resumen
```

## Builds de escritorio

Desde `desktop/`: `npm run dist:mac` (DMG/ZIP arm64) o `npm run dist:win` (ZIP portable x64). Detalles, requisitos y estado de la firma en [docs/BUILD.md](docs/BUILD.md).

## Variables de entorno

Plantilla en [.env.example](.env.example) (copiar a `backend/.env`):

| Variable | Uso |
|---|---|
| `PORT` | Puerto de la API (3001 en desarrollo) |
| `DATABASE_URL` | Cadena de conexión PostgreSQL |
| `JWT_SECRET` | Secreto de firma de los JWT (largo y aleatorio; distinto en producción) |
| `ANTHROPIC_API_KEY` | Clave de la API de Claude para los borradores de informe (solo vive en el backend, jamás en un frontend) |

En los frontends: `VITE_API_URL` (admin, URL de la API en producción) y `DP_API_PROXY` (puerto alternativo del proxy en dev). La app de escritorio guarda su configuración (slug, servidor, intervalo) por dispositivo en `userData/config.json`.

## Despliegue

Infraestructura prevista (nueva y separada de otros proyectos de Digital Power):

- **Backend + PostgreSQL → Railway.** Compilar con `npm run build --workspace @digital-power/shared && npm run build --workspace @digital-power/backend`, arrancar con `npm start` (sirve `dist/index.js`). Aplicar migraciones en el deploy con `npx prisma migrate deploy`. Definir `DATABASE_URL` (la de Railway), `JWT_SECRET` propio y `ANTHROPIC_API_KEY`.
- **Panel admin → Vercel.** Build estático de Vite (`npm run build --workspace @digital-power/admin`) con `VITE_API_URL` apuntando al backend de Railway.
- **Web de tablet**: pendiente de decidir entre servirla desde el propio backend (mismo origen, recomendado) o hosting separado + CORS con lista blanca — ver [docs/PENDIENTE.md](docs/PENDIENTE.md).
- **App de escritorio**: se distribuye a los clientes como build empaquetado (ver arriba); requiere firma/notarización antes del piloto.

⚠️ **Antes de producción** hay que cerrar los puntos de seguridad abiertos (rate limiting por IP en los logins, CORS con lista blanca, `helmet`, idempotencia de la ingesta…). La lista completa y priorizada está en [docs/PENDIENTE.md](docs/PENDIENTE.md).

## Documentación

- [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md) — especificación funcional completa (la fuente de verdad).
- [docs/BUILD.md](docs/BUILD.md) — builds empaquetados de la app de escritorio.
- [docs/PENDIENTE.md](docs/PENDIENTE.md) — deuda técnica y todo lo que queda para producción.
- [CLAUDE.md](CLAUDE.md) — convenciones del repo y estado por fases (para agentes de IA y desarrolladores).
