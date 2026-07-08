# Deuda técnica y decisiones pendientes

Estado a cierre de la Fase A (revisión del 2026-07-08). Nada de esta lista bloquea
las fases B–D, pero conviene resolver los puntos de seguridad antes del piloto (Fase E).

## Seguridad y robustez

- **Rate limiting global ausente.** El bloqueo por PIN (5 fallos → 5 min) es por
  empleado, pero `GET /api/empresas/:slug/empleados` expone los IDs de empleado y no
  hay límite por IP: un atacante puede rotar entre empleados. Añadir `express-rate-limit`
  (mínimo en `/api/auth/pin` y `/api/admin/auth/login`) antes del piloto.
- **CORS abierto.** `app.use(cors())` acepta cualquier origen. En producción, lista
  blanca con los dominios del panel admin y de la web de tablet (la app Electron no
  necesita CORS).
- **Sin cabeceras de seguridad** (`helmet` o equivalente).
- **Tokens JWT sin revocación.** El token de empleado dura 16 h y el de admin 12 h;
  si se filtra uno no hay forma de invalidarlo (no hay lista de revocación ni refresh).
  Decidir si es aceptable para el piloto o si se acorta el TTL de admin.
- **Ingesta de registros sin idempotencia.** Si la app de escritorio reenvía un lote
  tras un timeout (reintento), los registros se duplican y el resumen infla las horas.
  Opciones: índice único `(session_id, timestamp)` con `skipDuplicates`, o un id de
  lote idempotente. Decidir al construir el cliente desktop (Fase B).
- **Timestamps de registros sin validar contra la sesión.** Se acepta cualquier
  timestamp ISO (pasado o futuro, fuera de la ventana ON→OFF). Valorar acotarlos a
  `[startedAt, endedAt]` de la sesión.

## Funcional

- **Sesiones huérfanas.** Si el equipo se apaga sin pulsar OFF, la sesión queda abierta
  indefinidamente y el siguiente ON devuelve 409. Falta política de cierre: job que
  cierre sesiones sin registros recientes (usar el `inactivityMinutes` de la empresa)
  y/o cerrar la anterior automáticamente al hacer ON.
- **Selección activa de la tablet (Fase C).** `POST /sesiones/:id/registros` está
  pensado para tracking pasivo (app/domain/título → motor de reglas). La tablet manda
  la categoría elegida directamente: decidir si el endpoint acepta `categoryId`
  explícito o si se modela con una convención de `app` reservada.
- **Alta de empresas y admins solo por seed/BD.** No hay API para crear empresas ni
  usuarios admin: para dar de alta un cliente real hay que tocar la BD. Necesario un
  CRUD de empresas para SUPERADMIN antes de operar con más de un cliente.
- **Zona horaria del resumen.** La semana del resumen es la natural en UTC. Para
  clientes en España, decidir si se calcula en `Europe/Madrid` (previsiblemente sí) y
  si la TZ es configurable por empresa.
- **Informes con la API de Claude y plantillas de automatización.** Las tablas existen
  (`automation_templates`) pero no hay endpoints ni generación de borradores todavía
  (previsto para la fase de admin/informes).

## Infraestructura y DX

- **`prisma generate` no es automático.** Tras un pull con cambios de esquema, el
  cliente generado (`src/generated/prisma`, ignorado por git) queda desactualizado y
  los tests fallan con errores confusos (pasó en esta revisión). Añadir `postinstall`
  en el backend que ejecute `prisma generate`.
- **`shared` requiere build manual.** El backend importa `@digital-power/shared` desde
  `dist/`, que no existe hasta ejecutar su build (pasó en esta revisión: typecheck roto
  tras clonar). Valorar compilar `shared` en `postinstall` o pasar a project references.
- **`.env.test` lleva el usuario de BD de esta máquina** (`pellotellechea`). Para CI o
  para otro desarrollador hay que parametrizarlo (p. ej. `TEST_DATABASE_URL` con
  fallback).
- **Sin logging estructurado.** El error handler hace `console.error` y responde 500
  genérico; en Railway convendrá logging estructurado y algún identificador de request.
- **Sin paginación en los listados admin** (empleados, reglas). Aceptable para el
  tamaño de cliente actual; revisar si algún cliente supera el centenar de filas.
- **Constante de muestreo duplicada.** `SAMPLE_CAP_SECONDS = 10` vive en
  `services/resumen.ts` y `scripts/simulate-session.ts` la replica. Cuando la Fase B
  fije el intervalo real de muestreo del desktop (5–10 s), unificar en `shared/` o en
  configuración por empresa.
