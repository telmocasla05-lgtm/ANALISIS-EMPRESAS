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
├── shared/     Tipos y cliente API de fichaje compartidos (@digital-power/shared; build dual
│                 dist/cjs + dist/esm, todo en src/index.ts a propósito — ver comentario ahí)
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

**BD local:** cada máquina de desarrollo usa su propio PostgreSQL local en el puerto 5432 con las bases `digital_power` (desarrollo) y `digital_power_test` (tests), usuario del sistema sin contraseña; la cadena de conexión concreta vive en `backend/.env` (no se commitea). Setups conocidos: dos Mac con Postgres.app v18 (binarios en `/Applications/Postgres.app/Contents/Versions/18/bin`, usuarios `pellotellechea` y `joeyms`) y otro con PostgreSQL 16 de Homebrew (prefijo `~/homebrew`, usuario `cas`). En producción será Railway.

## Variables de entorno

Copiar `.env.example` a `.env` en la raíz y rellenar:

- `PORT` — puerto de la API del backend.
- `DATABASE_URL` — cadena de conexión PostgreSQL.
- `JWT_SECRET` — secreto para firmar los tokens de sesión.
- `ANTHROPIC_API_KEY` — clave de la API de Claude para la generación de borradores de informe.

## API del backend (Fases A y D)

Todas las rutas cuelgan de `/api`. Dos tipos de token JWT discriminados por `typ` (un token de empleado nunca vale como admin ni viceversa):

**Apps de fichaje (escritorio/tablet)** — token de empleado (16 h) emitido por login PIN:

- `GET /empresas/:slug/empleados` — lista pública para la pantalla de fichaje (id, nombre, avatar).
- `POST /auth/pin` — login con `employeeId` + PIN de 4 dígitos. 5 fallos seguidos → bloqueo de 5 min (429). Mensajes de error genéricos. Devuelve también `inactivityMinutes` y `sampleIntervalSeconds` de la empresa (§6/§8), configurables desde el panel admin.
- `POST /sesiones/on` · `POST /sesiones/:id/off` — abre/cierra turno (una sesión abierta por empleado).
- `POST /sesiones/:id/registros` — ingesta por lotes de registros de tracking; el backend los categoriza al insertar (reglas de empresa → reglas de sector → sin categorizar; `isIdle` no se categoriza). Si un registro trae `categoryId` explícito (selección activa de la tablet), se valida contra las categorías visibles del tenant (una ajena → 400) y se aplica tal cual, saltándose las reglas.
- `GET /categorias` — categorías visibles para la empresa del empleado (las propias + la plantilla de su sector), para los botones de selección activa de la tablet.

**Panel admin** — token de admin (12 h), roles `SUPERADMIN` (Digital Power, ve todo) y `CLIENTE` (solo su empresa; acceso cruzado → 403):

- `POST /admin/auth/login` — email + contraseña.
- `GET /admin/empresas` — listado para el selector del panel (SUPERADMIN todas, CLIENTE solo la suya).
- `GET /admin/empresas/:id` · `PUT /admin/empresas/:id/ajustes` — detalle y ajustes configurables: `avgHourlyCostCents` (entero > 0), `inactivityMinutes` (1–120) y `sampleIntervalSeconds` (5–10).
- `GET /admin/empresas/:id/resumen?desde=&hasta=` (o `?semana=`) — horas y coste estimado agregados por categoría y por empleado (días inclusive en UTC; duración estimada por hueco entre lecturas con tope de 10 s, ver `services/resumen.ts`).
- `GET /admin/empresas/:id/evolucion?semanas=N` — serie de las últimas N semanas naturales (horas/coste totales y por categoría).
- `GET /admin/empresas/:id/sin-categorizar?desde=&hasta=` — grupos de registros sin categorizar (app+dominio, horas estimadas, título de ejemplo) para revisar desde el dashboard.
- `GET /admin/empresas/:id/sesiones?desde=&hasta=&employeeId=` — registro horario: sesiones con duración y estado (el CSV lo genera el panel en cliente).
- `GET|POST|PUT|DELETE /admin/empresas/:companyId/empleados` — CRUD de empleados (baja lógica; el PIN se recibe en alta/edición pero **nunca se devuelve**; reenviar `pin` en un PUT = resetearlo y desbloquear el fichaje).
- `GET|POST|PUT|DELETE /admin/empresas/:companyId/roles` — CRUD de roles.
- `GET|POST|PUT|DELETE /admin/empresas/:companyId/reglas` — reglas de categorización propias de la empresa; las de sector se listan como solo lectura (`scope: "sector"`). El `POST` acepta `recategorizar: true` para aplicar la regla nueva al histórico sin categorizar de la empresa (no toca registros ya categorizados, `isIdle` ni otras empresas).
- `GET /admin/empresas/:companyId/categorias` — categorías visibles (plantilla del sector + propias) para los selectores de reglas.
- `GET|POST /admin/empresas/:companyId/informes` · `GET|PUT|DELETE /admin/empresas/:companyId/informes/:informeId` — informes (§10). El `POST` (body `desde`/`hasta`) agrega los datos del periodo (`services/informe-datos.ts`: horas/coste por categoría, empleado y semana + plantillas de automatización del sector) y redacta el borrador con la API de Claude (`services/informe-claude.ts`, SDK oficial, modelo Sonnet, `ANTHROPIC_API_KEY` por entorno). Estados solo hacia delante y de uno en uno: `BORRADOR → REVISADO → ENVIADO` (ENVIADO = registro manual de que Digital Power ya lo envió; el sistema **nunca** envía nada, y un informe enviado es de solo lectura). El `PUT` edita `content` (markdown) y/o avanza `status`; `DELETE` solo borradores; el borrador original de Claude se conserva en `draft_content`.

Credenciales del seed (solo desarrollo): `superadmin@digitalpower.dev`/`digitalpower`, `admin@clinicademo.dev`/`clinicademo`; PINs de empleados 1234/2345/4567/3456.

## Estado actual

- **Hecho (Fase A — completa, revisada el 2026-07-08):** esquema PostgreSQL multi-tenant con Prisma + migraciones (CHECK de doble ámbito sector/empresa; `admin_users`, `slug` de empresa y bloqueo por PIN), seed de la "Clínica Demo", API Express completa (ver sección anterior), motor de categorización desde BD, resumen semanal agregado y 16 tests de integración (aislamiento multi-tenant, flujo PIN→ON→registros→OFF, bloqueo por PIN, categorización). Revisión de cierre: tests en verde, aislamiento entre empresas comprobado en vivo (403/404), sin fugas de PIN en respuestas, y simulación de 2 h con agregación exacta (`scripts/simulate-session.ts`).
- **Hecho (Fase B — tercera iteración, revisada el 2026-07-09):** detección de inactividad con aviso previo (§6): `IdleWatcher` en el main sobre `powerMonitor.getSystemIdleTime()` (umbral = `inactivityMinutes` de la empresa, que ahora devuelve el login; cuenta atrás de 60 s), modal "¿Sigues ahí?" en el renderer, pausa retroactiva desde el inicio del aviso si no hay respuesta (durante el aviso se retienen los flushes para poder re-etiquetar el buffer con `isIdle`) y reanudación automática al volver la actividad; la bandeja refleja la pausa. `DP_IDLE_THRESHOLD_SECONDS`/`DP_IDLE_COUNTDOWN_SECONDS` acortan los tiempos en pruebas manuales. Builds empaquetados con electron-builder (`docs/BUILD.md`): DMG/ZIP macOS arm64 y ZIP portable Windows x64 (con binding win32 de get-windows descargado por `desktop/scripts/fetch-win-binding.cjs`), sin firmar. Revisión verificada con dos pruebas E2E contra backend+BD reales: (1) ON → 3 apps → aviso sin respuesta → pausa → reanudación → OFF, con los registros activos categorizados, los de pausa con `is_idle=true` sin categoría y 0 registros activos dentro de la ventana de pausa; (2) corte de red real (proxy TCP) a mitad de sesión: 23/23 registros en BD, sin pérdida ni duplicados.
- **Iteración anterior (Fase B — segunda, el 2026-07-09):** flujo de fichaje completo en `desktop/` sobre Electron + React: configuración por dispositivo (slug de empresa + URL del servidor + intervalo de muestreo 5–10 s, persistida en `userData/config.json`), selección de empleado, PIN tipo cajero (auto-submit, 401 genérico, 429 con cuenta atrás) y ON/OFF con reanudación de sesión al recibir 409 y vuelta a la selección tras OFF (ordenadores compartidos). Arquitectura: main es dueño de config, cliente API, token JWT y tracker; renderer React (Vite) habla solo por IPC tipado (`desktop/src/common/ipc-contract.ts`, sandbox + contextBridge). **Tracking pasivo real** con `get-windows` (sucesor de `active-win`; ESM puro cargado con `import()` dinámico desde el main CJS): app + título + dominio (la URL del navegador —solo macOS— se reduce a hostname en el detector y jamás se guarda; nunca se captura contenido ni teclado). Buffer con espejo en disco (`userData/pending/<sessionId>.json`, escritura atómica) y recuperación en el siguiente turno del empleado si la app se cierra con registros sin subir; lotes cada 60 s troceados a 500 registros (límite de ~100 KB del `express.json()` del backend). Icono de bandeja mientras hay turno abierto (template en macOS, color en Windows) con estado y OFF rápido. En macOS, pantalla guiada de permisos tras el PIN (Grabación de pantalla → título; Accesibilidad → dominio); sin permisos el detector degrada a solo nombre de app (los checks se desactivan por lectura para que el binario no falle ni macOS re-avise). `DP_MOCK_TRACKING=1` mantiene el detector simulado para demos. Falta de Fase B: aviso LOPDGDD de primer uso, firma/notarización de los builds e iconos propios.
- **Hecho (Fase C — el 2026-07-09, integrada el 2026-07-10):** web app de tablet/móvil en `tablet/` (React + Vite, sin Electron): misma pantalla de fichaje que el desktop (configuración por dispositivo con slug + servidor opcional en localStorage, o aprovisionando con `?empresa=<slug>`; selección de empleado; PIN tipo cajero con 429/cuenta atrás) y, tras el ON (`device: TABLET`, reanudación con 409), **selección activa** en vez de tracking pasivo: botones grandes con las categorías de `GET /api/categorias` (siempre de BD, nunca hardcodeadas), cada toque cierra el tramo anterior y abre uno nuevo (resaltado + cronómetro), y el tramo vigente se materializa como muestras cada 5 s con `categoryId` explícito (`tablet/src/lib/sampler.ts`, con relleno retroactivo al despertar de pantalla bloqueada/throttling del navegador). OFF siempre visible con confirmación: sube lo pendiente, cierra la sesión y vuelve a la lista (dispositivo compartido). Buffer con espejo en localStorage y recuperación en el siguiente login del empleado (`tablet/src/lib/pending-store.ts`); lotes de ≤500 cada 60 s, con flush extra al volver la red o la visibilidad. PWA básica: manifest + service worker (shell cacheado; `/api` jamás se cachea) + iconos. El cliente HTTP se movió a `shared/` (lo comparten desktop y tablet). En dev, el proxy de Vite manda `/api` al backend (:3001); en producción falta decidir hosting (ver PENDIENTE). Verificado E2E con Chrome headless contra backend+BD reales: flujo completo con dos tramos, corte de red a mitad (6 registros retenidos y subidos al reconectar, 0 pérdidas/duplicados), registros en BD con la categoría del toque, sesión cerrada, y tests de integración en verde (5 nuevos de selección activa). Falta de Fase C: aviso LOPDGDD de primer uso y filtrado de categorías por rol (no hay relación rol↔categoría en el modelo).
- **Hecho (Fase D — panel admin, revisado el 2026-07-09):** panel de administración completo en `admin/` (React + Vite + Recharts + react-router, responsive, todo en castellano, tema claro sobrio). Login email+contraseña; SUPERADMIN elige empresa en un selector de la cabecera (recordado en localStorage) y CLIENTE ve solo la suya. Pantallas: **Dashboard** (filtro de rango con presets y semana actual por defecto; KPIs de horas activas, coste estimado —con el coste/hora de la empresa—, sin categorizar e inactividad; barras de horas por categoría; apilado por empleado y categoría; evolución semanal de 8 semanas con línea de total + top 3 categorías; y tabla "Sin categorizar / revisar" con acción rápida que abre el alta de regla prellenada y recategoriza el histórico), **Gestión** (CRUD de empleados con reseteo de PIN y baja lógica, roles, reglas —las de sector en solo lectura— y ajustes de empresa: coste/hora, minutos de inactividad y frecuencia de muestreo 5–10 s, campo nuevo `sample_interval_seconds` que también devuelve el login PIN) y **Sesiones** (registro horario filtrable por rango y empleado, con duración/estado y export CSV para Excel es-ES generado en cliente). Backend ampliado con los endpoints de la sección de API y 12 tests de integración nuevos. Los colores de los gráficos siguen a la categoría con una paleta categórica fija de 8 posiciones validada para daltonismo; las etiquetas especiales (sin categorizar, inactivo) van en grises. Verificado E2E contra backend+BD reales con 3 semanas de datos simulados: capturas de todas las pantallas (escritorio y móvil 390 px), creación de regla desde el dashboard con recategorización exacta en BD (solo registros no idle de la empresa) y guardado de ajustes desde la UI. En dev, Vite proxya `/api` al backend local (`DP_API_PROXY` para otro puerto); en producción se usa `VITE_API_URL`.
- **Hecho (Fase D — informes, el 2026-07-10):** generador de borradores de informe (§10) que completa la fase D. Backend: modelo `reports` (migración `add_reports`), servicio de agregación `informe-datos.ts` (reutiliza la estimación por huecos de `resumen.ts`; semanas naturales recortadas al periodo), redacción con la API de Claude en `informe-claude.ts` (SDK oficial `@anthropic-ai/sdk`, modelo Sonnet; el prompt exige elegir las 3 automatizaciones solo de entre las plantillas del sector y estimar el ahorro de cada una con supuestos explícitos) y rutas de la sección de API con el ciclo de estados; 7 tests de integración nuevos (con la llamada a Claude mockeada). Panel: pestaña **Informes** (generar borrador por rango, historial con estados, editor markdown con vista previa, avance de estado siempre manual y export del informe revisado a PDF vía ventana de impresión con diseño de Digital Power — `lib/informe-pdf.ts` + `lib/markdown.ts`, sin dependencias). Verificado sobre la BD real: agregación exacta de las 3 semanas simuladas (98 h / 1.960 €) y flujo completo por HTTP. En la revisión final del MVP (2026-07-10) se generó además un informe real contra la API de Claude con datos fichados ese día (`backend/scripts/verify-informe-real.ts`, que valida la estructura y que las 3 recomendaciones citan plantillas del sector) y se recorrió con él el ciclo completo editar → REVISADO → export a PDF.
- **Deuda técnica y decisiones pendientes:** ver [docs/PENDIENTE.md](docs/PENDIENTE.md).
- La fase E (piloto) está definida en la sección 12 de la especificación.
