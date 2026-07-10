# Deuda técnica y decisiones pendientes

Estado a cierre de la revisión final del MVP (2026-07-10, con las fases A–D
completas). Nada de esta lista bloquea el desarrollo, pero los puntos marcados
como **[bloquea piloto]** deben resolverse antes de poner el sistema delante de
un cliente real (Fase E).

## Imprescindible antes del piloto (resumen)

1. **[bloquea piloto]** Rate limiting por IP en `/api/auth/pin` y `/api/admin/auth/login`
   (el login admin no tiene hoy *ningún* freno — ver Seguridad).
2. **[bloquea piloto]** Cabeceras de seguridad (`helmet`). ~~CORS con lista
   blanca~~ hecho el 2026-07-10 (`CORS_ORIGINS`, ver docs/DEPLOY.md).
3. **[bloquea piloto]** Idempotencia de la ingesta de registros (los reintentos del
   desktop/tablet pueden duplicar horas).
4. ~~`ANTHROPIC_API_KEY` válida en el backend y un informe real generado y
   revisado de principio a fin.~~ Hecho el 2026-07-10 (rotar la clave antes del
   piloto — ver Funcional).
5. **[bloquea piloto]** Firma/notarización de los builds de escritorio y aviso
   LOPDGDD de primer uso (desktop y tablet).
6. Decidir política de sesiones huérfanas, zona horaria de los resúmenes y CRUD
   de empresas para SUPERADMIN (ver secciones). ~~Hosting de la web de tablet~~
   decidido el 2026-07-10: Vercel (ver docs/DEPLOY.md).

## Seguridad y robustez

- **Rate limiting global ausente.** El bloqueo por PIN (5 fallos → 5 min) es por
  empleado, pero `GET /api/empresas/:slug/empleados` expone los IDs de empleado y no
  hay límite por IP: un atacante puede rotar entre empleados. **Peor aún — verificado
  en vivo el 2026-07-10:** el login del panel (`/api/admin/auth/login`) no tiene ni
  bloqueo por usuario ni límite por IP (8 intentos fallidos seguidos → ocho 401 sin
  freno), así que las contraseñas de admin son atacables por fuerza bruta sin
  restricción. Añadir `express-rate-limit` (mínimo en `/api/auth/pin` y
  `/api/admin/auth/login`) antes del piloto.
- ~~**CORS abierto.**~~ Resuelto el 2026-07-10: con `CORS_ORIGINS` definido (lista de
  orígenes separados por comas — en producción, los dominios de Vercel del panel y la
  tablet) solo se aceptan esos orígenes; sin definir sigue abierto (solo desarrollo).
  Las peticiones sin cabecera `Origin` (app Electron, curl) no pasan por CORS.
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
- ~~**Hosting de la web de tablet.**~~ Decidido el 2026-07-10: Vercel (proyecto
  separado del panel) + CORS con lista blanca (`CORS_ORIGINS`); el `serverUrl` por
  defecto de cada dispositivo sale del build (`VITE_API_URL`), sin configuración
  manual. Ver docs/DEPLOY.md.
- **Alta de empresas y admins solo por seed/BD.** No hay API para crear empresas ni
  usuarios admin: para dar de alta un cliente real hay que tocar la BD. Necesario un
  CRUD de empresas para SUPERADMIN antes de operar con más de un cliente.
- **Zona horaria del resumen.** La semana y los rangos `desde/hasta` del resumen son
  días naturales en UTC (el panel también los manda así). Para clientes en España,
  decidir si se calcula en `Europe/Madrid` (previsiblemente sí) y si la TZ es
  configurable por empresa. Ojo: el panel muestra las horas de las sesiones en la TZ
  local del navegador, así que una sesión cerca de medianoche puede caer en el día
  UTC anterior al filtrar.
- ~~**Validar la generación de informes contra la API real de Claude.**~~ Resuelto
  el 2026-07-10 (revisión final del MVP): con una `ANTHROPIC_API_KEY` real en
  `backend/.env` se generó un informe de verdad sobre los datos fichados ese día
  (42 s, `claude-sonnet-5`) y se recorrió con él el ciclo completo editar →
  REVISADO → export a PDF. Para repetir la comprobación en otra máquina o tras
  cambios en el prompt: `npx tsx scripts/verify-informe-real.ts --guardar` (desde
  `backend/`, con datos fichados en el día o pasando `--desde/--hasta`) — valida
  la estructura y que las 3 recomendaciones citen plantillas del sector, y deja
  el borrador en BD para revisarlo en el panel. Ojo: la clave usada se compartió
  por chat durante la revisión; conviene rotarla desde la consola de Anthropic
  antes del piloto (crear una nueva y borrar la antigua, sin coste).
- **Fechas del periodo del informe con +1 día en el panel (TZ).** El backend
  guarda el periodo en días UTC y devuelve `hasta` como fin de día UTC
  (`23:59:59.999Z`); el panel y el PDF lo formatean con `fmtFecha` en la zona
  horaria local, así que en España (UTC+1/+2) el "hasta" se muestra un día más
  tarde (visto en la revisión del 2026-07-10: periodo de un solo día mostrado
  como "10 jul – 11 jul"). Mismo fondo que el punto de zona horaria de abajo:
  formatear esas fechas con `timeZone: 'UTC'` (como ya hace el título que genera
  el backend) o decidir la TZ de negocio de una vez.
- **La frecuencia de muestreo por empresa aún no la consume el desktop.** Desde el
  2026-07-09 existe `companies.sample_interval_seconds` (editable en el panel, 5–10 s)
  y el login PIN la devuelve (`sampleIntervalSeconds`), pero la app de escritorio sigue
  usando el intervalo de su `config.json` local. Decidir la precedencia (¿el valor del
  servidor pisa el del dispositivo?) y aplicarla en el main del desktop.

## Infraestructura y DX

- ~~**`prisma generate` no es automático.**~~ Resuelto el 2026-07-10: `postinstall`
  en el backend ejecuta `prisma generate` en cada `npm install` (también en el build
  de Railway). Sigue haciendo falta `npm run db:migrate` tras un pull con migraciones
  nuevas.
- **`shared` requiere build manual.** El backend importa `@digital-power/shared` desde
  `dist/`, que no existe hasta ejecutar su build (pasó en esta revisión: typecheck roto
  tras clonar). Valorar compilar `shared` en `postinstall` o pasar a project references.
- ~~**`.env.test` lleva el usuario de BD de una máquina concreta.**~~ Resuelto el
  2026-07-09: `TEST_DATABASE_URL` sobreescribe la URL del `.env.test` (en
  `vitest.config.ts` y `scripts/test-db-setup.sh`) sin tocar el archivo.
- **Sin logging estructurado.** Desde el 2026-07-10 hay log de una línea por petición
  (método, ruta, status, duración; el healthcheck se omite) y el error handler incluye
  método/ruta junto al stack, suficiente para leer los Deploy Logs de Railway. Sigue
  pendiente: logs JSON estructurados e identificador de request si hace falta correlar.
- **Sin paginación en los listados admin** (empleados, reglas, sesiones — estas
  últimas con tope de 1000 filas por respuesta). Aceptable para el tamaño de cliente
  actual; revisar si algún cliente supera el centenar de filas o el tope de sesiones
  en un rango largo.
- **El espejo del buffer de la tablet se reescribe entero en cada muestra.** Cada 5 s
  se serializa todo el pendiente a localStorage; irrelevante mientras el flush de 60 s
  lo vacíe, pero con horas sin red son cientos de KB por escritura. Si molesta:
  IndexedDB o persistencia incremental.
- **Constante de muestreo duplicada.** `SAMPLE_CAP_SECONDS = 10` vive en
  `services/resumen.ts` y `scripts/simulate-session.ts` la replica; desde 2026-07-09
  el desktop acota su intervalo configurable a 5–10 s por la misma razón
  (`clampSampleInterval` en `desktop/src/main/config-store.ts`) y el panel valida
  los ajustes de empresa con el mismo rango 5–10. Unificar la constante en `shared/`.
