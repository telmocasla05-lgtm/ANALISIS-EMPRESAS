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
  lote idempotente. **Más urgente desde 2026-07-09:** el desktop ya reintenta lotes
  (cada 60 s, troceados a 500) y además recupera pendientes desde disco en el
  siguiente turno; un timeout con inserción exitosa duplica de verdad. La tablet
  (Fase C) reintenta igual (buffer en localStorage + recuperación al siguiente login).
- **Timestamps de registros sin validar contra la sesión.** Se acepta cualquier
  timestamp ISO (pasado o futuro, fuera de la ventana ON→OFF). Valorar acotarlos a
  `[startedAt, endedAt]` de la sesión. Ojo: la recuperación de pendientes del desktop
  sube registros legítimos a sesiones **ya cerradas** (con timestamps dentro de la
  ventana original); si se acota, hacerlo por timestamp y no rechazando sesiones
  cerradas.

## Funcional

- **Sin dominio del navegador en Windows.** `get-windows` solo expone la URL de la
  pestaña activa en macOS (vía Apple Events a navegadores conocidos); en Windows no
  hay URL, así que `domain` queda vacío y categorizan las reglas APP/TITLE. Si algún
  cliente Windows necesita dominio de verdad: valorar `@miniben90/x-win` (Rust,
  saca URL también en Windows), UI Automation propia, o una extensión de navegador.
- **Builds sin firmar (2026-07-09: empaquetado hecho, firma pendiente).** macOS
  asocia los permisos TCC (Accesibilidad, Grabación de pantalla) a la firma de la
  app: sin Developer ID + notarización, macOS re-pide los permisos al actualizar
  y Gatekeeper avisa al abrir. En Windows, sin certificado Authenticode salta
  SmartScreen. Ver docs/BUILD.md. macOS 15+ re-pide confirmación periódica de
  Grabación de pantalla: la pantalla guiada reaparece sola tras el PIN cuando el
  permiso cae.
- **Instalador NSIS de Windows no generado en Mac arm64.** El target por defecto
  es ZIP portable (funciona en cualquier máquina de build); el `Setup.exe` exige
  un `makensis` ejecutable (Rosetta 2 en Apple Silicon, makensis nativo, o
  compilar en Windows). Decidir para el piloto si basta el ZIP portable.
- **Icono propio de la app.** Los builds llevan el icono por defecto de Electron;
  faltan `.icns` (Mac) y `.ico` (Windows) con la marca de Digital Power.
- **Aviso LOPDGDD de primer uso** (§7): pendiente en la app de escritorio y en la
  web de tablet.

- **Sesiones huérfanas.** Si el equipo se apaga sin pulsar OFF, la sesión queda abierta
  indefinidamente y el siguiente ON devuelve 409. Falta política de cierre: job que
  cierre sesiones sin registros recientes (usar el `inactivityMinutes` de la empresa)
  y/o cerrar la anterior automáticamente al hacer ON.
- ~~**Selección activa de la tablet (Fase C).**~~ Resuelto el 2026-07-09: el endpoint
  acepta `categoryId` explícito (validado contra las categorías visibles del tenant;
  una ajena da 400) y se salta el motor de reglas. `isIdle` sigue sin categorizarse.
- **Sin detección de inactividad en la tablet.** El tramo activo sigue contando hasta
  el OFF o el siguiente toque, incluso con la pantalla bloqueada (el sampler rellena
  retroactivamente las muestras al despertar: es el contrato de la selección activa).
  Si alguien olvida el OFF, infla las horas de esa categoría — se agrava con la
  política de sesiones huérfanas de arriba. Decidir tope de relleno retroactivo y/o
  aviso tipo "¿sigues en esta tarea?" pasado un umbral.
- **Categorías sin filtrar por rol.** La especificación de la tablet habla de "las
  categorías del rol del empleado", pero el modelo no tiene relación rol↔categoría:
  `GET /api/categorias` devuelve todas las de la empresa + sector (en la Clínica Demo
  son 5, dentro del objetivo de 4-6 botones). Si un cliente real necesita botones
  distintos por rol, añadir la relación al esquema y su CRUD de admin.
- **Hosting de la web de tablet.** En desarrollo el proxy de Vite evita CORS; en
  producción, decidir entre servir el build estático desde el propio backend (mismo
  origen, recomendado) o hosting separado (Vercel) + CORS con lista blanca y
  `serverUrl` configurado en cada dispositivo.
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
- ~~**`.env.test` lleva el usuario de BD de una máquina concreta.**~~ Resuelto el
  2026-07-09: `TEST_DATABASE_URL` sobreescribe la URL del `.env.test` (en
  `vitest.config.ts` y `scripts/test-db-setup.sh`) sin tocar el archivo.
- **Sin logging estructurado.** El error handler hace `console.error` y responde 500
  genérico; en Railway convendrá logging estructurado y algún identificador de request.
- **Sin paginación en los listados admin** (empleados, reglas). Aceptable para el
  tamaño de cliente actual; revisar si algún cliente supera el centenar de filas.
- **El espejo del buffer de la tablet se reescribe entero en cada muestra.** Cada 5 s
  se serializa todo el pendiente a localStorage; irrelevante mientras el flush de 60 s
  lo vacíe, pero con horas sin red son cientos de KB por escritura. Si molesta:
  IndexedDB o persistencia incremental.
- **Constante de muestreo duplicada.** `SAMPLE_CAP_SECONDS = 10` vive en
  `services/resumen.ts` y `scripts/simulate-session.ts` la replica; desde 2026-07-09
  el desktop acota su intervalo configurable a 5–10 s por la misma razón
  (`clampSampleInterval` en `desktop/src/main/config-store.ts`). Tres sitios ya:
  unificar en `shared/` o en configuración por empresa.
