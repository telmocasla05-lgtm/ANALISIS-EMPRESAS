# Guía de despliegue — Railway + Vercel

Guía paso a paso para poner el sistema en producción. Qué va en cada sitio:

| Pieza | Dónde | Resultado |
|---|---|---|
| API backend (Express) | Railway | `https://<backend>.up.railway.app` |
| PostgreSQL | Railway (mismo proyecto) | interna, solo la usa la API |
| Panel admin | Vercel (proyecto 1) | `https://<admin>.vercel.app` |
| Web de tablet | Vercel (proyecto 2) | `https://<tablet>.vercel.app` |
| App de escritorio | Instalador que se lleva a cada equipo | ver [sección 6](#6-app-de-escritorio-instaladores-de-windows-y-mac) |

Los archivos de configuración ya están en el repo y los dos proveedores los
leen solos: [`railway.json`](../railway.json) (build filtrado sin las
dependencias de Electron, comando de arranque, migraciones automáticas antes de
cada deploy y healthcheck) y [`admin/vercel.json`](../admin/vercel.json) /
[`tablet/vercel.json`](../tablet/vercel.json) (install/build desde la raíz del
monorepo y rewrite de SPA). **No hay que configurar comandos de build a mano en
ninguna de las dos webs.**

## 0. Antes de empezar

1. Sube `main` a GitHub (`git push`). Railway y Vercel despliegan desde el repo
   `telmocasla05-lgtm/ANALISIS-EMPRESAS`.
2. Crea cuenta en [railway.com](https://railway.com) y en
   [vercel.com](https://vercel.com) — en ambos, **"Login with GitHub"** con la
   cuenta que tiene acceso al repo.
3. Ten a mano dos valores:
   - **`JWT_SECRET`**: genera uno nuevo en el terminal con
     `openssl rand -hex 32` y cópialo (64 caracteres hex). No reutilices el de
     desarrollo.
   - **`ANTHROPIC_API_KEY`**: crea una clave **nueva** en
     [console.anthropic.com](https://console.anthropic.com) → API Keys (la
     usada en la revisión del 2026-07-10 se compartió por chat y hay que
     rotarla, ver PENDIENTE.md).

## 1. Railway — backend + PostgreSQL

### 1.1 Crear el proyecto con el repo

1. En [railway.com](https://railway.com) pulsa **New Project** →
   **Deploy from GitHub repo**.
2. La primera vez te pedirá instalar la **GitHub App de Railway**: autoriza el
   acceso al repo `ANALISIS-EMPRESAS`.
3. Elige el repo. Railway crea el proyecto con un servicio (el backend).
   **Si te ofrece "Deploy now", espera**: primero las variables (paso 1.3).

### 1.2 Añadir PostgreSQL

1. Dentro del proyecto, botón **+ Create** (o "New") → **Database** →
   **Add PostgreSQL**.
2. Aparece una tarjeta "Postgres" junto a la del backend. No hay nada más que
   configurar en ella.

### 1.3 Variables de entorno del backend

Clic en la tarjeta del **servicio del backend** → pestaña **Variables** →
**New Variable** (o el editor "Raw Editor" para pegarlas todas). Añade:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — tal cual, con las llaves: es una referencia al Postgres del proyecto (si renombraste el servicio de BD, usa ese nombre en lugar de `Postgres`) |
| `JWT_SECRET` | el valor generado con `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | la clave nueva de la consola de Anthropic |
| `NIXPACKS_NODE_VERSION` | `22` |
| `CORS_ORIGINS` | déjala **sin crear** por ahora — se añade en el paso 4, cuando existan los dominios de Vercel |

**No definas `PORT`**: Railway la inyecta automáticamente y el backend la lee.

### 1.4 Primer deploy

1. Con las variables guardadas, pulsa **Deploy** (Railway muestra un aviso de
   cambios sin aplicar arriba; si ya había arrancado un deploy sin variables y
   falló, no pasa nada: se relanza solo al aplicar, o usa
   **Deployments → Redeploy**).
2. En la pestaña **Deployments** puedes seguir los logs. Orden de un deploy:
   install → build → **pre-deploy** (ejecuta `prisma migrate deploy`, es decir,
   **las migraciones se aplican solas en cada deploy, también la primera vez**)
   → healthcheck a `/api/health` (comprueba API y conexión a BD) → activo.

### 1.5 Dominio público de la API

1. Servicio del backend → **Settings** → sección **Networking** →
   **Generate Domain** (acepta el puerto que propone).
2. Copia el dominio resultante, p. ej. `https://analisis-empresas-production.up.railway.app`.
   **Esta es la URL del servidor** para el panel, la tablet y la app de
   escritorio. En esta guía la llamamos `<URL-BACKEND>`.
3. Comprueba en el navegador `<URL-BACKEND>/api/health` → debe responder
   `{"ok":true}`.

### 1.6 Datos iniciales (seed) — solo la primera vez

La BD nace vacía y **sin usuarios admin no se puede entrar al panel** (el alta
de empresas/admins aún es solo por seed, ver PENDIENTE.md). Para cargar la
Clínica Demo:

1. En Railway, clic en la tarjeta **Postgres** → pestaña **Data** (o
   "Connect") → copia la cadena de conexión de **Public Network** (formato
   `postgresql://postgres:...@...proxy.rlwy.net:PUERTO/railway`).
2. En tu Mac, desde la raíz del repo:

   ```bash
   DATABASE_URL="postgresql://postgres:...rlwy.net:PUERTO/railway" \
     npm run db:seed --workspace @digital-power/backend
   ```

   (Si diera error de SSL, añade `?sslmode=require` al final de la URL.)
3. Quedan creados: empresa `clinica-demo`, `superadmin@digitalpower.dev` /
   `digitalpower`, `admin@clinicademo.dev` / `clinicademo` y empleados con
   PINs `1234/2345/4567/3456`.

> ⚠️ Estas credenciales están en el repo y valen para el **piloto interno**.
> Antes de meter datos de un cliente real: cambiar las contraseñas (hoy, por
> BD) y rotar `JWT_SECRET`.

## 2. Vercel — panel admin

1. En [vercel.com/new](https://vercel.com/new) → **Import Git Repository** →
   elige `ANALISIS-EMPRESAS` (la primera vez, instala la GitHub App de Vercel
   con acceso al repo).
2. En la pantalla **Configure Project**:
   - **Project Name**: `dp-admin` (o el que quieras — decide el dominio
     `dp-admin.vercel.app`).
   - **Root Directory**: pulsa **Edit** y selecciona la carpeta **`admin`**.
     Este es el paso clave.
   - **Framework Preset**: déjalo como lo detecte (Vite); manda el
     `admin/vercel.json` del repo.
   - **Build and Output Settings**: no tocar.
   - **Environment Variables**: añade
     - Nombre: `VITE_API_URL` · Valor: `<URL-BACKEND>` (la de Railway del paso
       1.5, **con `https://`, sin barra final y sin `/api`**, p. ej.
       `https://analisis-empresas-production.up.railway.app`).
3. Pulsa **Deploy** y espera al build.
4. Apunta el dominio que asigna (visible en el dashboard del proyecto, tipo
   `https://dp-admin.vercel.app`). Lo necesitas para el paso 4.

> `VITE_API_URL` se incrusta en el build. Si algún día cambia la URL del
> backend: Settings → Environment Variables → editar → y **Deployments →
> ⋯ → Redeploy** para que se aplique.

## 3. Vercel — web de tablet

Igual que el panel, como **segundo proyecto** sobre el mismo repo:

1. [vercel.com/new](https://vercel.com/new) → importa **otra vez** el repo
   `ANALISIS-EMPRESAS`.
2. **Project Name**: `dp-tablet` · **Root Directory**: **`tablet`** ·
   variable `VITE_API_URL` = `<URL-BACKEND>` (idéntica al paso 2).
3. **Deploy** y apunta el dominio (`https://dp-tablet.vercel.app`).

Para estrenar una tablet: abrir en su navegador
`https://dp-tablet.vercel.app/?empresa=clinica-demo` (queda aprovisionada con
la empresa; el servidor ya viene de `VITE_API_URL`) y usar **"Añadir a
pantalla de inicio"** para instalarla como PWA a pantalla completa.

## 4. Cerrar CORS en Railway (con los dominios reales)

Hasta ahora la API acepta llamadas desde cualquier web. Con los dos dominios
de Vercel ya conocidos:

1. Vuelve a Railway → servicio del backend → **Variables** → **New Variable**:
   - `CORS_ORIGINS` = `https://dp-admin.vercel.app,https://dp-tablet.vercel.app`
     (tus dominios reales, separados por coma, con `https://` y sin barra
     final).
2. Aplica los cambios (Railway redespliega).

Desde ese momento los navegadores solo pueden llamar a la API desde esos dos
dominios. La app de escritorio no se ve afectada (no envía cabecera `Origin`),
y `curl`/healthchecks tampoco.

## 5. Comprobación final

- [ ] `<URL-BACKEND>/api/health` responde `{"ok":true}`.
- [ ] En `https://dp-admin.vercel.app`: login con `superadmin@digitalpower.dev`
      / `digitalpower`, se ve la Clínica Demo y el dashboard carga (vacío al
      principio).
- [ ] En `https://dp-tablet.vercel.app/?empresa=clinica-demo`: aparece la lista
      de empleados; fichar ON con PIN `1234`, tocar una categoría un par de
      minutos y OFF.
- [ ] En el panel, **Sesiones** muestra esa sesión y el **Dashboard** las horas
      de la categoría tocada.
- [ ] (Opcional) **Informes** → generar un borrador del día — valida la
      `ANTHROPIC_API_KEY` de producción.
- [ ] En los **Deploy Logs** de Railway se ven las peticiones
      (`GET /api/... 200 12ms`).

## 6. App de escritorio: instaladores de Windows y Mac

La app de escritorio no se "despliega": se genera un instalador y se lleva a
cada equipo. El detalle completo del build está en [BUILD.md](BUILD.md); el
resumen:

```bash
# desde la raíz del repo, con dependencias instaladas y shared compilado
npm run dist:mac --workspace @digital-power/desktop   # → desktop/release/…-arm64.dmg (+ .zip)
npm run dist:win --workspace @digital-power/desktop   # → desktop/release/…-win.zip (portable x64)
```

- El `.dmg` de Mac se abre y se arrastra la app a Aplicaciones; el `.zip` de
  Windows se descomprime y se ejecuta `Digital Power Fichaje.exe` (el
  `Setup.exe` NSIS también es posible — ver BUILD.md).
- **Primer arranque en cada equipo**: la pantalla de configuración pide la URL
  del servidor → `<URL-BACKEND>` (la de Railway) y el identificador de empresa
  → `clinica-demo`. En Mac, después del PIN, la app guía los permisos de
  Grabación de pantalla y Accesibilidad.

### Qué es el code signing (pendiente de comprar, no bloquea el piloto interno)

La firma de código es un certificado que identifica criptográficamente al
autor de la app; el sistema operativo la comprueba al instalar/abrir:

- **macOS (Gatekeeper)**: sin firma + notarización de Apple, al abrir la app
  avisa de "desarrollador no identificado". Además, los permisos TCC
  (Accesibilidad, Grabación de pantalla) se asocian a la firma: sin firma
  estable, macOS los vuelve a pedir con cada actualización de la app.
- **Windows (SmartScreen)**: sin certificado, al ejecutar sale "Windows
  protegió su PC".

**Qué hay que comprar** (cuando toque, antes del piloto con cliente real):

| Plataforma | Qué | Dónde / coste orientativo |
|---|---|---|
| macOS | Apple Developer Program (incluye el certificado "Developer ID Application" y la notarización) | developer.apple.com — 99 USD/año |
| Windows | Certificado de firma de código (Authenticode) OV o EV | Sectigo, SSL.com, DigiCert… — ~200–500 €/año (el EV quita el aviso de SmartScreen desde el primer día; el OV va ganando reputación) |

**Cómo se integra cuando existan los certificados**: electron-builder los
recoge por variables de entorno al ejecutar `dist:mac`/`dist:win` —
`CSC_LINK`/`CSC_KEY_PASSWORD` (certificado), y para la notarización de Apple
`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`. No hay que cambiar
código; solo añadir esas variables y regenerar los instaladores.

**Mientras tanto (builds sin firmar, piloto interno)**:

- Mac: la primera vez, **clic derecho sobre la app → Abrir → Abrir** (el doble
  clic normal la bloquea). Si macOS la pone en cuarentena igualmente:
  `xattr -dr com.apple.quarantine "/Applications/Digital Power Fichaje.app"`.
- Windows: en el aviso de SmartScreen → **Más información** → **Ejecutar de
  todas formas**.

## 7. Despliegues siguientes

- **Todo se redespliega solo con `git push` a `main`**: Railway reconstruye el
  backend (aplicando migraciones nuevas en el pre-deploy) y Vercel reconstruye
  panel y tablet. No hay que volver a tocar nada de esta guía.
- Rollback: en Railway, **Deployments → ⋯ → Redeploy** sobre un deploy anterior;
  en Vercel, **Deployments → ⋯ → Promote to Production** sobre uno anterior.
- Si un deploy de Railway falla en el healthcheck o en las migraciones, **el
  deploy anterior sigue activo** (no hay corte de servicio).

## Problemas conocidos

- **El build de Vercel falla con "workspace not found" o similar**: comprueba
  en Settings → General → Root Directory que está `admin` (o `tablet`) y que la
  opción *"Include source files outside of the Root Directory"* está activada
  (viene activada por defecto; el install/build necesitan la raíz del monorepo).
- **El panel carga pero el login falla con error de red/CORS**: revisa que
  `CORS_ORIGINS` en Railway contiene exactamente el dominio del panel (con
  `https://`, sin barra final) y que `VITE_API_URL` del proyecto de Vercel
  apunta al dominio de Railway (sin `/api`). Tras cambiar `VITE_API_URL`, hay
  que redesplegar en Vercel.
- **El healthcheck de Railway falla** (`/api/health` → 503): la API no llega a
  la BD — revisa que `DATABASE_URL` es la referencia `${{Postgres.DATABASE_URL}}`
  y que el servicio Postgres está en verde.
